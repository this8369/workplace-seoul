begin;
-- Inactive physical buildings retain their original identity and history.
-- Their redevelopment project is a separate asset with its own floor area.
do $$ declare c record; begin
 for c in select conname from pg_constraint
 where conrelid='public.buildings'::regclass and contype='c'
 and pg_get_constraintdef(oid) ~ '\mstatus\M' loop
  execute format('alter table public.buildings drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.buildings
 add constraint buildings_status_check check(status in ('operating','development','inactive')),
 add constraint buildings_status_area_basis_check check(
  (status in ('operating','inactive') and area_basis='actual') or
  (status='development' and area_basis='planned')),
 add column redevelopment_building_id uuid references public.buildings(id),
 add constraint buildings_redevelopment_not_self check(redevelopment_building_id<>id);
comment on column public.buildings.redevelopment_building_id is
 'Successor development asset. Preserve the predecessor record and historical transactions.';

-- Site scope confirmed by the project owner on 2026-09-29. Keep official
-- parcel geometry, attributes and price provenance unchanged, including dates.
do $$ begin
 if not exists(select 1 from public.buildings
  where id='540fb099-e033-55d2-890b-e9dae2e08dae' and status='development' and name like '%8-1,6%')
 or not exists(select 1 from public.buildings
  where id='c63f4003-2d88-5945-a677-c8ef1ab099ae' and name like '메트로타워%') then
  raise exception 'IOTA 816 / Metro identities do not match';
 end if;
 if (select count(*) from public.building_parcels
  where building_id='c63f4003-2d88-5945-a677-c8ef1ab099ae'
  and pnu in ('1114011800105370000','1114011800105300000','1114011800105310000')
  and geometry is not null and verified)<>3 then
  raise exception 'Expected three verified Metro parcels with geometry';
 end if;
end $$;
insert into public.building_parcels (
 building_id,pnu,address,is_primary,area_m2,land_category,land_use,terrain,shape,
 road_condition,ownership_type,ownership_changed_on,coowners,geometry,zoning,
 official_prices,source_name,source_url,as_of,collected_at,verified
)
select '540fb099-e033-55d2-890b-e9dae2e08dae',pnu,address,false,area_m2,
 land_category,land_use,terrain,shape,road_condition,ownership_type,
 ownership_changed_on,coowners,geometry,zoning,official_prices,source_name,
 source_url,as_of,collected_at,verified
from public.building_parcels
where building_id='c63f4003-2d88-5945-a677-c8ef1ab099ae'
 and pnu in ('1114011800105370000','1114011800105300000','1114011800105310000')
on conflict(building_id,pnu) do nothing;

update public.buildings set status='inactive',
 redevelopment_building_id='540fb099-e033-55d2-890b-e9dae2e08dae',
 overview=concat_ws(E'\n',nullif(overview,''),
  '운영 중단. 이오타 816(양동 제8-1,6지구) 재개발에 포함. 2026-09-29 운영자 확인.')
where id='c63f4003-2d88-5945-a677-c8ef1ab099ae';
commit;
