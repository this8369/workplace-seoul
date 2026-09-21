do $$
declare
  changed integer;
begin
  update public.buildings
  set name = '원그로브', updated_at = now()
  where name = '마곡지구 CP4 / 원웨스트서울 (원그로브)';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'Expected one One Grove asset, updated %', changed;
  end if;
end $$;
