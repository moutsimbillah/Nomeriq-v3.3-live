import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Discount {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  is_active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  current_uses: number;
  created_at: string;
}

interface UseDiscountsOptions {
  activeOnly?: boolean;
}

export const useDiscounts = (options: UseDiscountsOptions = {}) => {
  const { activeOnly = false } = options;
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDiscounts = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('discounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setDiscounts((data as Discount[]) || []);
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching discounts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    fetchDiscounts();
  }, [fetchDiscounts]);

  const createDiscount = async (discount: Omit<Discount, 'id' | 'created_at' | 'current_uses'>) => {
    const { error } = await supabase
      .from('discounts')
      .insert({
        code: discount.code.toUpperCase(),
        type: discount.type,
        value: discount.value,
        is_active: discount.is_active,
        expires_at: discount.expires_at,
        max_uses: discount.max_uses,
      });

    if (error) throw error;
    await fetchDiscounts();
  };

  const updateDiscount = async (id: string, updates: Partial<Discount>) => {
    const { error } = await supabase
      .from('discounts')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    await fetchDiscounts();
  };

  const deleteDiscount = async (id: string) => {
    const { error } = await supabase
      .from('discounts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await fetchDiscounts();
  };

  const validateCode = async (code: string): Promise<Discount | null> => {
    const { data, error } = await supabase
      .from('discounts')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return null;

    const discount = data as Discount;

    // Check expiration
    if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
      return null;
    }

    // Check max uses
    if (discount.max_uses && discount.current_uses >= discount.max_uses) {
      return null;
    }

    return discount;
  };

  const applyDiscount = async (discountId: string, originalPrice: number): Promise<number> => {
    const discount = discounts.find(d => d.id === discountId);
    if (!discount) return originalPrice;

    // Increment usage
    await supabase
      .from('discounts')
      .update({ current_uses: discount.current_uses + 1 })
      .eq('id', discountId);

    if (discount.type === 'percentage') {
      return originalPrice * (1 - discount.value / 100);
    } else {
      return Math.max(0, originalPrice - discount.value);
    }
  };

  return {
    discounts,
    isLoading,
    error,
    refetch: fetchDiscounts,
    createDiscount,
    updateDiscount,
    deleteDiscount,
    validateCode,
    applyDiscount,
  };
};
