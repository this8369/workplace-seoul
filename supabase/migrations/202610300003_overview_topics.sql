begin;
-- Reuse evidence records and their existing review history. Topic metadata is
-- separate from values; original labels, values, IDs and provenance stay intact.
create function private.overview_topic_key(label text) returns text
language sql immutable strict set search_path='' as $$
 select regexp_replace(lower(normalize(btrim(regexp_replace(label,'^(비교표|.+ 전체)\s*·\s*','','')),NFKC)), '[^a-z0-9가-힣]+','','g')
$$;
create table public.asset_overview_topics (
 code text primary key,
 label text not null check(length(btrim(label)) between 1 and 80),
 normalized_label text generated always as (private.overview_topic_key(label)) stored unique,
 entity text,
 field text,
 overview_label text,
 unit text check(length(unit)<=30),
 sort_order integer not null default 1000,
 created_at timestamptz not null default now(),
 check(length(normalized_label)>0),
 check((entity is null)=(field is null))
);
create table public.asset_overview_topic_aliases (
 alias_key text primary key,
 topic_code text not null references public.asset_overview_topics(code)
);
alter table public.asset_overview_topics enable row level security;
alter table public.asset_overview_topic_aliases enable row level security;
revoke all on public.asset_overview_topics,public.asset_overview_topic_aliases from public,anon,authenticated;
grant all on public.asset_overview_topics,public.asset_overview_topic_aliases to service_role;

insert into public.asset_overview_topics(code,label,entity,field,overview_label,unit,sort_order)
select 'builtin:'||field,label,entity,field,overview_label,unit,n from (values
 ('규모','buildings','floors_above','규모',null,1),
 ('연면적','buildings','gross_area_m2','연면적','㎡',2),
 ('건축면적','building_register_records','building_area_m2','건축면적','㎡',3),
 ('건물용도','building_register_records','main_use','건물용도',null,4),
 ('사용승인','buildings','usage_approved_on','사용승인',null,5),
 ('승강기','building_register_records','passenger_elevators','승강기','대',6),
 ('주차대수','buildings','parking_spaces','주차대수','대',7),
 ('냉난방','building_asset_profiles','heating_cooling','냉난방',null,8),
 ('기타시설','building_asset_profiles','other_facilities','기타시설',null,9),
 ('지하철 직연결','building_asset_profiles','subway_connections','지하철 직연결',null,10),
 ('인근 역','building_places','station','인근 역 · 500m',null,11),
 ('소유주','building_asset_profiles','owner_name','소유주',null,12),
 ('대지면적','building_asset_profiles','site_area_m2','대지면적','㎡',13),
 ('용적률','building_asset_profiles','floor_area_ratio','용적률','%',14),
 ('전용률','building_asset_profiles','efficiency_pct','전용률','%',15),
 ('천정고','building_asset_profiles','ceiling_height_m','천정고','m',16),
 ('Lease Span','building_asset_profiles','lease_span_m','Lease Span','m',17),
 ('오피스면적','building_asset_profiles','office_area_m2','오피스면적','㎡',18),
 ('리테일면적','building_asset_profiles','retail_area_m2','리테일면적','㎡',19),
 ('기준층면적(전용)','buildings','typical_floor_exclusive_pyeong','기준층면적(전용)','평',20),
 ('기준층면적(임대)','buildings','typical_floor_rentable_pyeong','기준층면적(임대)','평',21),
 ('시공사','building_asset_profiles','contractor_name','시공사',null,22),
 ('설계사','building_asset_profiles','architect_name','설계사',null,23),
 ('VIEW','building_asset_profiles','views','VIEW',null,24),
 ('자연환경','building_asset_profiles','green_spaces','자연환경',null,25),
 ('호텔','building_asset_profiles','hotels','호텔',null,26),
 ('어메니티 운영사','building_asset_profiles','amenity_operators','어메니티 운영사',null,27),
 ('브랜드 리테일 운영사','building_asset_profiles','retail_operators','브랜드 리테일 운영사',null,28),
 ('자산계약수전량','building_power_specs','contracted_capacity_mw','전력','MW',29),
 ('이중변전소','building_power_specs','dual_substation','전력',null,30),
 ('친환경 인증','building_asset_profiles','certifications','친환경 인증',null,31),
 ('준공연도','buildings','completion_year','사용승인','년',32)
) v(label,entity,field,overview_label,unit,n);
insert into public.asset_overview_topic_aliases select normalized_label,code from public.asset_overview_topics;
insert into public.asset_overview_topic_aliases(alias_key,topic_code)
select private.overview_topic_key(alias),'builtin:'||field from (values
 ('기준층 전용면적','typical_floor_exclusive_pyeong'),('기준층 전용','typical_floor_exclusive_pyeong'),
 ('기준층 임대면적','typical_floor_rentable_pyeong'),('기준층 임대','typical_floor_rentable_pyeong'),
 ('건축규모','floors_above'),('층수','floors_above'),('주차공간','parking_spaces'),
 ('리테일 전용면적','retail_area_m2'),('준공 예정','completion_year'),('준공','completion_year'),
 ('사용승인일','usage_approved_on'),('건축용도','main_use'),('건축물용도','main_use'),
 ('교통','subway_connections'),('지하철역','subway_connections'),('천장고','ceiling_height_m'),
 ('조망','views'),('냉난방 방식','heating_cooling'),('소유자','owner_name')
) v(alias,field) on conflict do nothing;

create function private.overview_import_label(raw text) returns text
language plpgsql immutable strict set search_path='' as $$
declare label text=regexp_replace(raw,'^(비교표|.+ 전체)\s*·\s*','','');
begin
 return case label
  when '리테일 · shop' then '리테일 판매시설'
  when '리테일 · 합계' then '리테일 점포 합계'
  when '리테일 · 식당' then '식당'
  when '리테일 · 카페/디저트' then '카페·디저트'
  when '리테일 · 헤어' then '헤어숍'
  when '리테일 · 은행' then '은행'
  when '리테일 · 편의점/글로서리' then '편의점·식료품점'
  when '리테일 · 유아 교육/놀이' then '유아 교육·놀이시설'
  when '리테일 · 운동(골프연습장)' then '골프연습장'
  when '웰니스 · 피트니스' then '피트니스'
  when '웰니스 · 건강검진센터' then '건강검진센터'
  when '웰니스 · 병의원·약국' then '병의원·약국'
  when '옥상정원(스카이라운지)' then '옥상정원·스카이라운지'
  when '공개공지/대지면적' then '공개공지 비율'
  when '주차대수 당 GFA' then '주차 1대당 연면적'
  when '자연환경 규모' then '자연환경 규모'
  when '비고' then '시설 비고'
  when 'IFC Seoul 운영사 확인' then '관리 운영사'
  else label end;
end $$;
alter table public.building_facts
 add column overview_topic_code text references public.asset_overview_topics(code),
 add column overview_enabled boolean not null default false;

alter function private.review_business_field(text,text) rename to review_business_field_before_topics;
create function private.review_business_field(entity text,field text) returns boolean language sql stable security definer set search_path='' as $$
 select private.review_business_field_before_topics(entity,field) and not(entity='building_facts' and field in ('overview_topic_code','overview_enabled'))
$$;

-- Only the supplied comparison evidence is promoted. Scope notes, internal
-- corrections and unknown values are retained as evidence without a UI row.
create temporary table overview_candidates on commit drop as
select f.id,f.field_key,f.value,f.unit,f.building_id,
 coalesce(f.complex_id,c.id) complex_id,
 c.representative_building_id,
 private.overview_import_label(f.field_key) label
from public.building_facts f join public.buildings b on b.id=f.building_id
left join public.building_complexes c on c.id=b.complex_id and c.published
where f.published and (public.is_public_detail_asset(b.id) or public.is_public_detail_asset(c.representative_building_id))
 and (f.field_key like '비교표 · %' or f.field_key like '% 전체 · %' or f.field_key='IFC Seoul 운영사 확인')
 and private.overview_import_label(f.field_key) not in ('적용 범위','IFC Seoul 교통 정정')
 and jsonb_typeof(f.value) in ('string','number','boolean')
 and coalesce(btrim(f.value#>>'{}'),'') not in ('','-','—','TBD','모름','미확인','미등록');

insert into public.asset_overview_topics(code,label,unit)
select 'custom:'||private.overview_topic_key(c.label),min(c.label),max(c.unit)
from overview_candidates c
where not exists(select 1 from public.asset_overview_topic_aliases a where a.alias_key=private.overview_topic_key(c.label))
group by private.overview_topic_key(c.label)
on conflict(normalized_label) do nothing;
insert into public.asset_overview_topic_aliases select normalized_label,code from public.asset_overview_topics on conflict do nothing;
insert into public.asset_overview_topic_aliases(alias_key,topic_code)
select distinct private.overview_topic_key(c.field_key),a.topic_code
from overview_candidates c join public.asset_overview_topic_aliases a on a.alias_key=private.overview_topic_key(c.label)
on conflict do nothing;
insert into public.asset_overview_topic_aliases(alias_key,topic_code)
select private.overview_topic_key(alias),t.code from (values
 ('옥상정원','옥상정원·스카이라운지'),('스카이라운지','옥상정원·스카이라운지'),
 ('자전거 주차','자전거주차장'),('자전거 보관소','자전거주차장'),
 ('휘트니스','피트니스'),('헬스장','피트니스'),('컨퍼런스룸','대형 컨퍼런스룸'),
 ('건강 검진 센터','건강검진센터'),('카페 디저트','카페·디저트')
) v(alias,label) join public.asset_overview_topics t on t.normalized_label=private.overview_topic_key(v.label)
on conflict do nothing;

update public.building_facts f set overview_topic_code=a.topic_code
from overview_candidates c join public.asset_overview_topic_aliases a on a.alias_key=private.overview_topic_key(c.label)
where f.id=c.id;
with ranked as (
 select c.id,c.complex_id,row_number() over(partition by coalesce(c.complex_id,c.building_id),f.overview_topic_code
  order by (c.building_id=c.representative_building_id) desc nulls last,f.as_of desc nulls last,f.created_at desc,f.id) n
 from overview_candidates c join public.building_facts f on f.id=c.id
 join public.asset_overview_topics t on t.code=f.overview_topic_code where t.entity is null
)
update public.building_facts f set overview_enabled=true,complex_id=r.complex_id from ranked r where f.id=r.id and r.n=1;
create unique index building_overview_topic_once on public.building_facts
 (coalesce(complex_id,building_id),overview_topic_code) where overview_enabled;

create function private.overview_fact_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.overview_enabled then
  if not exists(select 1 from public.asset_overview_topics t where t.code=new.overview_topic_code and t.entity is null)
   then raise exception 'overview_standard_topic';end if;
  if jsonb_typeof(new.value) not in ('string','number','boolean') or nullif(btrim(new.value#>>'{}'),'') is null
   or length(new.value#>>'{}')>2000 or length(new.unit)>30 then raise exception 'invalid_overview_value';end if;
 end if;
 return new;
end $$;
create trigger overview_fact_guard before insert or update on public.building_facts for each row execute function private.overview_fact_guard();

alter function private.review_asset_ids(text,uuid,jsonb) rename to review_asset_ids_before_topics;
create function private.review_asset_ids(entity text,rid uuid,r jsonb) returns uuid[] language plpgsql stable security definer set search_path='' as $$
declare ids uuid[];
begin
 if entity='building_facts' and coalesce((r->>'overview_enabled')::boolean,false) and r->>'complex_id' is not null then
  select array_agg(b.id order by b.id) into ids from public.buildings b where b.complex_id=(r->>'complex_id')::uuid;
  return coalesce(ids,'{}');
 end if;
 return private.review_asset_ids_before_topics(entity,rid,r);
end $$;

alter function private.fund_can_edit(text,uuid) rename to fund_can_edit_before_topics;
create function private.fund_can_edit(entity text,rid uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare asset uuid;
begin
 if entity='building_facts' then
  select coalesce(c.representative_building_id,f.building_id) into asset from public.building_facts f
  left join public.building_complexes c on c.id=f.complex_id and c.published where f.id=rid and f.overview_enabled;
  if asset is not null then return private.fund_can_edit_before_topics('buildings',asset);end if;
 end if;
 return private.fund_can_edit_before_topics(entity,rid);
end $$;
alter function private.review_record(text,uuid) rename to review_record_before_topics;
create function private.review_record(entity text,rid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; label text; raw_value jsonb;
begin
 r=private.review_record_before_topics(entity,rid);
 if entity='building_facts' and coalesce((r->>'overview_enabled')::boolean,false) then
  select t.label into label from public.asset_overview_topics t where t.code=r->>'overview_topic_code';
  select f.value into raw_value from public.building_facts f where f.id=rid;
  r=r||jsonb_build_object('name',label,'value',raw_value);
 end if;
 return r;
end $$;

create function public.asset_overview_fields(asset_key uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target uuid=asset_key; complex_key uuid; items jsonb; topics jsonb;
begin
 if not public.is_public_detail_asset(asset_key) then raise exception 'asset_not_found';end if;
 select c.id,c.representative_building_id into complex_key,target from public.buildings b
 join public.building_complexes c on c.id=b.complex_id and c.published where b.id=asset_key;
 target=coalesce(target,asset_key);
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'topic_code',t.code,'label',t.label,'value',f.value,'unit',f.unit)
  order by t.sort_order,t.label),'[]') into items
 from public.building_facts f join public.asset_overview_topics t on t.code=f.overview_topic_code
 where f.published and f.overview_enabled and t.entity is null
 and ((complex_key is not null and f.complex_id=complex_key) or (complex_key is null and f.complex_id is null and f.building_id=target));
 select coalesce(jsonb_agg(jsonb_build_object('code',t.code,'label',t.label,'entity',t.entity,'field',t.field,
  'overview_label',t.overview_label,'unit',t.unit,'aliases',coalesce((select jsonb_agg(a.alias_key) from public.asset_overview_topic_aliases a where a.topic_code=t.code),'[]'))
  order by t.sort_order,t.label),'[]') into topics from public.asset_overview_topics t;
 return jsonb_build_object('building_id',target,'items',items,'topics',topics);
end $$;

create function public.asset_overview_add_item(asset_key uuid,topic_name text,item_value jsonb,item_unit text,change_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid=asset_key; complex_key uuid; topic public.asset_overview_topics; existing public.building_facts; result public.building_facts; k text;
begin
 if not public.has_workplace_permission('details.read') then raise exception 'review_read_denied';end if;
 if not public.is_public_detail_asset(asset_key) then raise exception 'asset_not_found';end if;
 select c.id,c.representative_building_id into complex_key,target from public.buildings b
 join public.building_complexes c on c.id=b.complex_id and c.published where b.id=asset_key;
 target=coalesce(target,asset_key);
 if not(private.data_steward() or private.fund_can_edit('buildings',target)) then raise exception 'review_write_denied';end if;
 k=private.overview_topic_key(topic_name);
 if topic_name is null or length(btrim(topic_name)) not between 1 and 80 or nullif(k,'') is null
  or item_value is null or jsonb_typeof(item_value) not in ('string','number','boolean')
  or nullif(btrim(item_value#>>'{}'),'') is null or length(item_value#>>'{}')>2000 or length(item_unit)>30
  or nullif(btrim(change_reason),'') is null or length(change_reason)>4000 then raise exception 'invalid_overview_value';end if;
 perform pg_advisory_xact_lock(hashtextextended('overview-topic:'||k,0));
 select t.* into topic from public.asset_overview_topic_aliases a join public.asset_overview_topics t on t.code=a.topic_code where a.alias_key=k;
 if topic.code is null then
  insert into public.asset_overview_topics(code,label,unit) values('custom:'||k,btrim(topic_name),nullif(btrim(item_unit),'')) returning * into topic;
  insert into public.asset_overview_topic_aliases values(k,topic.code);
 end if;
 if topic.entity is not null then raise exception 'overview_standard_topic';end if;
 perform pg_advisory_xact_lock(hashtextextended('overview-item:'||coalesce(complex_key,target)::text||':'||topic.code,0));
 select * into existing from public.building_facts f where f.overview_enabled and coalesce(f.complex_id,f.building_id)=coalesce(complex_key,target) and f.overview_topic_code=topic.code;
 if existing.id is not null then
  if existing.value=item_value and existing.unit is not distinct from nullif(btrim(item_unit),'') then return to_jsonb(existing);end if;
  raise exception 'overview_item_exists';
 end if;
 perform set_config('app.review_origin','overview_item_add',true);
 perform set_config('app.review_reason',change_reason,true);
 insert into public.building_facts(building_id,complex_id,category,field_key,value,unit,as_of,source_name,published,overview_topic_code,overview_enabled)
 values(target,complex_key,'amenity',topic.label,item_value,nullif(btrim(item_unit),''),current_date,'사용자 입력',true,topic.code,true) returning * into result;
 return to_jsonb(result);
end $$;

revoke all on function public.asset_overview_fields(uuid),public.asset_overview_add_item(uuid,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.asset_overview_fields(uuid) to anon,authenticated;
grant execute on function public.asset_overview_add_item(uuid,text,jsonb,text,text) to authenticated;
revoke all on function private.overview_topic_key(text),private.overview_import_label(text),private.overview_fact_guard(),
 private.review_business_field_before_topics(text,text),private.review_business_field(text,text),private.fund_can_edit_before_topics(text,uuid),private.fund_can_edit(text,uuid),
 private.review_record_before_topics(text,uuid),private.review_record(text,uuid) from public,anon,authenticated;
revoke all on function private.review_asset_ids_before_topics(text,uuid,jsonb),private.review_asset_ids(text,uuid,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
