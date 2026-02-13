-- Add analysis fields to signals table
ALTER TABLE public.signals
ADD COLUMN IF NOT EXISTS analysis_video_url TEXT,
ADD COLUMN IF NOT EXISTS analysis_notes TEXT,
ADD COLUMN IF NOT EXISTS analysis_image_url TEXT;
