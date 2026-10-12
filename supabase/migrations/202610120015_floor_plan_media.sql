begin;
alter table public.building_images drop constraint building_images_kind_check;
alter table public.building_images add constraint building_images_kind_check check(kind in ('photo','rendering','floor_plan'));
alter table public.building_images add column floor_label text;
alter table public.building_images add column sort_order integer not null default 0;
alter table public.building_images add constraint floor_plan_not_primary check(kind <> 'floor_plan' or not is_primary);
comment on column public.building_images.floor_label is 'Optional floor or tower label for a floor plan; image content stays member-only.';

create or replace view public.catalog_images with(security_barrier=true) as
 select i.id,i.building_id,i.title,i.kind,i.thumbnail_path,
 i.thumbnail_path as object_path,i.focal_x,i.focal_y,i.is_primary,i.review_status
 from public.building_images i join private.catalog_publications p on p.record_type='building_images' and p.record_id=i.id
 join public.catalog_buildings b on b.id=i.building_id
 where i.review_status='approved' and i.is_primary and i.thumbnail_path is not null and i.kind <> 'floor_plan';

create function public.approve_building_image(image_id uuid, make_primary boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare target public.building_images; bid uuid;
begin
 if not public.has_workplace_permission('images.manage') then raise exception 'reviewer_required'; end if;
 select building_id into bid from public.building_images where id=image_id;
 if bid is null then raise exception 'image_not_found'; end if;
 perform 1 from public.buildings where id=bid for update;
 select * into target from public.building_images where id=image_id for update;
 if make_primary and target.kind='floor_plan' then raise exception 'floor_plan_cannot_be_primary'; end if;
 if target.object_path is null then raise exception 'image_file_required'; end if;
 if not exists(select 1 from storage.objects where bucket_id='building-images' and name=target.object_path) then raise exception 'image_file_missing'; end if;
 if make_primary then
  update public.building_images set is_primary=false where building_id=bid and is_primary;
 end if;
 update public.building_images set review_status='approved',is_primary=coalesce(make_primary,false),reviewed_by=auth.uid(),reviewed_at=now() where id=image_id;
end $$;
revoke all on function public.approve_building_image(uuid,boolean) from public,anon;
grant execute on function public.approve_building_image(uuid,boolean) to authenticated;
create or replace function public.set_primary_building_image(image_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.approve_building_image(image_id,true);
end $$;
notify pgrst,'reload schema';
commit;
