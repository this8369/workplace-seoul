begin;
-- Activate after the frontend has switched to catalog_* projections.
-- RLS is enforced on direct REST, embedded relationships and authenticated SQL.
-- Restrictive policies remain effective even alongside older permissive policies.
do $$ declare t text; begin
 for t in select unnest(array['buildings','building_facts','companies','transactions',
  'transaction_assets','occupancies','tenant_movements','leasing_quarters','development_records',
  'building_images','building_complexes','building_towers','building_register_records',
  'building_register_links','building_register_floors','building_register_area_parts',
  'building_register_sections','building_parcels','building_places']) loop
  execute format('revoke all on public.%I from public,anon',t);
  -- RLS does not govern TRUNCATE, REFERENCES or TRIGGER privileges.
  execute format('revoke truncate,references,trigger on public.%I from authenticated',t);
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy registered_details_only on public.%I as restrictive for all to authenticated using ((select public.has_workplace_permission(''details.read''))) with check ((select public.has_workplace_permission(''details.read'')))',t);
 end loop;
end $$;
create policy registered_transaction_permission on public.transactions as restrictive for select to authenticated
 using((select public.has_workplace_permission('transactions.read')));
create policy registered_transaction_asset_permission on public.transaction_assets as restrictive for select to authenticated
 using((select public.has_workplace_permission('transactions.read')));

alter policy building_images_storage_public_read on storage.objects using(
 bucket_id='building-images' and public.is_catalog_thumbnail(name)
);
create policy building_images_member_read on storage.objects for select to authenticated using(
 bucket_id='building-images' and (select public.has_workplace_permission('details.read'))
 and exists(select 1 from public.building_images i where (i.object_path=storage.objects.name or i.thumbnail_path=storage.objects.name) and i.review_status='approved')
);
create policy catalog_storage_anon_gate on storage.objects as restrictive for select to anon using(
 bucket_id<>'building-images' or public.is_catalog_thumbnail(name)
);
create policy catalog_storage_member_gate on storage.objects as restrictive for select to authenticated using(
 bucket_id<>'building-images' or public.is_catalog_thumbnail(name) or (select public.has_workplace_permission('details.read'))
);
update storage.buckets set public=false where id='building-images';

-- An image administrator's explicit primary-image approval also publishes its
-- thumbnail, but only for an asset already approved for the public list.
create function private.publish_approved_thumbnail() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.is_primary and new.review_status='approved'
 and public.has_workplace_permission('images.manage')
 and exists(select 1 from public.catalog_buildings where id=new.building_id) then
  insert into private.catalog_publications(record_type,record_id)
  values('building_images',new.id) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function private.publish_approved_thumbnail() from public,anon,authenticated;
create trigger publish_approved_thumbnail after insert or update of is_primary,review_status,thumbnail_path
 on public.building_images for each row execute function private.publish_approved_thumbnail();

-- Future confidential masters belong in private, outside exposed API schemas.
-- No implicit public/table or function grants for migrations made by this owner.
revoke all on schema private from public,anon,authenticated;
alter default privileges in schema public revoke all on tables from anon,authenticated;
alter default privileges in schema private revoke all on tables from public,anon,authenticated;
alter default privileges revoke execute on functions from public;
notify pgrst,'reload schema';
commit;
