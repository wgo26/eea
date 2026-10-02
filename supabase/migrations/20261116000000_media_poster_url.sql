-- Add poster_url column to media_assets for video thumbnails
-- This column stores the URL of an extracted frame/poster for video attachments

ALTER TABLE public.media_assets
ADD COLUMN IF NOT EXISTS poster_url text;

COMMENT ON COLUMN public.media_assets.poster_url IS 'Poster/thumbnail URL for video attachments (extracted frame or YouTube thumbnail)';