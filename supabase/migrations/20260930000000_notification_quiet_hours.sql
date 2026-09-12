-- Per-recipient quiet hours for the notification loop (gap D).
--
-- Adds an optional local-hour window [quiet_start, quiet_end) on
-- notification_prefs, interpreted in Africa/Douala time by the worker
-- (lib/notify/worker.ts). Inside the window email + WhatsApp are held and
-- only the in-app alert delivers, so nobody gets night pings; a NULL bound
-- (or start = end) means "no quiet hours".
-- Re-runnable: columns are IF NOT EXISTS, constraints via guarded DO blocks.

alter table public.notification_prefs
    add column if not exists quiet_start smallint,
    add column if not exists quiet_end smallint;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'notification_prefs_quiet_start_range'
    ) then
        alter table public.notification_prefs
            add constraint notification_prefs_quiet_start_range
            check (quiet_start is null or (quiet_start >= 0 and quiet_start <= 23));
    end if;
    if not exists (
        select 1 from pg_constraint where conname = 'notification_prefs_quiet_end_range'
    ) then
        alter table public.notification_prefs
            add constraint notification_prefs_quiet_end_range
            check (quiet_end is null or (quiet_end >= 0 and quiet_end <= 23));
    end if;
end
$$;
