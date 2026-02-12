-- Verify that the payment method columns exist in global_settings
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'global_settings'
  AND column_name IN ('enable_usdt_trc20', 'enable_bank_transfer', 'enable_stripe', 'bank_account_name', 'bank_account_number', 'bank_name')
ORDER BY column_name;
