begin;

-- The title sheet often reports zero site area; its official parent recap
-- carries the actual site. Preserve the Ministry's hierarchy and its evidence.
alter table public.building_register_records
 add column parent_register_pk text,
 add column parent_snapshot_id uuid references private.building_register_snapshots(id),
 add column site_parcel_pnus text[],
 add column site_parcel_snapshot_id uuid references private.building_register_snapshots(id);

create function private.refresh_register_site_sources(parcel text) returns void
language sql set search_path='' as $$
 with latest as (
  select id,response from private.building_register_snapshots
  where parcel_key=parcel and operation='getBrBasisOulnInfo'
  order by collected_at desc,imported_at desc limit 1
 ), items as (
  select s.id snapshot_id,item from latest s
  cross join lateral jsonb_array_elements(s.response) page
  cross join lateral (select coalesce(page->'response',page)->'body'->'items'->'item' value) raw
  cross join lateral jsonb_array_elements(case jsonb_typeof(raw.value)
    when 'array' then raw.value when 'object' then jsonb_build_array(raw.value) else '[]'::jsonb end) item
 ), parents as (
  select item->>'mgmBldrgstPk' pk,
    min(nullif(nullif(trim(item->>'mgmUpBldrgstPk'),''),'0')) parent_pk,
    snapshot_id
  from items where item->>'mgmUpBldrgstPk' ~ '^\d+$'
  group by item->>'mgmBldrgstPk',snapshot_id
  having count(distinct coalesce(nullif(nullif(trim(item->>'mgmUpBldrgstPk'),''),'0'),'root'))=1
 )
 update public.building_register_records r
 set parent_register_pk=p.parent_pk,parent_snapshot_id=p.snapshot_id
 from latest s left join parents p on true
 where r.parcel_key=parcel and r.record_kind='building' and r.is_current
   and r.register_pk=p.pk;
 -- A complete newer response can remove a former relationship.
 update public.building_register_records r set parent_register_pk=null,parent_snapshot_id=null
 where r.parcel_key=parcel and r.record_kind='building' and r.is_current
 and exists(select 1 from private.building_register_snapshots s where s.parcel_key=parcel and s.operation='getBrBasisOulnInfo')
 and r.parent_snapshot_id is distinct from (
  select id from private.building_register_snapshots s where s.parcel_key=parcel and s.operation='getBrBasisOulnInfo'
  order by collected_at desc,imported_at desc limit 1
 );

 -- A cadastral fallback must contain the entire official primary/attached
 -- parcel set. A single address parcel is insufficient evidence on its own.
 with latest as (
  select id,response from private.building_register_snapshots
  where parcel_key=parcel and operation='getBrAtchJibunInfo'
  order by collected_at desc,imported_at desc limit 1
 ), items as (
  select item from latest s cross join lateral jsonb_array_elements(s.response) page
  cross join lateral (select coalesce(page->'response',page)->'body'->'items'->'item' value) raw
  cross join lateral jsonb_array_elements(case jsonb_typeof(raw.value)
    when 'array' then raw.value when 'object' then jsonb_build_array(raw.value) else '[]'::jsonb end) item
 ), attached as (
  select item->>'mgmBldrgstPk' pk,
   case when item->>'atchSigunguCd' ~ '^\d{1,5}$' and item->>'atchBjdongCd' ~ '^\d{1,5}$'
     and item->>'atchPlatGbCd' in ('0','1') and item->>'atchBun' ~ '^\d{1,4}$' and item->>'atchJi' ~ '^\d{1,4}$'
   then lpad(item->>'atchSigunguCd',5,'0')||lpad(item->>'atchBjdongCd',5,'0')||
     case item->>'atchPlatGbCd' when '1' then '2' else '1' end||
     lpad(item->>'atchBun',4,'0')||lpad(item->>'atchJi',4,'0') end pnu
  from items
 ), parcels as (
  select r.id,s.id snapshot_id,
   case when split_part(parcel,'-',3) in ('0','1') and not exists(select 1 from attached a where a.pk=r.register_pk and a.pnu is null)
   then array(select distinct pnu from (
    select split_part(parcel,'-',1)||split_part(parcel,'-',2)||
      case split_part(parcel,'-',3) when '1' then '2' else '1' end||split_part(parcel,'-',4)||split_part(parcel,'-',5) pnu
    union all select a.pnu from attached a where a.pk=r.register_pk
   ) p order by pnu) end pnus
  from public.building_register_records r cross join latest s
  where r.parcel_key=parcel and r.is_current
 )
 update public.building_register_records r set site_parcel_pnus=p.pnus,site_parcel_snapshot_id=p.snapshot_id
 from parcels p where p.id=r.id;
$$;
revoke all on function private.refresh_register_site_sources(text) from public,anon,authenticated;
grant execute on function private.refresh_register_site_sources(text) to service_role;
select private.refresh_register_site_sources(parcel_key) from (
 select distinct parcel_key from private.building_register_snapshots where operation in ('getBrBasisOulnInfo','getBrAtchJibunInfo')
) parcels;

-- Resolve shared site area from reviewed title links, never from address alone.
-- Distinct legal sites are added once, only if every component is accounted for.
create view private.building_register_site_areas as
with linked as (
 select l.building_id,r.*,
  count(*) filter(where r.record_kind='complex') over(partition by l.building_id) recap_count,
  count(*) filter(where r.record_kind='building') over(partition by l.building_id) title_count
 from public.building_register_links l join public.building_register_records r on r.id=l.record_id
 where l.status='verified' and r.is_current
), roots as (
 select r.* from linked r where (r.record_kind='complex' and r.recap_count=1)
 or (r.record_kind='building' and r.recap_count=0 and r.title_count=1)
), sources as (
 select r.building_id,
  case when p.id is not null then 'register:'||p.register_pk
    when r.record_kind='complex' then 'register:'||r.register_pk
    when r.parent_snapshot_id is not null and r.parent_register_pk is null then 'parcel:'||r.parcel_key end site_key,
  coalesce(p.parcel_key,r.parcel_key) parcel_key,
  coalesce(case when p.id is not null then nullif(p.site_area_m2,0) else nullif(r.site_area_m2,0) end,parcels.area_m2) area_m2
 from roots r left join public.building_register_records p
  on r.record_kind='building' and r.parent_snapshot_id is not null
  and p.register_pk=r.parent_register_pk and p.record_kind='complex' and p.is_current
  and p.parcel_key=r.parcel_key
 left join lateral (
  select sum(v.area_m2) area_m2 from unnest(case when p.id is not null then p.site_parcel_pnus else r.site_parcel_pnus end) expected(pnu)
  left join public.building_parcels v on v.building_id=r.building_id and v.pnu=expected.pnu and v.verified
  having count(*)>0 and count(*)=count(*) filter(where v.area_m2>0)
 ) parcels on true
), members as (
 select b.id,coalesce(c.id,b.id) group_id,s.site_key,s.parcel_key,s.area_m2
 from public.buildings b left join public.building_complexes c on c.id=b.complex_id and c.published
 left join sources s on s.building_id=b.id
 where b.status='operating' and (c.id is null or b.complex_scope='component')
), complete as (
 select group_id from members group by group_id
 having count(*)=count(*) filter(where site_key is not null and area_m2>0)
), sites as (
 select m.group_id,m.site_key,min(m.area_m2) area_m2,min(m.parcel_key) parcel_key,
  min(m.area_m2)=max(m.area_m2) consistent
 from members m join complete c using(group_id) group by m.group_id,m.site_key
), totals as (
 select group_id,sum(area_m2) area_m2 from sites group by group_id
 having bool_and(consistent) and count(*)=count(distinct parcel_key)
)
select b.id,t.area_m2 site_area_m2 from public.buildings b
left join public.building_complexes c on c.id=b.complex_id and c.published
join totals t on t.group_id=coalesce(c.id,b.id)
where b.status='operating';
revoke all on private.building_register_site_areas from public,anon,authenticated;

create or replace view public.detail_building_register_overview with(security_barrier=true) as
with assets as (
 select b.id,b.status,b.complex_scope,b.component_source_building_id,
   c.id complex_id,c.representative_building_id,
   coalesce(c.representative_building_id,b.id) common_source_id
 from public.buildings b left join public.building_complexes c on c.id=b.complex_id and c.published
 where public.is_public_detail_asset(b.id)
), linked as (
 select l.building_id,r.*,
   count(*) filter(where r.record_kind='complex') over(partition by l.building_id) recap_count,
   count(*) filter(where r.record_kind='building') over(partition by l.building_id) title_count
 from public.building_register_links l join public.building_register_records r on r.id=l.record_id
 where l.status='verified' and r.is_current
), chosen as (
 select a.*,o.id own_record_id,o.gross_area_m2,o.floors_above,o.floors_below,o.approval_date,
   s.id common_record_id,s.site_area_m2,s.floor_area_ratio,
   case when s.parking_total>=0 then s.parking_total
     when s.parking_indoor_self>=0 and s.parking_outdoor_self>=0
      and s.parking_indoor_mechanical>=0 and s.parking_outdoor_mechanical>=0
      and s.parking_indoor_self+s.parking_outdoor_self+s.parking_indoor_mechanical+s.parking_outdoor_mechanical>0
     then s.parking_indoor_self+s.parking_outdoor_self+s.parking_indoor_mechanical+s.parking_outdoor_mechanical
   end parking_spaces
 from assets a
 left join lateral (
   select r.* from linked r where r.building_id=a.id and a.status='operating' and (
     (a.complex_scope='component' and r.record_kind='building' and r.title_count=1)
     or (a.complex_scope is distinct from 'component' and (
       (r.record_kind='complex' and r.recap_count=1)
       or (r.record_kind='building' and r.recap_count=0 and r.title_count=1)
     ))
   ) limit 1
 ) o on true
 left join lateral (
   select r.* from linked r join public.buildings source on source.id=r.building_id
   where r.building_id=a.common_source_id and a.status='operating' and (
     (r.record_kind='complex' and r.recap_count=1)
     or (r.record_kind='building' and r.recap_count=0 and r.title_count=1
       and (a.complex_id is null or source.complex_scope='aggregate'))
   ) limit 1
 ) s on true
)
select c.id,c.own_record_id,c.common_record_id,
 case when c.gross_area_m2>0 then c.gross_area_m2 end gross_area_m2,
 case when c.floors_above>0 and c.floors_above=trunc(c.floors_above) then c.floors_above::integer end floors_above,
 case when c.floors_below>=0 and c.floors_below=trunc(c.floors_below) then c.floors_below::integer end floors_below,
 case when c.site_area_m2>0 then c.site_area_m2 else sites.site_area_m2 end site_area_m2,
 case when c.floor_area_ratio>0 then c.floor_area_ratio end floor_area_ratio,
 case when c.parking_spaces>=0 and c.parking_spaces=trunc(c.parking_spaces) then c.parking_spaces::integer end parking_spaces,
 c.approval_date usage_approved_on,extract(year from c.approval_date)::integer completion_year
from chosen c left join lateral (
 select s.site_area_m2 from private.building_register_site_areas s where s.id=c.id limit 1
) sites on true;
notify pgrst,'reload schema';
commit;
