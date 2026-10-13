begin;
create table public.asset_green_spaces (
 id uuid primary key default gen_random_uuid(),name text not null,address text,
 area_m2 numeric not null check(area_m2>=10000), latitude numeric not null check(latitude between -90 and 90),longitude numeric not null check(longitude between -180 and 180),
 source_name text not null, source_url text not null, source_row integer not null, as_of date not null,
 unique(source_url,source_row,as_of)
);
alter table public.asset_green_spaces enable row level security;
create policy member_read on public.asset_green_spaces for select to authenticated using(public.has_workplace_permission('details.read'));
revoke all on public.asset_green_spaces from public,anon,authenticated;
grant select on public.asset_green_spaces to authenticated;grant all on public.asset_green_spaces to service_role;
create view public.building_green_spaces with(security_invoker=true) as
 select b.id building_id,g.id,g.name,g.area_m2,g.source_name,g.source_url,g.as_of,d.distance_m,'reference_point'::text distance_basis
 from public.buildings b join public.asset_green_spaces g on abs(b.latitude-g.latitude)<0.005 and abs(b.longitude-g.longitude)<0.007
 cross join lateral (select 6371000*2*asin(least(1::double precision,sqrt(power(sin(radians((g.latitude-b.latitude)::double precision)/2),2)+cos(radians(b.latitude::double precision))*cos(radians(g.latitude::double precision))*power(sin(radians((g.longitude-b.longitude)::double precision)/2),2)))) distance_m) d
 where b.latitude is not null and b.longitude is not null and d.distance_m<=500;
revoke all on public.building_green_spaces from public,anon;
grant select on public.building_green_spaces to authenticated;
comment on view public.building_green_spaces is 'Source major parks >=10,000m2 within 500m great-circle distance of official reference coordinates. Not walking distance or boundary distance; manual nature tags remain independent.';
notify pgrst,'reload schema';
commit;
