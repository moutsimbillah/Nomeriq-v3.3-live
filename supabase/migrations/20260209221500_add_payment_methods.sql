-- Add payment method configuration fields to global_settings table
ALTER TABLE public.global_settings
ADD COLUMN IF NOT EXISTS enable_usdt_trc20 BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS enable_bank_transfer BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS enable_stripe BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS bank_account_name TEXT,
ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
ADD COLUMN IF NOT EXISTS bank_name TEXT;

-- Add user verification fields to payments table for bank transfers
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'usdt_trc20',
ADD COLUMN IF NOT EXISTS user_bank_account_name TEXT,
ADD COLUMN IF NOT EXISTS user_bank_account_number TEXT,
ADD COLUMN IF NOT EXISTS user_bank_name TEXT;

-- Add check constraint for payment_method
ALTER TABLE public.payments
DROP CONSTRAINT IF EXISTS payments_payment_method_check;

ALTER TABLE public.payments
ADD CONSTRAINT payments_payment_method_check 
CHECK (payment_method IN ('usdt_trc20', 'bank_transfer', 'stripe'));
