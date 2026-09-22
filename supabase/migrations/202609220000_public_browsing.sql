begin;
-- Existing browsing services are public. Publication/verification metadata is
-- kept intact; opening access does not falsely mark source records as verified.
-- Personal favorites, staff identities, raw imports and management writes stay private.
do $$ declare t text; begin
 for t in select unnest(array['buildings','companies','transactions','transaction_assets',
  'occupancies','tenant_movements','leasing_quarters','development_records',
  'building_complexes','building_towers']) loop
  execute format('create policy service_public_read on public.%I for select to anon,authenticated using(true)',t);
 end loop;
end $$;
-- Only approved images are shown; rejected/candidate uploads remain administrative.
alter policy image_public_read on public.building_images using(
 review_status='approved' and exists(select 1 from public.buildings b where b.id=building_id)
);
alter policy building_images_storage_public_read on storage.objects using(
 bucket_id='building-images' and exists(select 1 from public.building_images i
 where (i.object_path=storage.objects.name or i.thumbnail_path=storage.objects.name)
 and i.review_status='approved')
);
commit;
