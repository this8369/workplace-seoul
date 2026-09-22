begin;
-- Identity is owned by IGIS. Only linkage, display cache and app-specific access live here.
create table private.workplace_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 source_auth_id uuid unique not null,
 source_member_id uuid unique not null,
 display_name text not null,
 email text not null,
 role text not null default 'viewer' check (role in ('viewer','editor','admin')),
 enabled boolean not null default true,
 permissions jsonb not null default '{}'::jsonb check(jsonb_typeof(permissions)='object'),
 verified_until timestamptz not null,
 updated_at timestamptz not null default now()
);
alter table private.workplace_members enable row level security;
revoke all on private.workplace_members from public,anon,authenticated;
grant all on private.workplace_members to service_role;
-- Initial app roles are assigned to immutable IGIS employee IDs, never names,
-- email addresses, or IGIS project roles. Later access changes remain local.
create table private.workplace_initial_roles (
 source_member_id uuid primary key,
 role text not null check(role in ('viewer','editor','admin')),
 created_at timestamptz not null default now()
);
alter table private.workplace_initial_roles enable row level security;
revoke all on private.workplace_initial_roles from public,anon,authenticated;
grant all on private.workplace_initial_roles to service_role;
-- 기획추진센터: 이시정 / 이관용 / 전기영 (active employee records verified 2026-09-22).
insert into private.workplace_initial_roles(source_member_id,role) values
 ('14eaf982-9d0d-4243-a0b4-eb10626f690a','admin'),
 ('55f871a3-8d79-42fb-b208-9515b7b366be','admin'),
 ('809a0b49-37da-40e4-b664-8adc2eba4ad3','admin');
create function public.has_workplace_permission(feature text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare m private.workplace_members; value boolean;
begin
 if feature in ('catalog.read','transactions.read') then return true; end if;
 select * into m from private.workplace_members where user_id=auth.uid();
 if found then
  if not m.enabled or m.verified_until <= now() then return false; end if;
  if m.permissions ? feature then return m.permissions->feature = 'true'::jsonb; end if;
  return case feature
   when 'catalog.read' then true
   when 'favorites.write' then true
   when 'transactions.read' then true
   when 'images.manage' then m.role in ('editor','admin')
   when 'assets.write' then m.role in ('editor','admin')
   when 'users.manage' then m.role='admin'
   else false end;
 end if;
 -- Legacy email allowlists do not grant access after the IGIS cutover.
 return false;
end $$;
revoke all on function public.has_workplace_permission(text) from public,anon;
grant execute on function public.has_workplace_permission(text) to authenticated;
create or replace function public.can_review_records() returns boolean language sql stable security definer set search_path='' as $$
 select public.has_workplace_permission('assets.write')
$$;
create function public.workplace_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('linked',exists(select 1 from private.workplace_members where user_id=auth.uid()),'display_name',(select display_name from private.workplace_members where user_id=auth.uid()),
 'permissions',coalesce((select jsonb_agg(f) from unnest(array['catalog.read','favorites.write','transactions.read','images.manage','assets.write','users.manage']) f where public.has_workplace_permission(f)),'[]'::jsonb))
$$;
revoke all on function public.workplace_access() from public,anon;
grant execute on function public.workplace_access() to authenticated;
-- Only the server may attest source membership. Role/overrides are never accepted from a browser/source role.
create function public.link_igis_identity(target_user uuid, source_user uuid, member_id uuid, staff_name text, staff_email text)
returns boolean language plpgsql security definer set search_path='' as $$
declare m private.workplace_members;
begin
 perform pg_advisory_xact_lock(hashtextextended(source_user::text,0));
 select * into m from private.workplace_members where user_id=target_user;
 if found and (m.source_auth_id<>source_user or m.source_member_id<>member_id) then raise exception 'identity_mismatch'; end if;
 insert into private.workplace_members(user_id,source_auth_id,source_member_id,display_name,email,role,verified_until)
 values(target_user,source_user,member_id,staff_name,lower(staff_email),
  coalesce((select role from private.workplace_initial_roles where source_member_id=member_id),'viewer'),now()+interval '2 minutes')
 on conflict(user_id) do update set display_name=excluded.display_name,email=excluded.email,verified_until=excluded.verified_until,updated_at=now();
 return (select enabled from private.workplace_members where user_id=target_user);
end $$;
revoke all on function public.link_igis_identity(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.link_igis_identity(uuid,uuid,uuid,text,text) to service_role;
create function public.revoke_igis_identity(source_user uuid) returns void language sql security definer set search_path='' as $$
 update private.workplace_members set verified_until=now() where source_auth_id=source_user
$$;
revoke all on function public.revoke_igis_identity(uuid) from public,anon,authenticated;
grant execute on function public.revoke_igis_identity(uuid) to service_role;
create function public.set_workplace_access(member_user uuid, member_role text, member_enabled boolean, overrides jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_workplace_permission('users.manage') then raise exception 'admin_required'; end if;
 if member_user=auth.uid() then raise exception 'cannot_change_own_access'; end if;
 if member_role not in ('viewer','editor','admin') or jsonb_typeof(overrides)<>'object' then raise exception 'invalid_access'; end if;
 if exists(select 1 from jsonb_each(overrides) e where e.key not in ('catalog.read','favorites.write','transactions.read','images.manage','assets.write','users.manage') or jsonb_typeof(e.value)<>'boolean') then raise exception 'invalid_override'; end if;
 update private.workplace_members set role=member_role,enabled=member_enabled,permissions=overrides,updated_at=now() where user_id=member_user;
 if not found then raise exception 'member_not_found'; end if;
end $$;
revoke all on function public.set_workplace_access(uuid,text,boolean,jsonb) from public,anon;
grant execute on function public.set_workplace_access(uuid,text,boolean,jsonb) to authenticated;
-- Public browsing remains available regardless of login state. Management writes remain gated.
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename in
 ('buildings','building_facts','companies','transactions','transaction_assets','occupancies','tenant_movements','leasing_quarters','development_records','building_images','building_complexes','building_towers','building_register_records','building_register_links','building_register_floors','building_register_area_parts','building_register_sections') loop
 execute format('create policy workplace_access_gate on public.%I as restrictive for all to authenticated using (true) with check ((select public.has_workplace_permission(%L)))',t,case when t='building_images' then 'images.manage' else 'assets.write' end);
 end loop;
end $$;
create policy workplace_favorites_gate on public.favorites as restrictive for all to authenticated
 using((select public.has_workplace_permission('favorites.write'))) with check((select public.has_workplace_permission('favorites.write')));
alter policy image_reviewer_insert on public.building_images with check((select public.has_workplace_permission('images.manage')));
alter policy image_reviewer_update on public.building_images using((select public.has_workplace_permission('images.manage'))) with check((select public.has_workplace_permission('images.manage')));
alter policy image_reviewer_delete on public.building_images using((select public.has_workplace_permission('images.manage')));
alter policy building_images_storage_insert on storage.objects with check(bucket_id='building-images' and (select public.has_workplace_permission('images.manage')) and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$');
alter policy building_images_storage_delete on storage.objects using(bucket_id='building-images' and (select public.has_workplace_permission('images.manage')));
create policy workplace_image_storage_gate on storage.objects as restrictive for all to authenticated
 using(true)
 with check(bucket_id<>'building-images' or (select public.has_workplace_permission('images.manage')));
alter policy district_reviewer_update on public.districts using((select public.has_workplace_permission('assets.write'))) with check((select public.has_workplace_permission('assets.write')));
create or replace function public.set_primary_building_image(image_id uuid) returns void
 language plpgsql security definer set search_path='' as $$
declare target public.building_images; bid uuid;
begin
 if not public.has_workplace_permission('images.manage') then raise exception 'reviewer_required'; end if;
 select building_id into bid from public.building_images where id=image_id;
 if bid is null then raise exception 'image_not_found'; end if;
 perform 1 from public.buildings where id=bid for update;
 select * into target from public.building_images where id=image_id for update;
 if target.object_path is null then raise exception 'image_file_required'; end if;
 if not exists(select 1 from storage.objects where bucket_id='building-images' and name=target.object_path) then raise exception 'image_file_missing'; end if;
 update public.building_images set is_primary=false where building_id=bid and is_primary;
 update public.building_images set review_status='approved',is_primary=true,reviewed_by=auth.uid(),reviewed_at=now() where id=image_id;
end $$;
commit;
