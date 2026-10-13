begin;
-- Presentation groups are distinct from legal buildings. Existing IDs remain intact.
alter table public.building_complexes
 add column area_scope text not null default '등록 동 합계',
 add column common_facts jsonb not null default '[]' check(jsonb_typeof(common_facts)='array'),
 add column parking_spaces integer check(parking_spaces>=0),
 add column contracted_capacity_mw numeric check(contracted_capacity_mw>=0),
 add column dual_substation boolean;
alter table public.buildings add column complex_scope text check(complex_scope in ('aggregate','component','related'));
update public.buildings b set complex_scope=case when exists(select 1 from public.building_towers t where t.building_id=b.id) then 'component' else 'aggregate' end where complex_id is not null;
update public.building_complexes set area_scope=case when area_method='aggregate_record' then '단지 전체' else '등록 동 합계' end;
alter table public.building_towers
 add column component_kind text not null default 'building' check(component_kind in ('building','building_group','facility')),
 add column parent_tower_id uuid references public.building_towers(id),
 add column gross_area_m2 numeric check(gross_area_m2>0),
 add column net_area_m2 numeric check(net_area_m2>0),
 add column floors_above integer check(floors_above>=0),
 add column floors_below integer check(floors_below>=0),
 add column parking_spaces integer check(parking_spaces>=0),
 add column contracted_capacity_mw numeric check(contracted_capacity_mw>=0),
 add column main_use text,
 add column overview text,
 add column evidence jsonb not null default '{}' check(jsonb_typeof(evidence)='object');
-- Officefind-specific floor provenance remains enforced. Other component metrics
-- carry separate evidence, including official register PK/snapshot and scope.
comment on column public.building_towers.evidence is 'Source and scope for component metrics. Do not infer or split aggregate values. Physical children of a display group use parent_tower_id and are never summed alongside their parent.';
create function private.validate_complex_hierarchy() returns trigger language plpgsql set search_path='' as $$
begin
 if new.parent_tower_id is not null and not exists(select 1 from public.building_towers p where p.id=new.parent_tower_id and p.id<>new.id and p.complex_id=new.complex_id and p.component_kind='building_group' and p.parent_tower_id is null) then raise exception 'invalid_component_parent';end if;
 if new.component_kind<>'building_group' and exists(select 1 from public.building_towers c where c.parent_tower_id=new.id) then raise exception 'component_has_children';end if;
 return new;
end $$;
create trigger validate_complex_hierarchy before insert or update on public.building_towers for each row execute function private.validate_complex_hierarchy();
revoke all on function private.validate_complex_hierarchy() from public,anon,authenticated;
-- Only scope/name metadata is appended to the public projections. Member-only
-- facility metrics, power and common facts never enter anonymous catalog caches.
create or replace view public.catalog_complexes with(security_barrier=true) as
 select c.id,c.name,c.representative_building_id,c.gross_area_m2,c.area_method,c.area_scope
 from public.building_complexes c join private.catalog_publications p on p.record_type='building_complexes' and p.record_id=c.id
 join public.catalog_buildings b on b.id=c.representative_building_id;
create or replace view public.catalog_towers with(security_barrier=true) as
 select t.id,t.complex_id,t.building_id,t.label,t.sort_order,t.typical_floor_rentable_pyeong,t.typical_floor_exclusive_pyeong,t.source_period,t.component_kind,t.parent_tower_id
 from public.building_towers t join private.catalog_publications p on p.record_type='building_towers' and p.record_id=t.id
 join public.catalog_complexes c on c.id=t.complex_id
 where t.building_id is null or exists(select 1 from public.catalog_buildings b where b.id=t.building_id);
-- Identity/scope/provenance changes require a reviewed import, not a free-form
-- business-field edit. Normal numeric component fields retain existing review RPCs.
alter function private.review_business_field(text,text) rename to review_business_field_before_complex;
create function private.review_business_field(entity text,field text) returns boolean language sql stable security definer set search_path='' as $$
 select private.review_business_field_before_complex(entity,field) and not (entity in ('buildings','building_complexes','building_towers') and field in ('complex_scope','area_scope','area_method','component_kind','common_facts','evidence','sort_order'))
$$;
revoke all on function private.review_business_field_before_complex(text,text),private.review_business_field(text,text) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
