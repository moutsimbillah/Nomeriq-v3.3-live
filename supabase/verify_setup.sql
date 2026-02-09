-- Check for Functions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_type='FUNCTION' 
AND specific_schema='public';

-- Check for the missing table
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'provider_telegram_settings';
