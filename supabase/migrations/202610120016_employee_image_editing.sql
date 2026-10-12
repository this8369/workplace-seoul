begin;
create or replace function public.has_workplace_permission(feature text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare m private.workplace_members;
begin
 if feature='catalog.read' then return true; end if;
 select * into m from private.workplace_members where user_id=auth.uid();
 if not found or not m.enabled or m.verified_until<=now() then return false; end if;
 if m.permissions ? feature then return m.permissions->feature='true'::jsonb; end if;
 return case feature
  when 'details.read' then true
  when 'favorites.write' then true
  when 'transactions.read' then true
  when 'images.manage' then true
  when 'assets.write' then m.role in ('editor','admin')
  when 'users.manage' then m.role='admin'
  else false end;
end $$;
alter policy image_reviewer_read on public.building_images using((select public.has_workplace_permission('images.manage')));
alter policy building_images_storage_review_read on storage.objects using(bucket_id='building-images' and (select public.has_workplace_permission('images.manage')));
-- Employee edits do not grant deletion of other records or referenced files.
alter policy image_reviewer_delete on public.building_images using((select public.has_workplace_permission('assets.write')));
alter policy building_images_storage_delete on storage.objects using(
 bucket_id='building-images' and (select public.has_workplace_permission('images.manage'))
 and ((select public.has_workplace_permission('assets.write')) or not exists(
  select 1 from public.building_images i where i.object_path=storage.objects.name or i.thumbnail_path=storage.objects.name
 ))
);
notify pgrst,'reload schema';
commit;
