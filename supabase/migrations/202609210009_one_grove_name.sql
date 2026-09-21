do $$
declare
  changed integer;
begin
  update public.buildings
  set name = '원그로브', updated_at = now()
  where name = '마곡지구 CP4 / 원웨스트서울 (원그로브)';
  get diagnostics changed = row_count;
  -- Fresh databases and repeated runs may not contain the previous name.
  -- Only ambiguous matches should prevent this targeted rename.
  if changed > 1 then
    raise exception 'Multiple One Grove assets matched: %', changed;
  end if;
end $$;
