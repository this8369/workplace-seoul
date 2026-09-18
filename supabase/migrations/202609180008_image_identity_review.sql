begin;
-- Photo review represents building identity, not a determination of copyright.
-- Unknown rights remain explicitly unknown; source metadata is preserved.
alter table public.building_images drop constraint image_publication_ready;
alter table public.building_images add constraint image_publication_ready check(
 review_status <> 'approved' or (object_path is not null and reviewed_at is not null)
);
drop policy image_public_read on public.building_images;
create policy image_public_read on public.building_images for select to anon,authenticated using(
 review_status='approved' and exists(select 1 from public.buildings b where b.id=building_id and b.published and b.gross_area_m2*121>=4000000)
);
drop policy building_images_storage_public_read on storage.objects;
create policy building_images_storage_public_read on storage.objects for select to anon,authenticated using(
 bucket_id='building-images' and exists(select 1 from public.building_images i join public.buildings b on b.id=i.building_id
 where (i.object_path=storage.objects.name or i.thumbnail_path=storage.objects.name) and i.review_status='approved' and b.published and b.gross_area_m2*121>=4000000)
);
create or replace function public.set_primary_building_image(image_id uuid) returns void
 language plpgsql security definer set search_path='' as $$
declare target public.building_images; bid uuid;
begin
 if not public.can_review_records() then raise exception 'reviewer_required'; end if;
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
