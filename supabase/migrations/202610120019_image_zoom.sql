begin;
alter table public.building_images add column zoom_percent integer not null default 100
 check (zoom_percent between 100 and 300);
comment on column public.building_images.zoom_percent is 'Display crop zoom, 100–300 percent. Original files stay unchanged; focal_x/y control the zoom origin.';

create or replace view public.catalog_images with(security_barrier=true) as
 select i.id,i.building_id,i.title,i.kind,i.thumbnail_path,
 i.thumbnail_path as object_path,i.focal_x,i.focal_y,i.is_primary,i.review_status,i.zoom_percent
 from public.building_images i join private.catalog_publications p on p.record_type='building_images' and p.record_id=i.id
 join public.catalog_buildings b on b.id=i.building_id
 where i.review_status='approved' and i.is_primary and i.thumbnail_path is not null and i.kind <> 'floor_plan';

notify pgrst,'reload schema';
commit;
