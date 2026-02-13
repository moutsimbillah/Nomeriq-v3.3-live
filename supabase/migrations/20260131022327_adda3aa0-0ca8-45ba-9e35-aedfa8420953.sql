-- Create storage bucket for brand assets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('brand-assets', 'brand-assets', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view brand assets (public bucket)
DROP POLICY IF EXISTS "Anyone can view brand assets" ON storage.objects;
CREATE POLICY "Anyone can view brand assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'brand-assets');

-- Only super admins can upload/update brand assets  
DROP POLICY IF EXISTS "Super admins can upload brand assets" ON storage.objects;
CREATE POLICY "Super admins can upload brand assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'brand-assets' AND is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can update brand assets" ON storage.objects;
CREATE POLICY "Super admins can update brand assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'brand-assets' AND is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can delete brand assets" ON storage.objects;
CREATE POLICY "Super admins can delete brand assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'brand-assets' AND is_super_admin(auth.uid()));
