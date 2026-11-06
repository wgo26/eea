-- Seed the public business identity details explicitly supplied for publication.
-- Existing admin-managed values always take precedence.
insert into public.site_settings (key, value)
values
    ('social_facebook_url', 'https://www.facebook.com/share/1J2FYE1HhS/'),
    ('contact_phone', '+237 670 040 473')
on conflict (key) do nothing;
