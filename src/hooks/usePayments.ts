import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Payment, PaymentStatus } from '@/types/database';

interface PaymentWithUser extends Payment {
  profile?: {
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
}

interface UsePaymentsOptions {
  status?: PaymentStatus;
  limit?: number;
  page?: number;
  userId?: string; // Optional: filter by user for user-side view
}

export const usePayments = (options: UsePaymentsOptions = {}) => {
  const { status, limit = 20, page = 1, userId } = options;
  const [payments, setPayments] = useState<PaymentWithUser[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchPayments = useCallback(async () => {
    setIsLoading(true);
    try {
      // Get count
      let countQuery = supabase
        .from('payments')
        .select('id', { count: 'exact', head: true });

      if (status) {
        countQuery = countQuery.eq('status', status);
      }
      if (userId) {
        countQuery = countQuery.eq('user_id', userId);
      }

      const { count } = await countQuery;
      setTotalCount(count || 0);

      // Get payments
      const offset = (page - 1) * limit;
      
      let query = supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) {
        query = query.eq('status', status);
      }
      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: paymentsData, error: paymentsError } = await query;

      if (paymentsError) throw paymentsError;

      // Fetch user profiles for these payments (only for admin view)
      if (!userId && paymentsData && paymentsData.length > 0) {
        const userIds = paymentsData.map(p => p.user_id);
        
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, email, first_name, last_name')
          .in('user_id', userIds);

        const profilesMap = new Map(
          (profilesData || []).map(p => [p.user_id, p])
        );

        const paymentsWithUsers = paymentsData.map(payment => ({
          ...payment,
          status: payment.status as PaymentStatus,
          profile: profilesMap.get(payment.user_id),
        })) as PaymentWithUser[];

        setPayments(paymentsWithUsers);
      } else {
        const paymentsWithStatus = (paymentsData || []).map(payment => ({
          ...payment,
          status: payment.status as PaymentStatus,
        })) as PaymentWithUser[];
        setPayments(paymentsWithStatus);
      }
      
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching payments:', err);
    } finally {
      setIsLoading(false);
    }
  }, [status, limit, page, userId]);

  // Set up real-time subscription
  useEffect(() => {
    fetchPayments();

    // Create unique channel name to prevent conflicts
    const channelName = `payments-realtime-${userId || 'admin'}-${Math.random().toString(36).substring(7)}`;
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
          ...(userId ? { filter: `user_id=eq.${userId}` } : {}),
        },
        (payload) => {
          console.log('Payment realtime update:', payload);
          // Refetch to get updated data with user profiles
          fetchPayments();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchPayments, userId]);

  const verifyPayment = async (paymentId: string, adminId: string) => {
    const { error } = await supabase
      .from('payments')
      .update({
        status: 'verified',
        verified_by: adminId,
        verified_at: new Date().toISOString(),
      })
      .eq('id', paymentId);

    if (error) throw error;

    // Get the payment to find user_id
    const payment = payments.find(p => p.id === paymentId);
    if (payment) {
      // Activate subscription - use upsert to handle missing subscription records
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      await supabase
        .from('subscriptions')
        .upsert({
          user_id: payment.user_id,
          status: 'active',
          starts_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    }

    // Real-time will handle the refresh
  };

  const rejectPayment = async (paymentId: string, reason: string) => {
    const { error } = await supabase
      .from('payments')
      .update({
        status: 'rejected',
        rejection_reason: reason,
      })
      .eq('id', paymentId);

    if (error) throw error;
    // Real-time will handle the refresh
  };

  const submitPayment = async (userId: string, txHash: string, amount: number) => {
    const { data, error } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        tx_hash: txHash,
        amount,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  };

  const totalPages = Math.ceil(totalCount / limit);

  return { 
    payments, 
    isLoading, 
    error, 
    refetch: fetchPayments, 
    verifyPayment, 
    rejectPayment,
    submitPayment,
    totalCount,
    totalPages,
  };
};
