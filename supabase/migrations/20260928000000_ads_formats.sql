-- Masterpiece ads: multi-format + responsive creatives.
--
-- Slots declare what they accept (allowed_formats, max_duration_seconds,
-- mobile_dimensions guidance); campaigns carry one creative per format with
-- separate mobile/desktop assets plus a video poster. The existing
-- creative_status moderation loop ('pending'/'approved'/'rejected') finally
-- becomes the render gate: public pages only render custom creative when it
-- is approved, otherwise the campaign falls back to its text card.

alter table public.ad_slots
    add column if not exists allowed_formats text[] not null default '{image,sponsored}',
    add column if not exists max_duration_seconds integer null,
    add column if not exists mobile_dimensions text null;

alter table public.ad_campaigns
    add column if not exists creative_type text not null default 'sponsored',
    add column if not exists mobile_creative_media_id uuid references public.media_assets (id) on delete set null,
    add column if not exists poster_media_id uuid references public.media_assets (id) on delete set null,
    add column if not exists creative_html text null,
    add column if not exists creative_width integer null,
    add column if not exists creative_height integer null;

-- creative_type is a closed vocabulary (no enum type: keeps the repair
-- migration's enum-label drift class away from the ads surface).
do $$ begin
    alter table public.ad_campaigns
        add constraint ad_campaigns_creative_type_valid
        check (creative_type in ('image', 'video', 'audio', 'html', 'sponsored'));
exception when duplicate_object then null; end $$;

do $$ begin
    alter table public.ad_campaigns
        add constraint ad_campaigns_creative_html_size
        check (creative_html is null or char_length(creative_html) <= 20000);
exception when duplicate_object then null; end $$;

do $$ begin
    alter table public.ad_slots
        add constraint ad_slots_max_duration_positive
        check (max_duration_seconds is null or max_duration_seconds > 0);
exception when duplicate_object then null; end $$;

create index if not exists ad_campaigns_slot_status_idx
    on public.ad_campaigns (ad_slot_id, status);

-- Product-default detail slots (not demo data): the news/photo-story rails
-- and the buy-sell inline band the detail pages query. Empty = the pages
-- render the "advertise with us" placeholder until staff book a campaign.
insert into public.ad_slots
    (slot_key, name, placement, dimensions, mobile_dimensions, allowed_formats, max_duration_seconds, is_active)
values
    ('news-rail', 'News article rail', 'news', '300x250', '320x100', '{image,video,sponsored}', 30, true),
    ('photo-story-rail', 'Photo story rail', 'photo-stories', '300x600', '320x100', '{image,video,sponsored}', 30, true),
    ('buy-sell-inline', 'Buy & Sell inline', 'buy-sell', '728x90', '320x100', '{image,sponsored}', null, true)
on conflict (slot_key) do update set
    mobile_dimensions = excluded.mobile_dimensions,
    allowed_formats = excluded.allowed_formats,
    max_duration_seconds = excluded.max_duration_seconds;

-- Bring the four legacy homepage slots onto the format model (only where
-- staff have not customized them — the default '{image,sponsored}' marker).
update public.ad_slots set
    mobile_dimensions = coalesce(mobile_dimensions, case
        when slot_key = 'homepage-banner' then '320x100'
        when slot_key = 'homepage-rail-top' then '320x120'
        else '320x100'
    end),
    allowed_formats = case
        when slot_key in ('homepage-banner', 'homepage-rail-top') then '{image,video,sponsored}'::text[]
        else allowed_formats
    end,
    max_duration_seconds = coalesce(max_duration_seconds, case
        when slot_key in ('homepage-banner', 'homepage-rail-top') then 30
        else null
    end)
where slot_key in ('homepage-banner', 'homepage-rail-top', 'homepage-inline-mid', 'homepage-inline-bottom')
  and allowed_formats = '{image,sponsored}';
