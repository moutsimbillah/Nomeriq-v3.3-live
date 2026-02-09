-- Add analysis fields to signals table
ALTER TABLE public.signals
ADD COLUMN analysis_video_url TEXT,
ADD COLUMN analysis_notes TEXT,
ADD COLUMN analysis_image_url TEXT;