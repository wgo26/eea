-- Member dashboard history repair: logged-in users must see their own
-- submissions even when the row was created as a guest (submitted_by null)
-- but the contact email matches their auth email. The existing
-- "Own/reviewable submissions" policy only allowed submitted_by = auth.uid().
--
-- New policy keeps that, adds a case-insensitive guest_email match against
-- auth.jwt()->>'email', and keeps the staff bypass. Legacy rows with a
-- matching email become visible; phone-only guests stay hidden (no email to
-- match on) until staff links them.

drop policy if exists "Own/reviewable submissions" on public.submissions;

create policy "Own/reviewable submissions"
    on public.submissions for select
    using (
        submitted_by = auth.uid()
        or public.is_staff()
        or (
            guest_email is not null
            and auth.jwt() ->> 'email' is not null
            and lower(guest_email::text) = lower(auth.jwt() ->> 'email')
        )
    );
