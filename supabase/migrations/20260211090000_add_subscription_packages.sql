-- Subscription packages + features, and link payments/subscriptions to packages

-- 1) Packages table
CREATE TABLE IF NOT EXISTS public.subscription_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  price DECIMAL(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  duration_type TEXT NOT NULL CHECK (duration_type IN ('monthly', 'yearly', 'lifetime')),
  -- For monthly/yearly: months count (1/12). For lifetime: 0.
  duration_months INTEGER NOT NULL DEFAULT 1,
  availability TEXT NOT NULL DEFAULT 'single' CHECK (availability IN ('single', 'multiple')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (duration_type = 'lifetime' AND duration_months = 0)
    OR (duration_type IN ('monthly', 'yearly') AND duration_months > 0)
  )
);

CREATE INDEX IF NOT EXISTS subscription_packages_status_sort_order_idx
  ON public.subscription_packages (status, sort_order);

-- 2) Package features table
CREATE TABLE IF NOT EXISTS public.subscription_package_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.subscription_packages(id) ON DELETE CASCADE,
  feature_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_package_features_package_id_sort_order_idx
  ON public.subscription_package_features (package_id, sort_order);

-- 3) Link payments to packages
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS package_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_package_id_fkey'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_package_id_fkey
      FOREIGN KEY (package_id)
      REFERENCES public.subscription_packages(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS payments_package_id_idx
  ON public.payments (package_id);

-- 4) Link subscriptions to packages and payments
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS package_id UUID,
  ADD COLUMN IF NOT EXISTS payment_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_package_id_fkey'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_package_id_fkey
      FOREIGN KEY (package_id)
      REFERENCES public.subscription_packages(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_payment_id_fkey'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_payment_id_fkey
      FOREIGN KEY (payment_id)
      REFERENCES public.payments(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS subscriptions_package_id_idx
  ON public.subscriptions (package_id);

-- 5) Enable RLS (safe) and add policies
ALTER TABLE public.subscription_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_package_features ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user
DROP POLICY IF EXISTS "Authenticated users can view subscription packages" ON public.subscription_packages;
CREATE POLICY "Authenticated users can view subscription packages" ON public.subscription_packages
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can view subscription package features" ON public.subscription_package_features;
CREATE POLICY "Authenticated users can view subscription package features" ON public.subscription_package_features
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Write: admins only
DROP POLICY IF EXISTS "Admins can manage subscription packages" ON public.subscription_packages;
CREATE POLICY "Admins can manage subscription packages" ON public.subscription_packages
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage subscription package features" ON public.subscription_package_features;
CREATE POLICY "Admins can manage subscription package features" ON public.subscription_package_features
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Reload the schema cache to ensure PostgREST picks up the changes
NOTIFY pgrst, 'reload schema';

