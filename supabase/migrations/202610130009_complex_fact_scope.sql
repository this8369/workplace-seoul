begin;
-- Keep original evidence IDs/history while recording which facts describe the
-- whole complex. A common fact is displayed once, never as a per-tower metric.
alter table public.building_facts add column complex_id uuid references public.building_complexes(id);
create index building_facts_complex on public.building_facts(complex_id) where complex_id is not null;
create function private.validate_complex_fact() returns trigger language plpgsql set search_path='' as $$
begin
 if new.complex_id is not null and not exists(select 1 from public.buildings b where b.id=new.building_id and b.complex_id=new.complex_id) then raise exception 'fact_complex_mismatch';end if;
 return new;
end $$;
create trigger validate_complex_fact before insert or update on public.building_facts for each row execute function private.validate_complex_fact();
revoke all on function private.validate_complex_fact() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
