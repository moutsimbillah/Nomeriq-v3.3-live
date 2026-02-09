import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AdminStats {
  totalUsers: number;
  activeSubscriptions: number;
  pendingPayments: number;
  activeSignals: number;
  totalSignals: number;
  winRate: number;
  monthlyRevenue: number;
  globalRisk: number;
}

export const useAdminStats = () => {
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    activeSubscriptions: 0,
    pendingPayments: 0,
    activeSignals: 0,
    totalSignals: 0,
    winRate: 0,
    monthlyRevenue: 0,
    globalRisk: 2,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch all data in parallel
        const [
          usersResult,
          subscriptionsResult,
          paymentsResult,
          signalsResult,
          settingsResult,
        ] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('subscriptions').select('id, status'),
          supabase.from('payments').select('id, status, amount, created_at'),
          supabase.from('signals').select('id, status'),
          supabase.from('global_settings').select('global_risk_percent').limit(1).maybeSingle(),
        ]);

        const totalUsers = usersResult.count || 0;
        
        const activeSubscriptions = (subscriptionsResult.data || []).filter(
          s => s.status === 'active'
        ).length;
        
        const pendingPayments = (paymentsResult.data || []).filter(
          p => p.status === 'pending'
        ).length;

        // Calculate monthly revenue (verified payments in current month)
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthlyRevenue = (paymentsResult.data || [])
          .filter(p => 
            p.status === 'verified' && 
            new Date(p.created_at) >= startOfMonth
          )
          .reduce((sum, p) => sum + p.amount, 0);

        const signals = signalsResult.data || [];
        const activeSignals = signals.filter(s => s.status === 'active').length;
        const totalSignals = signals.length;
        
        // Calculate win rate from closed signals
        const closedSignals = signals.filter(s => s.status === 'tp_hit' || s.status === 'sl_hit');
        const wins = signals.filter(s => s.status === 'tp_hit').length;
        const winRate = closedSignals.length > 0 
          ? Math.round((wins / closedSignals.length) * 100) 
          : 0;

        const globalRisk = settingsResult.data?.global_risk_percent || 2;

        setStats({
          totalUsers,
          activeSubscriptions,
          pendingPayments,
          activeSignals,
          totalSignals,
          winRate,
          monthlyRevenue,
          globalRisk,
        });
      } catch (err) {
        console.error('Error fetching admin stats:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  return { stats, isLoading };
};
