-- Phase A+B: accept video/audio supporting media in the public intake.
-- Mirrors PAYLOAD_FIELDS in lib/public/actions.ts (videos + audios added).
-- Idempotent: re-creates the validator with the extended allowlist.

create or replace function public.enforce_submission_payload_shape()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_allowed text[] := array[
        'headline', 'description', 'what', 'location', 'date', 'photos',
        'videos', 'audios',
        'noticeType', 'organization', 'expiry', 'item', 'category', 'price',
        'currency', 'doc', 'message', 'contributorName', 'email', 'phone'
    ];
    v_keys    integer;
    v_key     text;
    v_value   jsonb;
    v_text    text;
begin
    if new.payload is null or jsonb_typeof(new.payload) <> 'object' then
        raise exception 'submissions.payload must be a JSON object';
    end if;

    select count(*) into v_keys from jsonb_object_keys(new.payload) as keys(k);
    if v_keys = 0 then
        raise exception 'submissions.payload must not be empty';
    end if;
    if v_keys > 30 then
        raise exception 'submissions.payload has too many fields (max 30)';
    end if;

    for v_key, v_value in
        select key, value from jsonb_each(new.payload)
    loop
        if not (v_key = any (v_allowed)) then
            raise exception 'submissions.payload contains unknown field "%"', v_key;
        end if;
        -- The intake layer stores every field as a string (photos/videos/
        -- audios are newline-separated URL lists, also one string).
        if jsonb_typeof(v_value) <> 'string' then
            raise exception 'submissions.payload."%" must be a string', v_key;
        end if;
        v_text := v_value #>> '{}';
        if v_key = 'photos' or v_key = 'videos' or v_key = 'audios' then
            if char_length(v_text) > 8000 then
                raise exception 'submissions.payload.% exceeds 8000 characters', v_key;
            end if;
        elsif char_length(v_text) > 4000 then
            raise exception 'submissions.payload."%" exceeds 4000 characters', v_key;
        end if;
    end loop;

    return new;
end;
$$;

revoke all on function public.enforce_submission_payload_shape()
    from public, anon, authenticated;

drop trigger if exists submissions_payload_shape on public.submissions;
create trigger submissions_payload_shape
    before insert or update of payload
    on public.submissions
    for each row execute function public.enforce_submission_payload_shape();
