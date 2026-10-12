begin;
-- Current AUM date interpretation is provisional and may change later.
-- Beneficiary currency is inferred from the KRW AUM cross-report comparison,
-- not represented as an explicit currency label supplied by the source.
select set_config('app.master_origin','source_clarification',true),
       set_config('app.master_reason','수익자 금액을 AUM 원화 금액과 대조하여 KRW로 판단. 원본에 통화 표기가 없어 추론 상태를 보존.',true);
update private.master_beneficiary_positions
set currency_code='KRW',currency_status='inferred_krw_cross_report'
where source_system='aurum' and source_exported_on=date '2026-10-06'
  and currency_code is null and currency_status='source_unit_unstated' and revision=1;

select set_config('app.master_reason','원본 제공자가 AUM 입력일자는 시스템에 입력한 날짜라고 확인. 실제 AUM 금액 기준일은 원본에 별도 제공되지 않음.',true);
alter table private.master_aum_snapshots add column entered_on_interpretation text;
update private.master_aum_snapshots
set business_as_of_status='not_provided',entered_on_interpretation='system_entry_date_provisional'
where source_system='aurum' and source_exported_on=date '2026-10-06'
  and business_as_of is null and business_as_of_status='needs_confirmation' and revision=1;

update private.master_review_issues
set issue_kind='aum_cross_report_observation',severity='information',
    details=details || '{"date_alignment":"not_established","aum_entered_on_meaning":"system_entry_date","comparison_scope":"legacy subset selected by entry date; not a same-as-of reconciliation"}'::jsonb,
    resolution_note='AUM 입력일자는 시스템 입력일이므로 같은 금액 기준일의 불일치로 간주하지 않음. 실제 기준일·집계 범위 확인 전 참고 관측값으로 보존.'
where issue_kind='aum_position_total_difference' and status='open' and revision=1;

update private.master_field_dictionary
set rules=rules || '["2026-10-12 현재 해석: 시스템 입력일. 사용자가 향후 기준 변경 가능성을 알림. entered_on_interpretation과 변경 이력으로 해석을 관리하며 원본 날짜는 보존."]'::jsonb
where source_system='aurum' and target_table='master_aum_snapshots' and target_field='aum_entered_on';
update private.master_field_dictionary
set rules=rules || '["AUM 원화 금액과 대조하여 원화 환산액으로 판단. 원본 통화 표기 없음: inferred_krw_cross_report. 금액 자체는 변경하지 않음."]'::jsonb
where source_system='aurum' and target_table='master_beneficiary_positions'
  and target_field in ('commitment_amount','funded_amount','unfunded_amount','subscription_redemption_amount');
comment on column private.master_aum_snapshots.aum_entered_on is 'Source AUM 입력일자. Currently interpreted as system entry date, provisionally; preserve original date when interpretation changes.';
comment on column private.master_aum_snapshots.entered_on_interpretation is 'Audited interpretation of AUM 입력일자, independent of its raw source value and actual business_as_of.';
comment on column private.master_aum_snapshots.business_as_of is 'Actual AUM business date. NULL when not provided; do not substitute entry or administrator dates.';
create or replace function public.master_list_records(entity_type text, search_text text default '', page_limit integer default 30, page_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare payload jsonb; predicate text='true';
begin
 if not public.has_master_permission('master.read') then raise exception 'master_read_denied'; end if;
 if not private.master_table_allowed(entity_type) then raise exception 'invalid_entity_type'; end if;
 if page_limit is null or page_offset is null or search_text is null or page_limit not between 1 and 100 or page_offset not between 0 and 100000 or length(search_text)>200 then raise exception 'invalid_page'; end if;
 if not public.has_master_permission('master.confidential') then
  if entity_type='master_beneficiary_positions' then predicate='not coalesce(t.confidential,true)';
  elsif entity_type='master_parties' then predicate='not coalesce(t.confidential,true)';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='private' and table_name=entity_type and column_name='party_id') then
   predicate=predicate||' and (t.party_id is null or exists(select 1 from private.master_parties p where p.id=t.party_id and not coalesce(p.confidential,true)))';
  end if;
 end if;
 execute format('select coalesce(jsonb_agg(r.record),''[]''::jsonb) from (select private.master_json(to_jsonb(t),$4) record from private.%I t where %s and ($1='''' or private.master_json(to_jsonb(t),$4)::text ilike ''%%''||$1||''%%'') order by t.created_at,t.id limit $2 offset $3) r',entity_type,predicate)
 into payload using search_text,page_limit,page_offset,entity_type;
 return jsonb_build_object('records',payload,'limit',page_limit,'offset',page_offset);
end $$;
revoke all on function public.master_list_records(text,text,integer,integer) from public,anon;
grant execute on function public.master_list_records(text,text,integer,integer) to authenticated;

-- Only fields deliberately edited through MY override the existing member detail.
create function public.master_asset_corrections(building_key uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a private.master_assets; fields text[];
begin
 if not public.has_workplace_permission('details.read') then raise exception 'master_read_denied'; end if;
 if not public.has_master_permission('master.read') then return null; end if;
 select * into a from private.master_assets where existing_building_id=building_key;
 if a.id is null then return null; end if;
 select array_agg(distinct field) into fields from private.master_change_history h
 cross join lateral unnest(h.changed_fields) field
 where h.table_name='master_assets' and h.record_id=a.id and h.change_origin='my';
 return jsonb_build_object('asset',private.master_json(to_jsonb(a),'master_assets'),'edited_fields',coalesce(fields,'{}'::text[]));
end $$;
revoke all on function public.master_asset_corrections(uuid) from public,anon;
grant execute on function public.master_asset_corrections(uuid) to authenticated;
commit;
