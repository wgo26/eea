-- Transactional database cleanup for administrator content deletion.
-- Storage-provider objects are removed by the server action before this RPC.

create or replace function public.admin_delete_content_item(
    p_content_item_id uuid,
    p_actor_id uuid,
    p_note text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'Admin permission required';
    end if;

    update public.submissions
       set content_item_id = null
     where content_item_id = p_content_item_id;

    update public.homepage_slots
       set content_item_id = null
     where content_item_id = p_content_item_id;

    delete from public.saved_content where content_item_id = p_content_item_id;
    delete from public.content_tags where content_item_id = p_content_item_id;
    delete from public.reports where content_item_id = p_content_item_id;
    delete from public.events where content_item_id = p_content_item_id;
    delete from public.listings where content_item_id = p_content_item_id;
    delete from public.notices where content_item_id = p_content_item_id;
    delete from public.fundraisers where content_item_id = p_content_item_id;
    delete from public.media_assets where content_item_id = p_content_item_id;
    delete from public.content_translations where content_item_id = p_content_item_id;

    insert into public.moderation_log (
        action, actor_id, entity_type, entity_id, notes
    ) values (
        'content:delete', p_actor_id, 'content_item', p_content_item_id, p_note
    );

    delete from public.content_items where id = p_content_item_id;
    if not found then
        raise exception 'Content item not found';
    end if;
end;
$$;

create or replace function public.admin_delete_category(
    p_category_id uuid,
    p_reassign_to uuid,
    p_actor_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_type public.content_type;
    v_slug text;
    v_usage integer;
begin
    if not public.is_admin() then raise exception 'Admin permission required'; end if;
    select content_type, slug into v_type, v_slug from public.categories where id = p_category_id for update;
    if not found then raise exception 'Category not found'; end if;
    select count(*) into v_usage from public.content_items where category_id = p_category_id;
    if v_usage > 0 and p_reassign_to is null then raise exception 'Category is still in use'; end if;
    if p_reassign_to is not null then
        if p_reassign_to = p_category_id then raise exception 'Invalid reassignment target'; end if;
        if not exists (select 1 from public.categories where id = p_reassign_to and content_type = v_type) then
            raise exception 'Reassignment target has a different content type or does not exist';
        end if;
        update public.content_items set category_id = p_reassign_to where category_id = p_category_id;
    end if;
    insert into public.moderation_log(action, actor_id, entity_type, entity_id, notes)
    values ('taxonomy:category:delete', p_actor_id, 'category', p_category_id,
            v_type::text || '/' || v_slug);
    delete from public.categories where id = p_category_id;
end;
$$;

create or replace function public.admin_delete_location(
    p_location_id uuid,
    p_reassign_to uuid,
    p_actor_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_slug text;
    v_content integer;
    v_profiles integer;
begin
    if not public.is_admin() then raise exception 'Admin permission required'; end if;
    select slug into v_slug from public.locations where id = p_location_id for update;
    if not found then raise exception 'Location not found'; end if;
    select count(*) into v_content from public.content_items where location_id = p_location_id;
    select count(*) into v_profiles from public.profiles where location_id = p_location_id;
    if v_content + v_profiles > 0 and p_reassign_to is null then raise exception 'Location is still in use'; end if;
    if p_reassign_to is not null then
        if p_reassign_to = p_location_id or not exists (select 1 from public.locations where id = p_reassign_to) then
            raise exception 'Invalid reassignment target';
        end if;
        update public.content_items set location_id = p_reassign_to where location_id = p_location_id;
        update public.profiles set location_id = p_reassign_to where location_id = p_location_id;
    end if;
    update public.businesses set location_id = null where location_id = p_location_id;
    update public.locations set parent_id = null where parent_id = p_location_id;
    insert into public.moderation_log(action, actor_id, entity_type, entity_id, notes)
    values ('taxonomy:location:delete', p_actor_id, 'location', p_location_id, v_slug);
    delete from public.locations where id = p_location_id;
end;
$$;
