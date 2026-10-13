begin;
alter table public.building_asset_profiles
 add column site_area_m2 numeric(18,4) check(site_area_m2>0),
 add column floor_area_ratio numeric(12,4) check(floor_area_ratio>=0),
 add column efficiency_pct numeric(7,4) check(efficiency_pct between 0 and 100);
comment on column public.building_asset_profiles.site_area_m2 is 'Manual asset site area fallback. Verified current building register is displayed first for existing assets; never overwrite the official register.';
comment on column public.building_asset_profiles.efficiency_pct is 'Explicitly entered exclusive/rentable efficiency percent. Not a ratio of office area to total gross area.';
alter table public.asset_green_spaces add column kind text not null default 'park' check(kind in ('park','river','lake','mountain','other'));
alter table public.asset_green_spaces alter column area_m2 drop not null;
alter table public.asset_green_spaces drop constraint asset_green_spaces_area_m2_check;
alter table public.asset_green_spaces add constraint nature_area_valid check((area_m2 is null or area_m2>0) and (kind<>'park' or (area_m2 is not null and area_m2>=10000)));
-- Water bodies require shoreline/boundary evidence before automatic distance matching.
-- Existing point-distance view remains park-only; user-entered nature names cover all kinds.
create or replace view public.building_green_spaces with(security_invoker=true) as
 select b.id building_id,g.id,g.name,g.area_m2,g.source_name,g.source_url,g.as_of,d.distance_m,'reference_point'::text distance_basis
 from public.buildings b join public.asset_green_spaces g on g.kind='park' and abs(b.latitude-g.latitude)<0.005 and abs(b.longitude-g.longitude)<0.007
 cross join lateral (select 6371000*2*asin(least(1::double precision,sqrt(power(sin(radians((g.latitude-b.latitude)::double precision)/2),2)+cos(radians(b.latitude::double precision))*cos(radians(g.latitude::double precision))*power(sin(radians((g.longitude-b.longitude)::double precision)/2),2)))) distance_m) d
 where b.latitude is not null and b.longitude is not null and d.distance_m<=500;
insert into public.asset_vocabulary(category,name) values
 ('green_space','한강'),('green_space','중랑천'),('green_space','청계천'),('green_space','안양천'),('green_space','탄천'),
 ('green_space','석촌호수'),('green_space','일산호수공원'),('green_space','서울숲'),('green_space','서울식물원'),('green_space','서리풀공원'),('green_space','남산공원'),('green_space','여의도공원') on conflict do nothing;
notify pgrst,'reload schema';
commit;
