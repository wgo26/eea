-- ============================================================================
-- Eagle Eye Africa — Core Schema (init)
-- ============================================================================
-- Creates the full data model for the Eagle Eye Africa community media
-- platform: content (photo stories, news, notices, buy & sell, culture),
-- the editorial/moderation pipeline, RBAC, CMS, advertising, storage,
-- trust & safety, legal policies, localization and the Africa visual
-- archive.
--
-- This migration MUST run before 20260902000000_community_polls.sql
-- (which references content_items and locations).
--
-- Safe to re-run: every object uses CREATE ... IF NOT EXISTS / DROP ... IF
-- EXISTS and idempotent grants.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- 1. Enumerated types
-- ---------------------------------------------------------------------------
do $$ begin
    create type public.app_role as enum
        ('admin', 'editor', 'contributor', 'advertiser');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.content_type as enum
        ('photo_story', 'news', 'listing', 'notice', 'culture');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.content_status as enum
        ('draft', 'pending', 'approved', 'scheduled', 'published', 'archived', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.submission_type as enum
        ('photo_story', 'news', 'culture', 'notice', 'buy_sell');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.submission_status as enum
        ('pending', 'in_review', 'approved', 'rejected', 'needs_clarification', 'published', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.verification_status as enum
        ('verified', 'community_submission', 'official_source', 'developing');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.notice_type as enum
        ('public_notice', 'lost_found', 'road_closure', 'community_alert',
         'missing_person', 'service_announcement', 'government_notice',
         'school_notice', 'organization_notice', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.listing_status as enum
        ('draft', 'active', 'sold', 'expired', 'removed', 'pending');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.ad_status as enum
        ('draft', 'pending', 'active', 'paused', 'ended', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.report_type as enum
        ('spam', 'abuse', 'copyright', 'misinformation', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.report_status as enum
        ('open', 'investigating', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.media_kind as enum
        ('image', 'video', 'audio', 'document');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.storage_provider as enum
        ('r2', 'supabase', 'b2', 'cloudinary');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.storage_destination as enum
        ('public_photo', 'admin_asset', 'backup');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.voice_type as enum
        ('formal', 'pidgin', 'camfranglais');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.layout_template as enum
        ('standard', 'feature', 'timeline', 'photo_essay', 'micro_story', 'breaking');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Taxonomy & geo (no dependencies)
-- ---------------------------------------------------------------------------
create table if not exists public.locations (
    id           uuid primary key default gen_random_uuid(),
    parent_id    uuid references public.locations (id) on delete set null,
    name         text not null,
    slug         text not null unique,
    locale       text not null default 'en',
    latitude     numeric,
    longitude    numeric,
    location_type text,
    description  text,
    is_active    boolean not null default true,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create table if not exists public.tags (
    id           uuid primary key default gen_random_uuid(),
    slug         text not null unique,
    created_at   timestamptz not null default now()
);

create table if not exists public.tag_translations (
    tag_id       uuid not null references public.tags (id) on delete cascade,
    locale       text not null,
    name         text not null,
    primary key (tag_id, locale)
);

create table if not exists public.categories (
    id           uuid primary key default gen_random_uuid(),
    slug         text not null,
    content_type public.content_type not null,
    parent_id    uuid references public.categories (id) on delete set null,
    sort_order   integer not null default 0,
    is_active    boolean not null default true,
    created_at   timestamptz not null default now(),
    unique (content_type, slug)
);

create table if not exists public.category_translations (
    category_id  uuid not null references public.categories (id) on delete cascade,
    locale       text not null,
    name         text not null,
    description  text,
    primary key (category_id, locale)
);

-- ---------------------------------------------------------------------------
-- 3. People & roles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
    id              uuid primary key references auth.users (id) on delete cascade,
    display_name    text,
    full_name       text,
    bio             text,
    phone           text,
    email           citext,
    avatar_url      text,
    location_id     uuid references public.locations (id) on delete set null,
    is_verified     boolean not null default false,
    is_public       boolean not null default true,
    preferred_locale text not null default 'en',
    preferred_voice public.voice_type not null default 'formal',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table if not exists public.user_roles (
    user_id      uuid not null references public.profiles (id) on delete cascade,
    role         public.app_role not null,
    created_at   timestamptz not null default now(),
    primary key (user_id, role)
);

-- ---------------------------------------------------------------------------
-- 4. Businesses & advertisers (marketplace directory — distinct from classifieds)
-- ---------------------------------------------------------------------------
create table if not exists public.businesses (
    id           uuid primary key default gen_random_uuid(),
    owner_id     uuid references public.profiles (id) on delete set null,
    location_id  uuid references public.locations (id) on delete set null,
    name         text not null,
    slug         text not null unique,
    description  text,
    phone        text,
    email        citext,
    whatsapp     text,
    website_url  text,
    instagram_url text,
    facebook_url  text,
    opening_hours jsonb,
    is_verified  boolean not null default false,
    is_featured  boolean not null default false,
    status       text not null default 'active',
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create table if not exists public.business_categories (
    business_id  uuid not null references public.businesses (id) on delete cascade,
    category_id  uuid not null references public.categories (id) on delete cascade,
    primary key (business_id, category_id)
);

-- NOTE: business_media is created in section 5 after media_assets exists.

create table if not exists public.advertisers (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid references public.profiles (id) on delete set null,
    business_id   uuid references public.businesses (id) on delete set null,
    contact_name  text,
    company_name  text,
    email         citext,
    phone         text,
    created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. Content (the heart of the CMS)
-- ---------------------------------------------------------------------------
create table if not exists public.content_items (
    id             uuid primary key default gen_random_uuid(),
    type           public.content_type not null,
    slug           text not null unique,
    status         public.content_status not null default 'draft',
    verification   public.verification_status,
    location_id    uuid references public.locations (id) on delete set null,
    category_id    uuid references public.categories (id) on delete set null,
    submitted_by   uuid references public.profiles (id) on delete set null,
    author_id      uuid references public.profiles (id) on delete set null,
    layout_template public.layout_template not null default 'standard',
    is_featured    boolean not null default false,
    is_archived    boolean not null default false,
    view_count     bigint not null default 0,
    share_count    bigint not null default 0,
    published_at   timestamptz,
    scheduled_for  timestamptz,
    expires_at     timestamptz,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create table if not exists public.content_translations (
    id                  uuid primary key default gen_random_uuid(),
    content_item_id     uuid not null references public.content_items (id) on delete cascade,
    locale              text not null,
    voice               public.voice_type not null default 'formal',
    title               text,
    excerpt             text,
    body                text,
    social_share_text   text,
    whatsapp_share_text text,
    seo_title           text,
    seo_description     text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (content_item_id, locale, voice)
);

create table if not exists public.media_assets (
    id                uuid primary key default gen_random_uuid(),
    content_item_id   uuid references public.content_items (id) on delete cascade,
    uploaded_by       uuid references public.profiles (id) on delete set null,
    kind              public.media_kind not null default 'image',
    provider          public.storage_provider not null default 'r2',
    destination       public.storage_destination not null default 'public_photo',
    storage_key       text,
    public_url        text,
    mime_type         text,
    file_size_bytes   bigint,
    width             integer,
    height            integer,
    duration_seconds  numeric,
    caption           text,
    photographer_credit text,
    alt_text          text,
    rights_holder     text,
    rights_status     text,
    rights_notes      text,
    sort_order        integer not null default 0,
    is_cover          boolean not null default false,
    backup_requested_at timestamptz,
    backed_up_at      timestamptz,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

create table if not exists public.media_text_variants (
    media_id     uuid not null references public.media_assets (id) on delete cascade,
    locale       text not null,
    voice        public.voice_type not null default 'formal',
    caption      text,
    alt_text     text,
    share_text   text,
    primary key (media_id, locale, voice)
);

create table if not exists public.business_media (
    business_id  uuid not null references public.businesses (id) on delete cascade,
    media_id     uuid not null references public.media_assets (id) on delete cascade,
    sort_order   integer not null default 0,
    primary key (business_id, media_id)
);

-- Content-type specific extension tables
create table if not exists public.notices (
    content_item_id     uuid primary key references public.content_items (id) on delete cascade,
    notice_type         public.notice_type not null,
    organization_name   text,
    contact_phone       text,
    contact_email       citext,
    notice_date         timestamptz,
    expiry_date         timestamptz,
    is_official         boolean not null default false
);

create table if not exists public.listings (
    content_item_id     uuid primary key references public.content_items (id) on delete cascade,
    price               numeric,
    currency            character(3) default 'XAF',
    listing_status      public.listing_status not null default 'active',
    contact_phone       text,
    contact_email       citext,
    whatsapp_number     text,
    seller_name        text,
    seller_is_verified  boolean not null default false,
    sold_at             timestamptz,
    renewed_at          timestamptz
);

create table if not exists public.events (
    content_item_id     uuid primary key references public.content_items (id) on delete cascade,
    starts_at           timestamptz,
    ends_at             timestamptz,
    venue_name          text,
    ticket_url          text,
    organizer_name      text,
    organizer_phone     text,
    organizer_email     citext
);

create table if not exists public.fundraisers (
    content_item_id     uuid primary key references public.content_items (id) on delete cascade,
    goal_amount         numeric,
    currency            character(3) default 'XAF',
    raised_amount       numeric not null default 0,
    organizer_name      text,
    organizer_phone     text,
    organizer_email     citext,
    donation_url        text,
    verification_notes  text,
    closed_at           timestamptz
);

-- ---------------------------------------------------------------------------
-- 6. Submissions (public intake → moderation queue)
-- ---------------------------------------------------------------------------
create table if not exists public.submissions (
    id                uuid primary key default gen_random_uuid(),
    submission_type   public.submission_type not null,
    submitted_by      uuid references public.profiles (id) on delete set null,
    guest_name        text,
    guest_email       citext,
    guest_phone       text,
    status            public.submission_status not null default 'pending',
    content_item_id   uuid references public.content_items (id) on delete set null,
    payload           jsonb,
    consent_confirmed boolean not null default false,
    rights_confirmed  boolean not null default false,
    submitted_at      timestamptz not null default now(),
    reviewed_at       timestamptz,
    reviewed_by       uuid references public.profiles (id) on delete set null,
    rejection_reason  text,
    internal_notes    text
);

create table if not exists public.submission_media (
    submission_id  uuid not null references public.submissions (id) on delete cascade,
    media_id       uuid not null references public.media_assets (id) on delete cascade,
    primary key (submission_id, media_id)
);

-- ---------------------------------------------------------------------------
-- 7. Relationships, follows, saves, tags
-- ---------------------------------------------------------------------------
create table if not exists public.content_relationships (
    id                  uuid primary key default gen_random_uuid(),
    source_content_id   uuid not null references public.content_items (id) on delete cascade,
    target_content_id   uuid not null references public.content_items (id) on delete cascade,
    relationship_type   text not null,
    created_at          timestamptz not null default now(),
    unique (source_content_id, target_content_id, relationship_type)
);

create table if not exists public.content_follows (
    user_id       uuid not null references public.profiles (id) on delete cascade,
    content_type  public.content_type not null,
    category_id   uuid references public.categories (id) on delete cascade,
    location_id   uuid references public.locations (id) on delete cascade,
    created_at    timestamptz not null default now(),
    primary key (user_id, content_type, category_id, location_id)
);

create table if not exists public.saved_content (
    user_id         uuid not null references public.profiles (id) on delete cascade,
    content_item_id uuid not null references public.content_items (id) on delete cascade,
    created_at      timestamptz not null default now(),
    primary key (user_id, content_item_id)
);

create table if not exists public.content_tags (
    content_item_id uuid not null references public.content_items (id) on delete cascade,
    tag_id          uuid not null references public.tags (id) on delete cascade,
    primary key (content_item_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- 8. Homepage curation
-- ---------------------------------------------------------------------------
create table if not exists public.homepage_slots (
    id             uuid primary key default gen_random_uuid(),
    slot_key       text not null,
    content_item_id uuid references public.content_items (id) on delete set null,
    sort_order     integer not null default 0,
    starts_at      timestamptz,
    ends_at        timestamptz,
    is_active      boolean not null default true,
    created_by     uuid references public.profiles (id) on delete set null,
    created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 9. Advertising
-- ---------------------------------------------------------------------------
create table if not exists public.ad_slots (
    id           uuid primary key default gen_random_uuid(),
    slot_key     text not null unique,
    name         text not null,
    placement    text,
    dimensions   text,
    description  text,
    base_price   numeric,
    currency     character(3) default 'XAF',
    is_active    boolean not null default true
);

create table if not exists public.ad_campaigns (
    id              uuid primary key default gen_random_uuid(),
    advertiser_id   uuid references public.advertisers (id) on delete set null,
    ad_slot_id      uuid references public.ad_slots (id) on delete set null,
    name            text not null,
    status          public.ad_status not null default 'pending',
    creative_media_id uuid references public.media_assets (id) on delete set null,
    destination_url text,
    copy_text       text,
    starts_at       timestamptz,
    ends_at         timestamptz,
    agreed_price    numeric,
    currency        character(3) default 'XAF',
    invoice_reference text,
    payment_status  text default 'unpaid',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table if not exists public.ad_events (
    id           bigint generated always as identity primary key,
    campaign_id  uuid not null references public.ad_campaigns (id) on delete cascade,
    event_type   text not null,
    occurred_at  timestamptz not null default now(),
    session_hash text,
    metadata     jsonb
);

-- ---------------------------------------------------------------------------
-- 10. Editorial log, trust & safety
-- ---------------------------------------------------------------------------
create table if not exists public.moderation_log (
    id                uuid primary key default gen_random_uuid(),
    content_item_id   uuid references public.content_items (id) on delete set null,
    submission_id     uuid references public.submissions (id) on delete set null,
    actor_id          uuid references public.profiles (id) on delete set null,
    action            text not null,
    from_status       text,
    to_status         text,
    notes             text,
    created_at        timestamptz not null default now()
);

create table if not exists public.reports (
    id              uuid primary key default gen_random_uuid(),
    report_type     public.report_type not null,
    reporter_id     uuid references public.profiles (id) on delete set null,
    content_item_id uuid references public.content_items (id) on delete set null,
    media_id        uuid references public.media_assets (id) on delete set null,
    subject         text,
    description     text,
    evidence_url    text,
    status          public.report_status not null default 'open',
    assigned_to     uuid references public.profiles (id) on delete set null,
    resolution      text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    resolved_at     timestamptz
);

create table if not exists public.corrections (
    id              uuid primary key default gen_random_uuid(),
    content_item_id uuid not null references public.content_items (id) on delete cascade,
    reporter_id     uuid references public.profiles (id) on delete set null,
    correction_text text not null,
    status          public.report_status not null default 'open',
    reviewed_by     uuid references public.profiles (id) on delete set null,
    resolution      text,
    created_at      timestamptz not null default now(),
    resolved_at     timestamptz
);

create table if not exists public.takedown_requests (
    id              uuid primary key default gen_random_uuid(),
    media_id        uuid not null references public.media_assets (id) on delete cascade,
    content_item_id uuid references public.content_items (id) on delete set null,
    claimant_name   text not null,
    claimant_email  citext,
    claimant_phone  text,
    rights_basis    text not null,
    description     text,
    evidence_url    text,
    status          public.report_status not null default 'open',
    assigned_to     uuid references public.profiles (id) on delete set null,
    decision        text,
    decision_reason text,
    created_at      timestamptz not null default now(),
    resolved_at     timestamptz
);

create table if not exists public.notifications (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles (id) on delete cascade,
    type        text not null,
    title       text not null,
    body        text,
    data        jsonb,
    read_at     timestamptz,
    created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 11. Legal & compliance
-- ---------------------------------------------------------------------------
create table if not exists public.policy_versions (
    id            uuid primary key default gen_random_uuid(),
    policy_type   text not null,
    version       text not null,
    locale        text not null default 'en',
    content       text not null,
    published_at  timestamptz not null default now(),
    is_current    boolean not null default true,
    unique (policy_type, locale, version)
);

create table if not exists public.policy_acceptances (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references public.profiles (id) on delete cascade,
    policy_version_id uuid not null references public.policy_versions (id) on delete cascade,
    accepted_at       timestamptz not null default now(),
    ip_hash           text,
    unique (user_id, policy_version_id)
);

create table if not exists public.data_requests (
    id              uuid primary key default gen_random_uuid(),
    requester_id    uuid references public.profiles (id) on delete set null,
    requester_email citext,
    request_type    text not null,
    description     text,
    status          public.report_status not null default 'open',
    assigned_to     uuid references public.profiles (id) on delete set null,
    created_at      timestamptz not null default now(),
    resolved_at     timestamptz,
    resolution      text
);

-- ---------------------------------------------------------------------------
-- 12. Daily brief & digest subscribers (Eagle Eye Daily Brief)
-- ---------------------------------------------------------------------------
create table if not exists public.daily_briefs (
    id            uuid primary key default gen_random_uuid(),
    publish_date  date not null,
    locale        text not null default 'en',
    voice         public.voice_type not null default 'formal',
    subject       text,
    intro         text,
    body          text,
    status        public.content_status not null default 'draft',
    published_at  timestamptz,
    created_at    timestamptz not null default now()
);

create table if not exists public.daily_brief_items (
    brief_id         uuid not null references public.daily_briefs (id) on delete cascade,
    content_item_id  uuid not null references public.content_items (id) on delete cascade,
    sort_order       integer not null default 0,
    primary key (brief_id, content_item_id)
);

create table if not exists public.digest_subscribers (
    id            uuid primary key default gen_random_uuid(),
    email         citext,
    phone         text,
    whatsapp      text,
    locale        text not null default 'en',
    voice         public.voice_type not null default 'formal',
    diaspora_mode boolean not null default false,
    is_active     boolean not null default true,
    created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 13. Indexes (query performance)
-- ---------------------------------------------------------------------------
create index if not exists content_items_type_status_idx on public.content_items (type, status);
create index if not exists content_items_status_published_idx on public.content_items (status, published_at desc);
create index if not exists content_items_location_idx on public.content_items (location_id);
create index if not exists content_items_category_idx on public.content_items (category_id);
create index if not exists content_items_featured_idx on public.content_items (is_featured) where is_featured = true;
create index if not exists content_items_submitted_by_idx on public.content_items (submitted_by);
create index if not exists content_items_author_idx on public.content_items (author_id);

create index if not exists content_translations_item_locale_idx on public.content_translations (content_item_id, locale);
create index if not exists media_assets_content_idx on public.media_assets (content_item_id);
create index if not exists media_assets_cover_idx on public.media_assets (content_item_id, is_cover);
create index if not exists media_assets_provider_idx on public.media_assets (provider);

create index if not exists submissions_status_idx on public.submissions (status);
create index if not exists submissions_type_idx on public.submissions (submission_type);
create index if not exists submissions_content_idx on public.submissions (content_item_id);

create index if not exists categories_type_idx on public.categories (content_type, is_active);
create index if not exists locations_active_idx on public.locations (is_active, name);
create index if not exists user_roles_user_idx on public.user_roles (user_id);
create index if not exists ad_campaigns_slot_idx on public.ad_campaigns (ad_slot_id, status);
create index if not exists moderation_log_created_idx on public.moderation_log (created_at desc);

-- ---------------------------------------------------------------------------
-- 14. Helper functions (SECURITY DEFINER to avoid RLS recursion on user_roles)
-- ---------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.user_roles
        where user_id = auth.uid()
          and role in ('admin', 'editor')
    );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.user_roles
        where user_id = auth.uid()
          and role = 'admin'
    );
$$;

create or replace function public.is_advertiser()
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.user_roles
        where user_id = auth.uid()
          and role = 'advertiser'
    );
$$;

-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. New-user trigger: auto-create profile + default contributor role
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, display_name, email)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
        new.email
    )
    on conflict (id) do nothing;

    insert into public.user_roles (user_id, role)
    values (new.id, 'contributor')
    on conflict (user_id, role) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Attach updated_at triggers
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
    for each row execute function public.touch_updated_at();
drop trigger if exists content_items_touch on public.content_items;
create trigger content_items_touch before update on public.content_items
    for each row execute function public.touch_updated_at();
drop trigger if exists content_translations_touch on public.content_translations;
create trigger content_translations_touch before update on public.content_translations
    for each row execute function public.touch_updated_at();
drop trigger if exists media_assets_touch on public.media_assets;
create trigger media_assets_touch before update on public.media_assets
    for each row execute function public.touch_updated_at();
drop trigger if exists businesses_touch on public.businesses;
create trigger businesses_touch before update on public.businesses
    for each row execute function public.touch_updated_at();
drop trigger if exists ad_campaigns_touch on public.ad_campaigns;
create trigger ad_campaigns_touch before update on public.ad_campaigns
    for each row execute function public.touch_updated_at();
drop trigger if exists ad_slots_touch on public.ad_slots;
create trigger ad_slots_touch before update on public.ad_slots
    for each row execute function public.touch_updated_at();
drop trigger if exists reports_touch on public.reports;
create trigger reports_touch before update on public.reports
    for each row execute function public.touch_updated_at();
drop trigger if exists corrections_touch on public.corrections;
create trigger corrections_touch before update on public.corrections
    for each row execute function public.touch_updated_at();
drop trigger if exists takedown_requests_touch on public.takedown_requests;
create trigger takedown_requests_touch before update on public.takedown_requests
    for each row execute function public.touch_updated_at();
drop trigger if exists data_requests_touch on public.data_requests;
create trigger data_requests_touch before update on public.data_requests
    for each row execute function public.touch_updated_at();
drop trigger if exists daily_briefs_touch on public.daily_briefs;
create trigger daily_briefs_touch before update on public.daily_briefs
    for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 16. Row Level Security
-- ---------------------------------------------------------------------------
-- Public/anonymous read access: only PUBLISHED, non-archived content and its
-- dependents. The app's own server queries use the service-role client (which
-- bypasses RLS), so these policies additionally protect direct anon-key API
-- access from leaking unpublished drafts, PII and moderation data.
alter table public.content_items enable row level security;
alter table public.content_translations enable row level security;
alter table public.media_assets enable row level security;
alter table public.notices enable row level security;
alter table public.listings enable row level security;
alter table public.events enable row level security;
alter table public.fundraisers enable row level security;
alter table public.categories enable row level security;
alter table public.category_translations enable row level security;
alter table public.locations enable row level security;
alter table public.tags enable row level security;
alter table public.tag_translations enable row level security;
alter table public.homepage_slots enable row level security;
alter table public.ad_slots enable row level security;
alter table public.ad_campaigns enable row level security;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.businesses enable row level security;
alter table public.advertisers enable row level security;
alter table public.saved_content enable row level security;
alter table public.content_follows enable row level security;
alter table public.submissions enable row level security;
alter table public.reports enable row level security;
alter table public.corrections enable row level security;
alter table public.takedown_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.policy_versions enable row level security;
alter table public.policy_acceptances enable row level security;
alter table public.data_requests enable row level security;
alter table public.daily_briefs enable row level security;
alter table public.daily_brief_items enable row level security;
alter table public.digest_subscribers enable row level security;
alter table public.content_relationships enable row level security;
alter table public.content_tags enable row level security;
alter table public.business_categories enable row level security;
alter table public.business_media enable row level security;
alter table public.submission_media enable row level security;
alter table public.media_text_variants enable row level security;

-- 16a. Public read policies -------------------------------------------------
drop policy if exists "Published content is readable by everyone" on public.content_items;
create policy "Published content is readable by everyone"
    on public.content_items for select
    using (status = 'published' and not is_archived);

drop policy if exists "Published content translations are readable" on public.content_translations;
create policy "Published content translations are readable"
    on public.content_translations for select
    using (
        exists (
            select 1 from public.content_items ci
            where ci.id = content_item_id and ci.status = 'published' and not ci.is_archived
        )
    );

drop policy if exists "Media of published content is readable" on public.media_assets;
create policy "Media of published content is readable"
    on public.media_assets for select
    using (
        content_item_id is null or exists (
            select 1 from public.content_items ci
            where ci.id = content_item_id and ci.status = 'published' and not ci.is_archived
        )
    );

drop policy if exists "Notices of published content are readable" on public.notices;
create policy "Notices of published content are readable"
    on public.notices for select
    using (exists (select 1 from public.content_items ci where ci.id = content_item_id and ci.status = 'published'));

drop policy if exists "Listings of published content are readable" on public.listings;
create policy "Listings of published content are readable"
    on public.listings for select
    using (exists (select 1 from public.content_items ci where ci.id = content_item_id and ci.status = 'published'));

drop policy if exists "Events of published content are readable" on public.events;
create policy "Events of published content are readable"
    on public.events for select
    using (exists (select 1 from public.content_items ci where ci.id = content_item_id and ci.status = 'published'));

drop policy if exists "Fundraisers of published content are readable" on public.fundraisers;
create policy "Fundraisers of published content are readable"
    on public.fundraisers for select
    using (exists (select 1 from public.content_items ci where ci.id = content_item_id and ci.status = 'published'));

drop policy if exists "Categories are readable by everyone" on public.categories;
create policy "Categories are readable by everyone"
    on public.categories for select using (is_active = true);

drop policy if exists "Category translations are readable by everyone" on public.category_translations;
create policy "Category translations are readable by everyone"
    on public.category_translations for select using (true);

drop policy if exists "Active locations are readable by everyone" on public.locations;
create policy "Active locations are readable by everyone"
    on public.locations for select using (is_active = true);

drop policy if exists "Tags are readable by everyone" on public.tags;
create policy "Tags are readable by everyone" on public.tags for select using (true);

drop policy if exists "Tag translations are readable by everyone" on public.tag_translations;
create policy "Tag translations are readable by everyone" on public.tag_translations for select using (true);

drop policy if exists "Homepage slots are readable by everyone" on public.homepage_slots;
create policy "Homepage slots are readable by everyone"
    on public.homepage_slots for select using (is_active = true);

drop policy if exists "Ad slots are readable by everyone" on public.ad_slots;
create policy "Ad slots are readable by everyone" on public.ad_slots for select using (is_active = true);

drop policy if exists "Active campaigns are readable by everyone" on public.ad_campaigns;
create policy "Active campaigns are readable by everyone"
    on public.ad_campaigns for select using (status = 'active');

drop policy if exists "Current policy versions are readable by everyone" on public.policy_versions;
create policy "Current policy versions are readable by everyone"
    on public.policy_versions for select using (is_current = true);

drop policy if exists "Published daily briefs are readable by everyone" on public.daily_briefs;
create policy "Published daily briefs are readable by everyone"
    on public.daily_briefs for select using (status = 'published');

drop policy if exists "Daily brief items are readable by everyone" on public.daily_brief_items;
create policy "Daily brief items are readable by everyone"
    on public.daily_brief_items for select using (true);

-- 16b. Own-record / contributor policies -----------------------------------
drop policy if exists "Profiles are readable by everyone" on public.profiles;
create policy "Profiles are readable by everyone"
    on public.profiles for select using (is_public = true or id = auth.uid());

drop policy if exists "Users manage their own profile" on public.profiles;
create policy "Users manage their own profile"
    on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "User roles are readable by staff" on public.user_roles;
create policy "User roles are readable by staff"
    on public.user_roles for select using (user_id = auth.uid() or public.is_staff());

drop policy if exists "Own saved content" on public.saved_content;
create policy "Own saved content"
    on public.saved_content for all
    using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Own content follows" on public.content_follows;
create policy "Own content follows"
    on public.content_follows for all
    using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Own notifications" on public.notifications;
create policy "Own notifications"
    on public.notifications for select using (user_id = auth.uid());

drop policy if exists "Own policy acceptances" on public.policy_acceptances;
create policy "Own policy acceptances"
    on public.policy_acceptances for all
    using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Own data requests" on public.data_requests;
create policy "Own data requests"
    on public.data_requests for all
    using (requester_id = auth.uid() or requester_email is not null) with check (true);

drop policy if exists "Anyone may submit content" on public.submissions;
create policy "Anyone may submit content"
    on public.submissions for insert with check (true);

drop policy if exists "Own/reviewable submissions" on public.submissions;
create policy "Own/reviewable submissions"
    on public.submissions for select
    using (submitted_by = auth.uid() or public.is_staff());

drop policy if exists "Anyone may report content" on public.reports;
create policy "Anyone may report content"
    on public.reports for insert with check (true);

drop policy if exists "Own/reviewable reports" on public.reports;
create policy "Own/reviewable reports"
    on public.reports for select
    using (reporter_id = auth.uid() or public.is_staff());

drop policy if exists "Anyone may request corrections" on public.corrections;
create policy "Anyone may request corrections"
    on public.corrections for insert with check (true);

drop policy if exists "Reviewable corrections" on public.corrections;
create policy "Reviewable corrections"
    on public.corrections for select using (public.is_staff());

drop policy if exists "Anyone may request takedowns" on public.takedown_requests;
create policy "Anyone may request takedowns"
    on public.takedown_requests for insert with check (true);

drop policy if exists "Reviewable takedowns" on public.takedown_requests;
create policy "Reviewable takedowns"
    on public.takedown_requests for select using (public.is_staff());

drop policy if exists "Own/verified businesses" on public.businesses;
create policy "Own/verified businesses"
    on public.businesses for select using (status = 'active');
create policy "Own businesses write"
    on public.businesses for all
    using (owner_id = auth.uid() or public.is_staff()) with check (owner_id = auth.uid() or public.is_staff());

drop policy if exists "Advertisers readable by staff" on public.advertisers;
create policy "Advertisers readable by staff"
    on public.advertisers for select using (public.is_staff() or user_id = auth.uid());

drop policy if exists "Own digest subscription" on public.digest_subscribers;
create policy "Own digest subscription"
    on public.digest_subscribers for all using (true) with check (true);

-- 16c. Staff (admin + editor) policies -------------------------------------
drop policy if exists "Staff manage content" on public.content_items;
create policy "Staff manage content"
    on public.content_items for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage translations" on public.content_translations;
create policy "Staff manage translations"
    on public.content_translations for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage media" on public.media_assets;
create policy "Staff manage media"
    on public.media_assets for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage notices" on public.notices;
create policy "Staff manage notices"
    on public.notices for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage listings" on public.listings;
create policy "Staff manage listings"
    on public.listings for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage events" on public.events;
create policy "Staff manage events"
    on public.events for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage fundraisers" on public.fundraisers;
create policy "Staff manage fundraisers"
    on public.fundraisers for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage categories" on public.categories;
create policy "Staff manage categories"
    on public.categories for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage category translations" on public.category_translations;
create policy "Staff manage category translations"
    on public.category_translations for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage locations" on public.locations;
create policy "Staff manage locations"
    on public.locations for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage tags" on public.tags;
create policy "Staff manage tags"
    on public.tags for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage tag translations" on public.tag_translations;
create policy "Staff manage tag translations"
    on public.tag_translations for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage homepage slots" on public.homepage_slots;
create policy "Staff manage homepage slots"
    on public.homepage_slots for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage ad slots" on public.ad_slots;
create policy "Staff manage ad slots"
    on public.ad_slots for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage ad campaigns" on public.ad_campaigns;
create policy "Staff manage ad campaigns"
    on public.ad_campaigns for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage submissions" on public.submissions;
create policy "Staff manage submissions"
    on public.submissions for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage moderation log" on public.moderation_log;
create policy "Staff manage moderation log"
    on public.moderation_log for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage reports" on public.reports;
create policy "Staff manage reports"
    on public.reports for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage corrections" on public.corrections;
create policy "Staff manage corrections"
    on public.corrections for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage takedowns" on public.takedown_requests;
create policy "Staff manage takedowns"
    on public.takedown_requests for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage daily briefs" on public.daily_briefs;
create policy "Staff manage daily briefs"
    on public.daily_briefs for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage content relationships" on public.content_relationships;
create policy "Staff manage content relationships"
    on public.content_relationships for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage content tags" on public.content_tags;
create policy "Staff manage content tags"
    on public.content_tags for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage user roles" on public.user_roles;
create policy "Staff manage user roles"
    on public.user_roles for all
    using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Staff manage profiles" on public.profiles;
create policy "Staff manage profiles"
    on public.profiles for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage businesses" on public.businesses;
create policy "Staff manage businesses"
    on public.businesses for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage advertisers" on public.advertisers;
create policy "Staff manage advertisers"
    on public.advertisers for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage policy versions" on public.policy_versions;
create policy "Staff manage policy versions"
    on public.policy_versions for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage data requests" on public.data_requests;
create policy "Staff manage data requests"
    on public.data_requests for update using (public.is_staff()) with check (public.is_staff());

-- 16d. Advertiser-scoped policies ------------------------------------------
drop policy if exists "Advertisers manage own campaigns" on public.ad_campaigns;
create policy "Advertisers manage own campaigns"
    on public.ad_campaigns for select
    using (advertiser_id in (select id from public.advertisers where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 17. Grants (anon + authenticated for public read; service role bypasses RLS)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on
    public.content_items, public.content_translations, public.media_assets,
    public.notices, public.listings, public.events, public.fundraisers,
    public.categories, public.category_translations, public.locations,
    public.tags, public.tag_translations, public.homepage_slots,
    public.ad_slots, public.ad_campaigns, public.policy_versions,
    public.daily_briefs, public.daily_brief_items, public.businesses,
    public.profiles, public.advertisers
to anon, authenticated;

grant insert on
    public.submissions, public.reports, public.corrections,
    public.takedown_requests, public.data_requests, public.digest_subscribers,
    public.saved_content, public.content_follows, public.policy_acceptances,
    public.businesses, public.advertisers
to anon, authenticated;

grant update, delete on
    public.saved_content, public.content_follows, public.policy_acceptances,
    public.profiles, public.businesses
to anon, authenticated;

-- is_staff / is_admin / is_advertiser must be executable by the anon/authenticated
-- roles so RLS policies can call them.
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_advertiser() to anon, authenticated;
