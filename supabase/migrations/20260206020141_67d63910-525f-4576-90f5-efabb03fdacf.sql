-- Create storage bucket for signal analysis images
INSERT INTO storage.buckets (id, name, public)
VALUES ('signal-analysis', 'signal-analysis', true)
ON CONFLICT (id) DO NOTHING;

-- Allow admins to upload analysis images
DROP POLICY IF EXISTS "Admins can upload analysis images" ON storage.objects;
CREATE POLICY "Admins can upload analysis images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'signal-analysis' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow admins to update analysis images
DROP POLICY IF EXISTS "Admins can update analysis images" ON storage.objects;
CREATE POLICY "Admins can update analysis images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'signal-analysis' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow admins to delete analysis images
DROP POLICY IF EXISTS "Admins can delete analysis images" ON storage.objects;
CREATE POLICY "Admins can delete analysis images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'signal-analysis' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow anyone with subscription to view analysis images
DROP POLICY IF EXISTS "Subscribers can view analysis images" ON storage.objects;
CREATE POLICY "Subscribers can view analysis images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'signal-analysis' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_active_subscription(auth.uid()))
);
