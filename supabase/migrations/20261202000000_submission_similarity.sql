-- P3 duplicate detection without AI (merged audit: pg_trgm, not embeddings).
--
-- Near-duplicate public submissions (paraphrased respam that defeats the
-- exact-fingerprint guard in lib/public/actions.ts) are caught with trigram
-- similarity over the submission's title text. The exact guard stays first;
-- this is the second net, scoped to the same identity + pending rows.
--
-- SAFE TO APPLY BLIND:
--   - CREATE EXTENSION IF NOT EXISTS (no-op where pg_trgm already ships,
--     e.g. alongside the 20261009000000_search_fts unaccent configs).
--   - GIN index with IF NOT EXISTS on an IMMUTABLE expression over the
--     payload's title key (headline → item → what → message).
--   - SECURITY DEFINER rpc with a fixed search_path; it reads pending
--     submissions only and returns (id, similarity) pairs — no writes.
--   - Callers treat every failure as "no match" (fail-open): a missing
--     extension or index on a lagging DB never blocks a genuine submission.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS submissions_payload_title_trgm
    ON public.submissions
    USING gin ((
        coalesce(
            payload ->> 'headline',
            payload ->> 'item',
            payload ->> 'what',
            payload ->> 'message',
            ''
        )
    ) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.similar_recent_submissions(
    p_type text,
    p_title text,
    p_days int DEFAULT 7
)
RETURNS TABLE (id uuid, sim real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT s.id, similarity(
        coalesce(
            s.payload ->> 'headline',
            s.payload ->> 'item',
            s.payload ->> 'what',
            s.payload ->> 'message',
            ''
        ),
        p_title
    ) AS sim
    FROM public.submissions s
    WHERE s.submission_type = p_type
      AND s.status = 'pending'
      AND s.created_at >= now() - (p_days || ' days')::interval
      AND similarity(
        coalesce(
            s.payload ->> 'headline',
            s.payload ->> 'item',
            s.payload ->> 'what',
            s.payload ->> 'message',
            ''
        ),
        p_title
      ) > 0.6
    ORDER BY sim DESC
    LIMIT 5;
$$;
