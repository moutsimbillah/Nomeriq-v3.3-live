-- One-time data correction requested by support:
-- user reports initial funded balance = 1000.
UPDATE public.profiles
SET starting_balance = 1000.00,
    updated_at = now()
WHERE lower(email) = lower('humeramoutsim@gmail.com');

NOTIFY pgrst, 'reload schema';
