import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Payment, PaymentStatus, SubscriptionPackage } from '@/types/database';

interface PaymentWithUser extends Payment {
  profile?: {
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
  package?: SubscriptionPackage | null;
}

interface UsePaymentsOptions {
  status?: PaymentStatus;
  limit?: number;
  page?: number;
  userId?: string; // Optional: filter by user for user-side view
}

interface SubmitPaymentOptions {
  packageId?: string | null;
  currency?: string;
}

export const usePayments = (options: UsePaymentsOptions = {}) => {
  const { status, limit = 20, page = 1, userId } = options;
  const [payments, setPayments] = useState<PaymentWithUser[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const requestSeqRef = useRef(0);

  const dedupeStripeFirstChargeRows = useCallback((rows: Payment[]): Payment[] => {
    if (!rows.length) return rows;

    const duplicateCheckoutIds = new Set<string>();

    const isCloseAmount = (a?: number | null, b?: number | null) =>
      Math.abs(Number(a || 0) - Number(b || 0)) < 0.00001;

    const isWithinOneDay = (a?: string | null, b?: string | null) => {
      if (!a || !b) return false;
      const deltaSec = Math.abs(
        (new Date(a).getTime() - new Date(b).getTime()) / 1000
      );
      return Number.isFinite(deltaSec) && deltaSec <= 24 * 60 * 60;
    };

    for (const checkoutRow of rows) {
      if (
        checkoutRow.provider !== "stripe" ||
        !checkoutRow.provider_session_id ||
        checkoutRow.provider_payment_id ||
        !checkoutRow.provider_subscription_id
      ) {
        continue;
      }

      const hasMatchingInvoiceRow = rows.some(
        (invoiceRow) =>
          invoiceRow.id !== checkoutRow.id &&
          invoiceRow.provider === "stripe" &&
          invoiceRow.user_id === checkoutRow.user_id &&
          invoiceRow.provider_subscription_id === checkoutRow.provider_subscription_id &&
          !!invoiceRow.provider_payment_id &&
          invoiceRow.currency === checkoutRow.currency &&
          isCloseAmount(invoiceRow.amount, checkoutRow.amount) &&
          isWithinOneDay(invoiceRow.created_at, checkoutRow.created_at)
      );

      if (hasMatchingInvoiceRow) {
        duplicateCheckoutIds.add(checkoutRow.id);
      }
    }

    if (!duplicateCheckoutIds.size) return rows;
    return rows.filter((row) => !duplicateCheckoutIds.has(row.id));
  }, []);

  const fetchPayments = useCallback(async () => {
    const requestId = ++requestSeqRef.current;
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
      if (requestId !== requestSeqRef.current) return;
      setTotalCount(count || 0);

      // Get payments
      const offset = (page - 1) * limit;

      let query = supabase
        .from('payments')
        .select('*, subscription_packages(*)')
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

      const normalizedPaymentsData = dedupeStripeFirstChargeRows(
        ((paymentsData || []) as Payment[])
      );

      // Fallback package resolution for legacy rows where payments.package_id is null
      // but subscriptions.payment_id links to a package.
      const fallbackPackageByPaymentId = new Map<string, SubscriptionPackage>();
      const unresolvedPaymentIds = normalizedPaymentsData
        .filter((payment) => {
          const raw = (payment as any).subscription_packages;
          const joinedPkg = raw != null ? (Array.isArray(raw) ? raw[0] : raw) : null;
          return !joinedPkg;
        })
        .map((payment) => payment.id);

      if (unresolvedPaymentIds.length > 0) {
        const { data: subRows } = await supabase
          .from('subscriptions')
          .select('payment_id, package_id')
          .in('payment_id', unresolvedPaymentIds)
          .not('package_id', 'is', null);

        const paymentToPackageId = new Map<string, string>();
        for (const row of subRows || []) {
          if (row.payment_id && row.package_id) {
            paymentToPackageId.set(row.payment_id, row.package_id);
          }
        }

        const packageIds = Array.from(new Set(Array.from(paymentToPackageId.values())));
        if (packageIds.length > 0) {
          const { data: pkgRows } = await supabase
            .from('subscription_packages')
            .select('*')
            .in('id', packageIds);

          const packageById = new Map<string, SubscriptionPackage>();
          for (const pkg of pkgRows || []) {
            packageById.set(pkg.id, pkg as SubscriptionPackage);
          }

          for (const [paymentId, packageId] of paymentToPackageId.entries()) {
            const pkg = packageById.get(packageId);
            if (pkg) fallbackPackageByPaymentId.set(paymentId, pkg);
          }
        }
      }

      // Fetch user profiles for these payments (only for admin view)
      if (!userId && normalizedPaymentsData.length > 0) {
        const userIds = normalizedPaymentsData.map(p => p.user_id);

        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, email, first_name, last_name')
          .in('user_id', userIds);

        const profilesMap = new Map(
          (profilesData || []).map(p => [p.user_id, p])
        );

        const paymentsWithUsers = normalizedPaymentsData.map(payment => {
          const raw = (payment as any).subscription_packages;
          const pkg = raw != null
            ? (Array.isArray(raw) ? raw[0] : raw) as SubscriptionPackage | null
            : null;
          return {
            ...payment,
            status: payment.status as PaymentStatus,
            profile: profilesMap.get(payment.user_id),
            package: pkg ?? fallbackPackageByPaymentId.get(payment.id) ?? null,
          };
        }) as PaymentWithUser[];

        if (requestId !== requestSeqRef.current) return;
        setPayments(paymentsWithUsers);
      } else {
        const paymentsWithStatus = normalizedPaymentsData.map(payment => {
          const raw = (payment as any).subscription_packages;
          const pkg = raw != null
            ? (Array.isArray(raw) ? raw[0] : raw) as SubscriptionPackage | null
            : null;
          return {
            ...payment,
            status: payment.status as PaymentStatus,
            package: pkg ?? fallbackPackageByPaymentId.get(payment.id) ?? null,
          };
        }) as PaymentWithUser[];
        if (requestId !== requestSeqRef.current) return;
        setPayments(paymentsWithStatus);
      }

      if (requestId !== requestSeqRef.current) return;
      setError(null);
    } catch (err) {
      if (requestId !== requestSeqRef.current) return;
      setError(err as Error);
      console.error('Error fetching payments:', err);
    } finally {
      if (requestId === requestSeqRef.current) {
        setIsLoading(false);
      }
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

    // Get the payment (with linked package) to determine subscription details
    const payment = payments.find(p => p.id === paymentId);
    if (payment) {
      const now = new Date();
      let expiresAt: string | null = null;

      if (payment.package) {
        if (payment.package.duration_type === 'lifetime') {
          expiresAt = null;
        } else {
          const months =
            payment.package.duration_months ||
            (payment.package.duration_type === 'yearly' ? 12 : 1);
          const expiry = new Date(now);
          expiry.setMonth(expiry.getMonth() + months);
          expiresAt = expiry.toISOString();
        }
      } else {
        // Fallback: preserve previous 1‑month semantics if no package is linked
        const expiry = new Date(now);
        expiry.setMonth(expiry.getMonth() + 1);
        expiresAt = expiry.toISOString();
      }

      await supabase
        .from('subscriptions')
        .upsert({
          user_id: payment.user_id,
          status: 'active',
          starts_at: now.toISOString(),
          expires_at: expiresAt,
          updated_at: now.toISOString(),
          package_id: payment.package_id ?? null,
          payment_id: payment.id,
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

  const submitPayment = async (
    userId: string,
    txHash: string,
    amount: number,
    paymentMethod: string = 'usdt_trc20',
    options: SubmitPaymentOptions = {}
  ) => {
    const { packageId = null, currency = 'USD' } = options;
    const { data, error } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        tx_hash: txHash,
        amount,
        currency,
        status: 'pending',
        payment_method: paymentMethod,
        package_id: packageId,
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
