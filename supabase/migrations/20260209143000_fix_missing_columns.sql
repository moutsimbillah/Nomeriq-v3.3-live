-- Fix missing columns in signals table
-- This script safely adds the columns if they don't exist and reloads the schema cache

DO $$
BEGIN
    BEGIN
        ALTER TABLE public.signals ADD COLUMN analysis_video_url TEXT;
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column analysis_video_url already exists in signals.';
    END;

    BEGIN
        ALTER TABLE public.signals ADD COLUMN analysis_notes TEXT;
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column analysis_notes already exists in signals.';
    END;

    BEGIN
        ALTER TABLE public.signals ADD COLUMN analysis_image_url TEXT;
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column analysis_image_url already exists in signals.';
    END;
END $$;

-- Reload the schema cache to ensure PostgREST picks up the changes
NOTIFY pgrst, 'reload schema';
