begin;
-- Physical/member-visible asset facts; never private lease or operating financials.
create table public.asset_certification_options (
 code text primary key, scheme text not null, grade text not null,
 official_url text not null check(official_url ~ '^https://'), logo_url text check(logo_url ~ '^https://'), sort_order integer not null
);
insert into public.asset_certification_options(code,scheme,grade,official_url,sort_order)
select lower(scheme)||'_'||n,scheme,grade,url,base+n::integer from (values
 ('LEED',array['Certified','Silver','Gold','Platinum'],'https://www.usgbc.org/leed',0),
 ('WELL',array['Bronze','Silver','Gold','Platinum'],'https://www.wellcertified.com/certification/v2/',10),
 ('BREEAM',array['Pass','Good','Very Good','Excellent','Outstanding'],'https://breeam.com/about/how-breeam-works',20),
 ('G-SEED',array['일반 (그린4등급)','우량 (그린3등급)','우수 (그린2등급)','최우수 (그린1등급)'],'https://gseed.or.kr/overview.do',30),
 ('ZEB',array['5등급','4등급','3등급','2등급','1등급','ZEB+'],'https://zeb.energy.or.kr/BC/BC03/BC03_05_002.do',40),
 ('ENERGY STAR',array['Certified'],'https://www.energystar.gov/buildings/building-recognition/building-certification',50)
) s(scheme,grades,url,base) cross join lateral unnest(grades) with ordinality g(grade,n);
create table public.asset_vocabulary (
 id bigint generated always as identity primary key,
 category text not null check(category in ('view','green_space','hotel','operator')),
 name text not null check(length(trim(name)) between 1 and 160),
 normalized_name text generated always as (lower(regexp_replace(trim(name),'\s+','','g'))) stored,
 unique(category,normalized_name)
);
insert into public.asset_vocabulary(category,name) values
 ('view','시티뷰'),('view','한강뷰'),('view','청계천뷰'),('view','덕수궁'),('view','서리풀공원');
create table public.building_asset_profiles (
 id uuid primary key references public.buildings(id) on delete cascade,
 building_id uuid not null unique references public.buildings(id) on delete cascade, check(id=building_id),
 owner_name text, ceiling_height_m numeric(8,3) check(ceiling_height_m>0), lease_span_m numeric(8,3) check(lease_span_m>0),
 office_area_m2 numeric(18,4) check(office_area_m2>=0), retail_area_m2 numeric(18,4) check(retail_area_m2>=0),
 office_area_basis text not null default 'unknown' check(office_area_basis in ('gross','exclusive','rentable','unknown')),
 retail_area_basis text not null default 'unknown' check(retail_area_basis in ('gross','exclusive','rentable','unknown')),
 contractor_name text, architect_name text,
 views jsonb not null default '[]', green_spaces jsonb not null default '[]', hotels jsonb not null default '[]',
 amenity_operators jsonb not null default '[]', retail_operators jsonb not null default '[]',
 subway_connections jsonb not null default '[]', certifications jsonb not null default '[]',
 updated_at timestamptz not null default now()
);
create table public.building_power_specs (
 id uuid primary key references public.buildings(id) on delete cascade,
 building_id uuid not null unique references public.buildings(id) on delete cascade, check(id=building_id),
 contracted_capacity_mw numeric(14,6) check(contracted_capacity_mw>=0), dual_substation boolean,
 updated_at timestamptz not null default now()
);
comment on column public.building_power_specs.contracted_capacity_mw is 'Contracted incoming electrical power in MW, not energy in MWh. Density = MW * 1000000 / gross floor area in pyeong (W/pyeong). Calculated on read, never separately edited.';
comment on column public.building_asset_profiles.subway_connections is 'Manually confirmed station connections with line names and nullable direct_connection. Nearby stations within 500m remain separate source-derived suggestions; proximity never proves direct connection.';
comment on column public.building_asset_profiles.certifications is 'Array of catalog-referenced certifications: option_code, status, certified_on, expires_on, certificate_url, logo_url. Planned/precertified/expired must not imply current certification.';

alter table public.asset_certification_options enable row level security;
alter table public.asset_vocabulary enable row level security;
alter table public.building_asset_profiles enable row level security;
alter table public.building_power_specs enable row level security;
create policy member_read on public.asset_certification_options for select to authenticated using(public.has_workplace_permission('details.read'));
create policy member_read on public.asset_vocabulary for select to authenticated using(public.has_workplace_permission('details.read'));
create policy member_read on public.building_asset_profiles for select to authenticated using(public.has_workplace_permission('details.read'));
create policy member_read on public.building_power_specs for select to authenticated using(public.has_workplace_permission('details.read'));
revoke all on public.asset_certification_options,public.asset_vocabulary,public.building_asset_profiles,public.building_power_specs from anon,authenticated;
grant select on public.asset_certification_options,public.asset_vocabulary,public.building_asset_profiles,public.building_power_specs to authenticated;
grant all on public.asset_certification_options,public.asset_vocabulary,public.building_asset_profiles,public.building_power_specs to service_role;

alter function private.review_schema(text) rename to review_schema_before_overview;
create function private.review_schema(entity text) returns text language sql immutable set search_path='' as $$
 select case when entity in ('building_asset_profiles','building_power_specs') then 'public' else private.review_schema_before_overview(entity) end
$$;
alter function private.fund_can_edit(text,uuid) rename to fund_can_edit_before_overview;
create function private.fund_can_edit(entity text,rid uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare assets uuid[]; objects uuid[];
begin
 if entity not in ('building_asset_profiles','building_power_specs','buildings','building_towers','development_records','master_assets') then return private.fund_can_edit_before_overview(entity,rid);end if;
 if not public.has_workplace_permission('details.read') then return false;end if;
 if entity in ('building_asset_profiles','building_power_specs','buildings') then assets=array[rid];
 elsif entity='master_assets' then select array[existing_building_id] into assets from private.master_assets where id=rid;
 elsif entity='building_towers' then select array_agg(id) into assets from public.buildings where complex_id=(select complex_id from public.building_towers where id=rid);
 else select array[building_id] into assets from public.development_records where id=rid;end if;
 select array_agg(o.id) into objects from private.master_investment_objects o join private.master_assets a on a.id=o.asset_id where a.existing_building_id=any(assets) and exists(select 1 from private.master_investments i where i.object_id=o.id);
 return coalesce(cardinality(objects)>0 and not exists(select 1 from unnest(objects) k where not private.fund_can_edit_before_overview('master_investment_objects',k)),false);
end $$;
revoke all on function private.review_schema_before_overview(text),private.review_schema(text),private.fund_can_edit_before_overview(text,uuid),private.fund_can_edit(text,uuid) from public,anon,authenticated;

create function private.validate_asset_profile() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; v jsonb; item jsonb; tag_category text; nm text; canonical text; names jsonb; seen text[]; v_code text;
begin
 foreach k in array array['owner_name','contractor_name','architect_name'] loop
  if length(to_jsonb(new)->>k)>500 then raise exception 'asset_text_too_long';end if;
 end loop;
 foreach k in array array['views','green_spaces','hotels','amenity_operators','retail_operators'] loop
  v=to_jsonb(new)->k;
  if v is null or jsonb_typeof(v)<>'array' or jsonb_array_length(v)>40 then raise exception 'invalid_asset_tags';end if;
  tag_category=case k when 'views' then 'view' when 'green_spaces' then 'green_space' when 'hotels' then 'hotel' else 'operator' end;
  names='[]'; seen='{}';
  for item in select * from jsonb_array_elements(v) loop
   nm=trim(item#>>'{}');
   if jsonb_typeof(item)<>'string' or length(nm) not between 1 and 160 then raise exception 'invalid_asset_tag';end if;
   v_code=lower(regexp_replace(nm,'\s+','','g'));
   if v_code=any(seen) then continue;end if;seen=array_append(seen,v_code);
   insert into public.asset_vocabulary(category,name) values(tag_category,nm) on conflict do nothing;
   select t.name into canonical from public.asset_vocabulary t where t.category=tag_category and t.normalized_name=v_code;
   names=names||jsonb_build_array(canonical);
  end loop;
  new=jsonb_populate_record(new,jsonb_build_object(k,names));
 end loop;
 if jsonb_typeof(new.subway_connections)<>'array' or jsonb_array_length(new.subway_connections)>30 then raise exception 'invalid_subway_connections';end if;
 for item in select * from jsonb_array_elements(new.subway_connections) loop
  if jsonb_typeof(item)<>'object' or length(trim(coalesce(item->>'station_name',''))) not between 1 and 100
    or jsonb_typeof(item->'lines') is distinct from 'array' or jsonb_array_length(item->'lines')>10
    or (item ? 'direct_connection' and jsonb_typeof(item->'direct_connection') not in ('boolean','null')) then raise exception 'invalid_subway_connection';end if;
  if exists(select 1 from jsonb_array_elements(item->'lines') l where jsonb_typeof(l)<>'string' or length(l#>>'{}') not between 1 and 40) then raise exception 'invalid_subway_line';end if;
 end loop;
 if jsonb_typeof(new.certifications)<>'array' or jsonb_array_length(new.certifications)>30 then raise exception 'invalid_certifications';end if;
 seen='{}';
 for item in select * from jsonb_array_elements(new.certifications) loop
  v_code=item->>'option_code';
  if not exists(select 1 from public.asset_certification_options o where o.code=v_code) or v_code=any(seen)
    or coalesce(item->>'status','') not in ('certified','precertified','planned','expired','unknown') then raise exception 'invalid_certification';end if;
  seen=array_append(seen,v_code);
  foreach k in array array['certificate_url','logo_url'] loop
   if nullif(item->>k,'') is not null and (length(item->>k)>2048 or item->>k !~ '^https://') then raise exception 'invalid_certification_url';end if;
  end loop;
  if nullif(item->>'certified_on','') is not null then perform (item->>'certified_on')::date;end if;
  if nullif(item->>'expires_on','') is not null then perform (item->>'expires_on')::date;end if;
  if nullif(item->>'expires_on','')::date < nullif(item->>'certified_on','')::date then raise exception 'invalid_certification_dates';end if;
 end loop;
 new.updated_at=now();return new;
end $$;
create trigger validate_asset_profile before insert or update on public.building_asset_profiles for each row execute function private.validate_asset_profile();
insert into public.building_asset_profiles(id,building_id) select id,id from public.buildings;
insert into public.building_power_specs(id,building_id) select id,id from public.buildings;
create trigger review_field_history after update on public.building_asset_profiles for each row execute function private.review_audit_public();
create trigger review_field_history after update on public.building_power_specs for each row execute function private.review_audit_public();
create function private.initialize_asset_overview() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.building_asset_profiles(id,building_id) values(new.id,new.id) on conflict do nothing;
 insert into public.building_power_specs(id,building_id) values(new.id,new.id) on conflict do nothing;return new;
end $$;
create trigger initialize_asset_overview after insert on public.buildings for each row execute function private.initialize_asset_overview();
create function public.asset_name_suggestions(category text,query text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_workplace_permission('details.read') then raise exception 'review_read_denied';end if;
 if category not in ('view','green_space','hotel','operator') or length(query)>160 then raise exception 'invalid_query';end if;
 return (select coalesce(jsonb_agg(name),'[]') from (select v.name from public.asset_vocabulary v where v.category=$1 and position(lower(trim($2)) in lower(v.name))>0 order by (lower(v.name)=lower(trim($2))) desc,v.name limit 20) s);
end $$;
revoke all on function private.validate_asset_profile(),private.initialize_asset_overview(),public.asset_name_suggestions(text,text) from public,anon,authenticated;
grant execute on function public.asset_name_suggestions(text,text) to authenticated;
notify pgrst,'reload schema';
commit;
