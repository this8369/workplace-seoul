begin;
-- Tower floor areas originally supported imported Officefind observations only.
-- Verified manual edits have their own provenance; never fabricate source URLs/hashes.
create function private.record_tower_floor_edit() returns trigger
language plpgsql security definer set search_path='' as $$
declare k text; entries jsonb; before_row jsonb=to_jsonb(old); after_row jsonb=to_jsonb(new); why text;
begin
 if auth.uid() is null or current_setting('app.review_origin',true) is distinct from 'field_edit' then return new;end if;
 why=nullif(trim(current_setting('app.review_reason',true)),'');
 if why is null then raise exception 'manual_floor_reason_required';end if;
 entries=coalesce(new.evidence->'manual_floor_edits','{}'::jsonb);
 foreach k in array array['typical_floor_exclusive_pyeong','typical_floor_rentable_pyeong'] loop
  if before_row->k is distinct from after_row->k then
   entries=entries||jsonb_build_object(k,jsonb_build_object('value',after_row->k,'edited_by',auth.uid(),'edited_at',now(),'reason',why));
  end if;
 end loop;
 new.evidence=jsonb_set(coalesce(new.evidence,'{}'::jsonb),'{manual_floor_edits}',entries,true);
 return new;
end $$;
revoke all on function private.record_tower_floor_edit() from public,anon,authenticated;
create trigger record_tower_floor_edit before update of typical_floor_exclusive_pyeong,typical_floor_rentable_pyeong on public.building_towers
 for each row execute function private.record_tower_floor_edit();
alter table public.building_towers drop constraint building_towers_check1;
alter table public.building_towers add constraint tower_floor_provenance check(
 (typical_floor_rentable_pyeong is null and typical_floor_exclusive_pyeong is null)
 or (source_url is not null and collected_at is not null and content_hash is not null)
 or (
  (typical_floor_exclusive_pyeong is null or (
   coalesce(evidence#>'{manual_floor_edits,typical_floor_exclusive_pyeong,value}'=to_jsonb(typical_floor_exclusive_pyeong),false)
   and nullif(evidence#>>'{manual_floor_edits,typical_floor_exclusive_pyeong,edited_by}','') is not null
   and nullif(evidence#>>'{manual_floor_edits,typical_floor_exclusive_pyeong,edited_at}','') is not null
   and nullif(trim(evidence#>>'{manual_floor_edits,typical_floor_exclusive_pyeong,reason}'),'') is not null
  ))
  and (typical_floor_rentable_pyeong is null or (
   coalesce(evidence#>'{manual_floor_edits,typical_floor_rentable_pyeong,value}'=to_jsonb(typical_floor_rentable_pyeong),false)
   and nullif(evidence#>>'{manual_floor_edits,typical_floor_rentable_pyeong,edited_by}','') is not null
   and nullif(evidence#>>'{manual_floor_edits,typical_floor_rentable_pyeong,edited_at}','') is not null
   and nullif(trim(evidence#>>'{manual_floor_edits,typical_floor_rentable_pyeong,reason}'),'') is not null
  ))
 )
);
comment on constraint tower_floor_provenance on public.building_towers is 'Imported floor values retain their source evidence; manual values carry authenticated editor, timestamp and reason.';
notify pgrst,'reload schema';
commit;
