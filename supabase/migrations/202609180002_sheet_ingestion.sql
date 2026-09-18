begin;
create table private.sheet_records (
 source_id text not null,
 dataset text not null check(dataset in ('buildings','leasing_quarters','developments','transactions','tenant_moves')),
 record_id uuid not null,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 revision integer not null default 1,
 recorded_at timestamptz not null default now(),
 primary key(source_id,dataset,record_id)
);
create table private.sheet_record_history (
 source_id text not null,
 dataset text not null,
 record_id uuid not null,
 revision integer not null,
 payload jsonb not null,
 recorded_at timestamptz not null default now(),
 primary key(source_id,dataset,record_id,revision)
);
alter table private.sheet_records enable row level security;
alter table private.sheet_record_history enable row level security;
revoke all on private.sheet_records, private.sheet_record_history from public,anon,authenticated;

-- The caller must authenticate as the server-only service role. This only
-- records reviewed snapshots; it does not publish anything to the website.
create function public.record_sheet_batch(p_source_id text,p_dataset text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; rid uuid; previous jsonb; previous_revision integer; next_revision integer; result jsonb='[]'::jsonb;
begin
 if p_source_id is null or length(trim(p_source_id))=0 then raise exception 'source id required'; end if;
 if p_dataset is null or p_dataset not in ('buildings','leasing_quarters','developments','transactions','tenant_moves') then raise exception 'invalid dataset'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'batch must be an array of at most 500 rows'; end if;
 -- Serialize concurrent writers for the same source/dataset before reading revisions.
 perform pg_advisory_xact_lock(hashtextextended(p_source_id||':'||p_dataset,0));
 if exists(select 1 from jsonb_array_elements(p_rows) x group by x->>'id' having count(*)>1) then raise exception 'duplicate id in batch'; end if;
 for r in select * from jsonb_array_elements(p_rows) loop
  rid=(r->>'id')::uuid;
  if rid is null or r->'payload' is null or jsonb_typeof(r->'payload')<>'object' then raise exception 'id and object payload required'; end if;
  if coalesce(r->'payload'->>'검수상태','')<>'검수완료' or coalesce(r->'payload'->>'반영요청','')<>'요청' then raise exception 'row must be reviewed and requested'; end if;
  select payload,revision into previous,previous_revision from private.sheet_records where source_id=p_source_id and dataset=p_dataset and record_id=rid;
  if not found then
   next_revision=1;
   insert into private.sheet_records(source_id,dataset,record_id,payload) values(p_source_id,p_dataset,rid,r->'payload');
   insert into private.sheet_record_history(source_id,dataset,record_id,revision,payload) values(p_source_id,p_dataset,rid,1,r->'payload');
  elsif previous is distinct from r->'payload' then
   next_revision=previous_revision+1;
   update private.sheet_records set payload=r->'payload',revision=next_revision,recorded_at=now() where source_id=p_source_id and dataset=p_dataset and record_id=rid;
   insert into private.sheet_record_history(source_id,dataset,record_id,revision,payload) values(p_source_id,p_dataset,rid,next_revision,r->'payload');
  else next_revision=previous_revision;
  end if;
  result=result||jsonb_build_array(jsonb_build_object('id',rid,'revision',next_revision,'status','recorded'));
 end loop;
 return result;
end $$;
revoke all on function public.record_sheet_batch(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_sheet_batch(text,text,jsonb) to service_role;
commit;
