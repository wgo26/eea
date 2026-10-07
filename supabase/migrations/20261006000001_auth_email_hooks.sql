-- Migration: Enable http extension and create Edge Function caller for auth emails
-- Run this in Supabase SQL Editor or via `supabase db push`

-- 1. Enable http extension for outbound requests
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- 2. Create the Edge Function caller (in extensions schema - we have permission here)
CREATE OR REPLACE FUNCTION extensions.send_auth_email(
  p_type text,
  p_user_id uuid,
  p_email text,
  p_confirmation_url text DEFAULT NULL,
  p_new_email text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions
AS $$
DECLARE
  v_url text := current_setting('app.edge_function_url', true) || '/functions/v1/send-auth-email';
  v_key text := current_setting('app.edge_function_key', true);
  v_payload jsonb;
  v_response jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'type', p_type,
    'user_id', p_user_id,
    'email', p_email,
    'confirmation_url', p_confirmation_url,
    'new_email', p_new_email
  );

  v_response := http_post(
    v_url,
    v_payload,
    jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    )
  );

  -- Log failures but don't block auth flow
  IF v_response->>'status' IS NULL OR (v_response->>'status')::int >= 400 THEN
    RAISE LOG 'Auth email failed: type=%, user_id=%, response=%', p_type, p_user_id, v_response;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth on email failure
  RAISE LOG 'Auth email exception: type=%, user_id=%, error=%', p_type, p_user_id, SQLERRM;
END;
$$;

-- 3. Postgres settings for the Edge Function (run in SQL Editor):
-- ALTER DATABASE postgres SET app.edge_function_url = 'https://tqknaklxyqpgvvfmyrkb.supabase.co';
-- ALTER DATABASE postgres SET app.edge_function_key = 'sb_publishable_AEp9iD_X-jgvRAni6fMxdA_HodBAcYL';

-- 4. Enable hooks in Dashboard → Authentication → Hooks:
--    before_user_created      → (call Edge Function directly via Management API)
--    password_recovery        → (call Edge Function directly via Management API)
--    magic_link               → (call Edge Function directly via Management API)
--    email_change             → (call Edge Function directly via Management API)
--    password_changed         → (call Edge Function directly via Management API)
--    invite_user              → (call Edge Function directly via Management API)

-- NOTE: Supabase Auth hooks cannot call arbitrary HTTP endpoints directly.
-- The recommended approach is to use the Management API to configure hooks that
-- call your Edge Function, or use a database trigger on auth.users changes.
-- See: https://supabase.com/docs/guides/auth/auth-hooks