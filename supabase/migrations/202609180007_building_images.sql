begin;
create table public.building_images (
 id uuid primary key default gen_random_uuid(),
 building_id uuid not null references public.buildings(id) on delete cascade,
 title text not null check(length(trim(title))>0),
 kind text not null default 'photo' check(kind in ('photo','rendering')),
 source_name text not null,
 source_url text check(source_url is null or source_url ~ '^https://'),
 source_image_url text check(source_image_url is null or source_image_url ~ '^https://'),
 source_date text,
 captured_on date,
 credit text not null default '',
 license_name text not null default '',
 license_url text check(license_url is null or license_url ~ '^https://'),
 rights_status text not null default 'unconfirmed' check(rights_status in ('unconfirmed','cleared','restricted')),
 rights_note text not null default '',
 review_status text not null default 'candidate' check(review_status in ('candidate','approved','rejected')),
 review_note text not null default '',
 object_path text unique check(object_path is null or object_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$'),
 thumbnail_path text unique check(thumbnail_path is null or thumbnail_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$'),
 focal_x numeric not null default 50 check(focal_x between 0 and 100),
 focal_y numeric not null default 50 check(focal_y between 0 and 100),
 is_primary boolean not null default false,
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint image_publication_ready check(review_status <> 'approved' or (
   rights_status='cleared' and object_path is not null and length(trim(credit))>0 and
   length(trim(license_name))>0 and length(trim(rights_note))>0 and reviewed_at is not null and reviewed_by is not null)),
 constraint image_primary_approved check(not is_primary or review_status='approved')
);
create unique index building_images_primary on public.building_images(building_id) where is_primary;
create unique index building_images_candidate_source on public.building_images(building_id,source_url,title) where source_url is not null;
create index building_images_building on public.building_images(building_id);
alter table public.building_images enable row level security;
revoke all on public.building_images from public,anon,authenticated;
grant select on public.building_images to anon,authenticated;
grant insert,update,delete on public.building_images to authenticated;
grant all on public.building_images to service_role;
create policy image_public_read on public.building_images for select to anon,authenticated using(
 review_status='approved' and rights_status='cleared' and exists(select 1 from public.buildings b where b.id=building_id and b.published and b.gross_area_m2*121>=4000000)
);
create policy image_reviewer_read on public.building_images for select to authenticated using((select public.can_review_records()));
create policy image_reviewer_insert on public.building_images for insert to authenticated with check((select public.can_review_records()));
create policy image_reviewer_update on public.building_images for update to authenticated using((select public.can_review_records())) with check((select public.can_review_records()));
create policy image_reviewer_delete on public.building_images for delete to authenticated using((select public.can_review_records()));
create table private.image_revisions (
 id bigint generated always as identity primary key,
 image_id uuid not null,
 previous_record jsonb not null,
 operation text not null,
 actor uuid,
 recorded_at timestamptz not null default now()
);
alter table private.image_revisions enable row level security;
revoke all on private.image_revisions from public,anon,authenticated;
create function private.audit_image() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.image_revisions(image_id,previous_record,operation,actor) values(old.id,to_jsonb(old),tg_op,auth.uid());
 if tg_op='DELETE' then return old; end if;
 new.updated_at=now(); return new;
end $$;
revoke all on function private.audit_image() from public,anon,authenticated;
create trigger image_revision before update or delete on public.building_images for each row execute function private.audit_image();
-- Keep draft images behind the same reviewer boundary as draft building data.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('building-images','building-images',false,8388608,array['image/webp']);
create policy building_images_storage_review_read on storage.objects for select to authenticated
 using(bucket_id='building-images' and (select public.can_review_records()));
create policy building_images_storage_insert on storage.objects for insert to authenticated
 with check(bucket_id='building-images' and (select public.can_review_records()) and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$');
create policy building_images_storage_delete on storage.objects for delete to authenticated
 using(bucket_id='building-images' and (select public.can_review_records()));
create policy building_images_storage_public_read on storage.objects for select to anon,authenticated
 using(bucket_id='building-images' and exists(select 1 from public.building_images i join public.buildings b on b.id=i.building_id
 where (i.object_path=storage.objects.name or i.thumbnail_path=storage.objects.name) and i.review_status='approved' and i.rights_status='cleared' and b.published and b.gross_area_m2*121>=4000000));
-- Serializes primary selection per building; prevents two reviewers racing.
create function public.set_primary_building_image(image_id uuid) returns void
 language plpgsql security definer set search_path='' as $$
declare target public.building_images; bid uuid;
begin
 if not public.can_review_records() then raise exception 'reviewer_required'; end if;
 select building_id into bid from public.building_images where id=image_id;
 if bid is null then raise exception 'image_not_found'; end if;
 perform 1 from public.buildings where id=bid for update;
 select * into target from public.building_images where id=image_id for update;
 if target.rights_status<>'cleared' or target.object_path is null or length(trim(target.credit))=0 or length(trim(target.license_name))=0 or length(trim(target.rights_note))=0 then
   raise exception 'image_rights_and_file_required';
 end if;
 if not exists(select 1 from storage.objects where bucket_id='building-images' and name=target.object_path) then raise exception 'image_file_missing'; end if;
 update public.building_images set is_primary=false where building_id=bid and is_primary;
 update public.building_images set review_status='approved',is_primary=true,reviewed_by=auth.uid(),reviewed_at=now() where id=image_id;
end $$;
revoke all on function public.set_primary_building_image(uuid) from public,anon;
grant execute on function public.set_primary_building_image(uuid) to authenticated;
commit;
