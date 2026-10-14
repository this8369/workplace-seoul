begin;
-- A published gallery has one ordering: its first photograph is the cover.
-- Drafts and floor plans never become the building's representative photograph.
create function private.reconcile_image_primary(asset_key uuid) returns void
language plpgsql security definer set search_path='' as $$
declare winner uuid;
begin
 perform 1 from public.buildings where id=asset_key for update;
 select id into winner from public.building_images
 where building_id=asset_key and review_status='approved' and kind<>'floor_plan' and object_path is not null
 order by sort_order,is_primary desc,created_at,id limit 1;
 update public.building_images set is_primary=false
 where building_id=asset_key and is_primary and id is distinct from winner;
 update public.building_images set is_primary=true where id=winner and not is_primary;
 -- Already approved photos of public list assets may supply the new thumbnail.
 if winner is not null and exists(select 1 from public.catalog_buildings where id=asset_key) then
  insert into private.catalog_publications(record_type,record_id)
  values('building_images',winner) on conflict do nothing;
 end if;
end $$;
revoke all on function private.reconcile_image_primary(uuid) from public,anon,authenticated;

create function private.sync_image_order_primary() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if current_setting('app.image_primary_write',true)='on' then return null;end if;
 if tg_op='DELETE' then
  perform private.reconcile_image_primary(old.building_id);
 else
  perform private.reconcile_image_primary(new.building_id);
  if tg_op='UPDATE' and old.building_id is distinct from new.building_id then
   perform private.reconcile_image_primary(old.building_id);
  end if;
 end if;
 return null;
end $$;
revoke all on function private.sync_image_order_primary() from public,anon,authenticated;
create trigger sync_image_order_primary
after insert or delete or update of sort_order,review_status,kind,object_path,building_id
on public.building_images for each row execute function private.sync_image_order_primary();

create or replace function public.approve_building_image(image_id uuid,make_primary boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare target public.building_images;bid uuid;prior_guard text;
begin
 if not public.has_workplace_permission('images.manage') then raise exception 'reviewer_required';end if;
 select building_id into bid from public.building_images where id=image_id;
 if bid is null then raise exception 'image_not_found';end if;
 perform 1 from public.buildings where id=bid for update;
 select * into target from public.building_images where id=image_id for update;
 if make_primary and target.kind='floor_plan' then raise exception 'floor_plan_cannot_be_primary';end if;
 if target.object_path is null then raise exception 'image_file_required';end if;
 if not exists(select 1 from storage.objects where bucket_id='building-images' and name=target.object_path) then raise exception 'image_file_missing';end if;
 prior_guard=current_setting('app.image_primary_write',true);
 perform set_config('app.image_primary_write','on',true);
 update public.building_images set review_status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=image_id;
 if coalesce(make_primary,false) then
  -- Explicit cover selection moves that photo to position 1 and preserves the
  -- relative order of the other published photos, all within this building.
  with ordered as (
   select id,row_number() over(order by (id=image_id) desc,sort_order,is_primary desc,created_at,id)::integer position
   from public.building_images where building_id=bid and review_status='approved' and kind<>'floor_plan' and object_path is not null
  ) update public.building_images i set sort_order=o.position from ordered o
    where i.id=o.id and i.sort_order is distinct from o.position;
 end if;
 perform set_config('app.image_primary_write',coalesce(prior_guard,''),true);
 perform private.reconcile_image_primary(bid);
end $$;
revoke all on function public.approve_building_image(uuid,boolean) from public,anon;
grant execute on function public.approve_building_image(uuid,boolean) to authenticated;

-- Keep tied legacy positions on their current cover. Repair only an actual
-- mismatch; image files, crop settings, review status and other towers stay intact.
do $$ declare asset uuid;begin
 for asset in select distinct building_id from public.building_images where review_status='approved' loop
  perform private.reconcile_image_primary(asset);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
