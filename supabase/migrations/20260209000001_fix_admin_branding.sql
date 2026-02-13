-- Fix branding settings issues: Add missing columns and update RLS

-- 1. Add missing columns to global_settings if they don't exist
DO $$
BEGIN
    -- Add logo_url_dark
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'global_settings' AND column_name = 'logo_url_dark') THEN
        ALTER TABLE public.global_settings ADD COLUMN logo_url_dark text;
    END IF;

    -- Add social columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'global_settings' AND column_name = 'social_facebook') THEN
        ALTER TABLE public.global_settings ADD COLUMN social_facebook text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'global_settings' AND column_name = 'social_twitter') THEN
        ALTER TABLE public.global_settings ADD COLUMN social_twitter text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'global_settings' AND column_name = 'social_instagram') THEN
        ALTER TABLE public.global_settings ADD COLUMN social_instagram text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'global_settings' AND column_name = 'social_telegram') THEN
        ALTER TABLE public.global_settings ADD COLUMN social_telegram text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'global_settings' AND column_name = 'social_discord') THEN
        ALTER TABLE public.global_settings ADD COLUMN social_discord text;
    END IF;
    
    -- Add other fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'global_settings' AND column_name = 'copyright_name') THEN
        ALTER TABLE public.global_settings ADD COLUMN copyright_name text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'global_settings' AND column_name = 'disclaimer_text') THEN
        ALTER TABLE public.global_settings ADD COLUMN disclaimer_text text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'global_settings' AND column_name = 'timezone') THEN
        ALTER TABLE public.global_settings ADD COLUMN timezone text DEFAULT 'UTC';
    END IF;
END $$;

-- 2. Update RLS policies to allow admins (super_admin and others) to update global_settings
DROP POLICY IF EXISTS "Admins can update global settings" ON public.global_settings;

CREATE POLICY "Admins can update global settings" ON public.global_settings
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.is_super_admin(auth.uid()) OR
    public.is_any_admin(auth.uid())
  );

-- 3. Ensure storage bucket for brand-assets exists and has policies
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to brand assets
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'brand-assets' );

-- Allow admins to upload/update/delete brand assets
DROP POLICY IF EXISTS "Admin Upload" ON storage.objects;
CREATE POLICY "Admin Upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'brand-assets' AND (
    public.has_role(auth.uid(), 'admin') OR 
    public.is_any_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS "Admin Update" ON storage.objects;
CREATE POLICY "Admin Update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'brand-assets' AND (
    public.has_role(auth.uid(), 'admin') OR 
    public.is_any_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS "Admin Delete" ON storage.objects;
CREATE POLICY "Admin Delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'brand-assets' AND (
    public.has_role(auth.uid(), 'admin') OR 
    public.is_any_admin(auth.uid())
  )
);
