import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, startOfWeek, startOfMonth, subDays, subMonths, differenceInDays } from 'date-fns';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  created_at: string;
  account_balance: number | null;
}

interface Subscription {
  id: string;
  user_id: string;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface Payment {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  created_at: string;
}

interface Discount {
  id: string;
  code: string;
  type: string;
  value: number;
  is_active: boolean;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  created_at: string;
}

export interface ExecutiveStats {
  totalUsers: number;
  activePayingUsers: number;
  inactiveUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  totalRevenue: number;
  monthlyRevenue: number;
  averageRevenuePerUser: number;
  lifetimeValue: number;
  totalDiscountsGiven: number;
  netRevenueAfterDiscounts: number;
}

export interface SubscriptionStats {
  activeSubscriptions: number;
  expiredSubscriptions: number;
  inactiveSubscriptions: number;
  pendingRenewals: number;
  gracePeriodUsers: number;
}

export interface PaymentStats {
  successfulPayments: number;
  pendingPayments: number;
  rejectedPayments: number;
  totalPaymentsAmount: number;
  pendingAmount: number;
}

export interface RevenueData {
  dailyRevenue: { date: string; amount: number }[];
  weeklyRevenue: { week: string; amount: number }[];
  monthlyRevenue: { month: string; amount: number }[];
  revenueGrowthPercent: number;
}

export interface UserGrowthData {
  dailySignups: { date: string; count: number }[];
  weeklySignups: { week: string; count: number }[];
  monthlySignups: { month: string; count: number }[];
  activeVsInactive: { active: number; inactive: number };
  activationRate: number;
  retentionRate: number;
  churnRate: number;
}

export interface RiskRevenue {
  pendingPaymentsAmount: number;
  pendingPaymentUsers: number;
  expiringNext7Days: number;
  expiringNext14Days: number;
  expiringNext30Days: number;
  revenueAtRisk: number;
}

export interface DiscountStats {
  activeDiscounts: number;
  totalDiscountUses: number;
  revenueImpact: number;
  topDiscounts: { code: string; uses: number; impact: number }[];
}

export interface UserSegment {
  payingUsers: number;
  nonPayingUsers: number;
  longTermSubscribers: number;
  recentlyChurned: number;
  highRiskChurn: number;
}

export interface AdminDashboardStats {
  executive: ExecutiveStats;
  subscriptions: SubscriptionStats;
  payments: PaymentStats;
  revenue: RevenueData;
  userGrowth: UserGrowthData;
  riskRevenue: RiskRevenue;
  discounts: DiscountStats;
  segments: UserSegment;
}

export const useAdminDashboardStats = () => {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoading(true);

        // Fetch all data in parallel
        const [profilesResult, subscriptionsResult, paymentsResult, discountsResult] = await Promise.all([
          supabase.from('profiles').select('*'),
          supabase.from('subscriptions').select('*'),
          supabase.from('payments').select('*'),
          supabase.from('discounts').select('*'),
        ]);

        const profiles = (profilesResult.data || []) as Profile[];
        const subscriptions = (subscriptionsResult.data || []) as Subscription[];
        const payments = (paymentsResult.data || []) as Payment[];
        const discounts = (discountsResult.data || []) as Discount[];

        const now = new Date();
        const todayStart = startOfDay(now);
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const monthStart = startOfMonth(now);

        // Executive Stats
        const totalUsers = profiles.length;
        const activePayingUsers = subscriptions.filter(s => s.status === 'active').length;
        const inactiveUsers = subscriptions.filter(s => s.status === 'inactive').length;
        
        const newUsersToday = profiles.filter(p => new Date(p.created_at) >= todayStart).length;
        const newUsersThisWeek = profiles.filter(p => new Date(p.created_at) >= weekStart).length;
        const newUsersThisMonth = profiles.filter(p => new Date(p.created_at) >= monthStart).length;

        const verifiedPayments = payments.filter(p => p.status === 'verified');
        const totalRevenue = verifiedPayments.reduce((sum, p) => sum + p.amount, 0);
        
        const monthlyPayments = verifiedPayments.filter(p => new Date(p.created_at) >= monthStart);
        const monthlyRevenue = monthlyPayments.reduce((sum, p) => sum + p.amount, 0);

        const averageRevenuePerUser = totalUsers > 0 ? totalRevenue / totalUsers : 0;
        const lifetimeValue = activePayingUsers > 0 ? totalRevenue / activePayingUsers : 0;

        const totalDiscountUses = discounts.reduce((sum, d) => sum + d.current_uses, 0);
        const estimatedDiscountValue = discounts.reduce((sum, d) => {
          if (d.type === 'percentage') {
            return sum + (d.current_uses * 50 * d.value / 100);
          }
          return sum + (d.current_uses * d.value);
        }, 0);

        const executive: ExecutiveStats = {
          totalUsers,
          activePayingUsers,
          inactiveUsers,
          newUsersToday,
          newUsersThisWeek,
          newUsersThisMonth,
          totalRevenue,
          monthlyRevenue,
          averageRevenuePerUser,
          lifetimeValue,
          totalDiscountsGiven: estimatedDiscountValue,
          netRevenueAfterDiscounts: totalRevenue - estimatedDiscountValue,
        };

        // Subscription Stats
        const subscriptionStats: SubscriptionStats = {
          activeSubscriptions: subscriptions.filter(s => s.status === 'active').length,
          expiredSubscriptions: subscriptions.filter(s => {
            if (!s.expires_at) return false;
            return new Date(s.expires_at) < now && s.status !== 'active';
          }).length,
          inactiveSubscriptions: subscriptions.filter(s => s.status === 'inactive').length,
          pendingRenewals: subscriptions.filter(s => {
            if (!s.expires_at) return false;
            const expiresAt = new Date(s.expires_at);
            const daysUntilExpiry = differenceInDays(expiresAt, now);
            return s.status === 'active' && daysUntilExpiry <= 7 && daysUntilExpiry > 0;
          }).length,
          gracePeriodUsers: subscriptions.filter(s => {
            if (!s.expires_at) return false;
            const expiresAt = new Date(s.expires_at);
            const daysSinceExpiry = differenceInDays(now, expiresAt);
            return daysSinceExpiry > 0 && daysSinceExpiry <= 3;
          }).length,
        };

        // Payment Stats
        const paymentStats: PaymentStats = {
          successfulPayments: payments.filter(p => p.status === 'verified').length,
          pendingPayments: payments.filter(p => p.status === 'pending').length,
          rejectedPayments: payments.filter(p => p.status === 'rejected').length,
          totalPaymentsAmount: verifiedPayments.reduce((sum, p) => sum + p.amount, 0),
          pendingAmount: payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0),
        };

        // Revenue Data - Generate daily/weekly/monthly breakdowns
        const last30Days = Array.from({ length: 30 }, (_, i) => {
          const date = subDays(now, 29 - i);
          const dateStr = date.toISOString().split('T')[0];
          const dayPayments = verifiedPayments.filter(p => 
            p.created_at.split('T')[0] === dateStr
          );
          return { date: dateStr, amount: dayPayments.reduce((sum, p) => sum + p.amount, 0) };
        });

        const last12Months = Array.from({ length: 12 }, (_, i) => {
          const date = subMonths(now, 11 - i);
          const monthStr = date.toISOString().slice(0, 7);
          const monthPayments = verifiedPayments.filter(p => 
            p.created_at.slice(0, 7) === monthStr
          );
          return { month: monthStr, amount: monthPayments.reduce((sum, p) => sum + p.amount, 0) };
        });

        const thisMonthRevenue = last12Months[11]?.amount || 0;
        const lastMonthRevenue = last12Months[10]?.amount || 0;
        const revenueGrowthPercent = lastMonthRevenue > 0 
          ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 
          : 0;

        const revenue: RevenueData = {
          dailyRevenue: last30Days,
          weeklyRevenue: [], // Simplified
          monthlyRevenue: last12Months,
          revenueGrowthPercent,
        };

        // User Growth Data
        const dailySignups = Array.from({ length: 30 }, (_, i) => {
          const date = subDays(now, 29 - i);
          const dateStr = date.toISOString().split('T')[0];
          const dayUsers = profiles.filter(p => p.created_at.split('T')[0] === dateStr);
          return { date: dateStr, count: dayUsers.length };
        });

        const monthlySignups = Array.from({ length: 12 }, (_, i) => {
          const date = subMonths(now, 11 - i);
          const monthStr = date.toISOString().slice(0, 7);
          const monthUsers = profiles.filter(p => p.created_at.slice(0, 7) === monthStr);
          return { month: monthStr, count: monthUsers.length };
        });

        const activationRate = totalUsers > 0 ? (activePayingUsers / totalUsers) * 100 : 0;
        const churnRate = totalUsers > 0 ? (inactiveUsers / totalUsers) * 100 : 0;
        const retentionRate = 100 - churnRate;

        const userGrowth: UserGrowthData = {
          dailySignups,
          weeklySignups: [],
          monthlySignups,
          activeVsInactive: { active: activePayingUsers, inactive: inactiveUsers },
          activationRate,
          retentionRate,
          churnRate,
        };

        // Risk Revenue
        const expiringNext7Days = subscriptions.filter(s => {
          if (!s.expires_at || s.status !== 'active') return false;
          const daysUntil = differenceInDays(new Date(s.expires_at), now);
          return daysUntil > 0 && daysUntil <= 7;
        }).length;

        const expiringNext14Days = subscriptions.filter(s => {
          if (!s.expires_at || s.status !== 'active') return false;
          const daysUntil = differenceInDays(new Date(s.expires_at), now);
          return daysUntil > 0 && daysUntil <= 14;
        }).length;

        const expiringNext30Days = subscriptions.filter(s => {
          if (!s.expires_at || s.status !== 'active') return false;
          const daysUntil = differenceInDays(new Date(s.expires_at), now);
          return daysUntil > 0 && daysUntil <= 30;
        }).length;

        const riskRevenue: RiskRevenue = {
          pendingPaymentsAmount: paymentStats.pendingAmount,
          pendingPaymentUsers: payments.filter(p => p.status === 'pending').length,
          expiringNext7Days,
          expiringNext14Days,
          expiringNext30Days,
          revenueAtRisk: expiringNext30Days * 50, // $50 subscription price
        };

        // Discount Stats
        const activeDiscountsCount = discounts.filter(d => {
          if (!d.is_active) return false;
          if (d.expires_at && new Date(d.expires_at) < now) return false;
          if (d.max_uses && d.current_uses >= d.max_uses) return false;
          return true;
        }).length;

        const topDiscounts = discounts
          .filter(d => d.current_uses > 0)
          .map(d => ({
            code: d.code,
            uses: d.current_uses,
            impact: d.type === 'percentage' 
              ? d.current_uses * 50 * d.value / 100 
              : d.current_uses * d.value,
          }))
          .sort((a, b) => b.uses - a.uses)
          .slice(0, 5);

        const discountStats: DiscountStats = {
          activeDiscounts: activeDiscountsCount,
          totalDiscountUses: totalDiscountUses,
          revenueImpact: estimatedDiscountValue,
          topDiscounts,
        };

        // User Segments
        const longTermSubscribers = subscriptions.filter(s => {
          if (s.status !== 'active' || !s.starts_at) return false;
          const monthsActive = differenceInDays(now, new Date(s.starts_at)) / 30;
          return monthsActive >= 3;
        }).length;

        const recentlyChurned = subscriptions.filter(s => {
          if (!s.expires_at) return false;
          const daysSinceExpiry = differenceInDays(now, new Date(s.expires_at));
          return s.status === 'inactive' && daysSinceExpiry > 0 && daysSinceExpiry <= 30;
        }).length;

        const segments: UserSegment = {
          payingUsers: activePayingUsers,
          nonPayingUsers: totalUsers - activePayingUsers,
          longTermSubscribers,
          recentlyChurned,
          highRiskChurn: expiringNext7Days,
        };

        setStats({
          executive,
          subscriptions: subscriptionStats,
          payments: paymentStats,
          revenue,
          userGrowth,
          riskRevenue,
          discounts: discountStats,
          segments,
        });
      } catch (err) {
        console.error('Error fetching admin dashboard stats:', err);
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  return { stats, isLoading, error };
};
