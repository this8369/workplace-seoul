begin;
-- The source also expresses rental strata as a range without a low/mid/high label.
create or replace function private.normalize_building_name(value text) returns text
language sql immutable strict set search_path='' as $$
 select trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
   regexp_replace(regexp_replace(value,
    '[<(\[（][[:space:]]*[0-9]+층[[:space:]]*[~∼–-][[:space:]]*[0-9]+층[[:space:]]*[>)\]）]', '', 'g'),
    '(초고|저|중|고)층(부)?[0-9]*([[:space:]]+[0-9]+층[[:space:]]*[~∼–-][[:space:]]*[0-9]+층)?', '', 'g'),
   '<[[:space:]]*>|\([[:space:]]*\)|\[[[:space:]]*\]|（[[:space:]]*）', '', 'g'),
   '([<(\[（])[[:space:]]+', '\1', 'g'),
   '[[:space:]]+([>)\]）])', '\1', 'g'),
   '[[:space:]]+', ' ', 'g'))
$$;
create or replace function private.normalize_asset_labels() returns trigger
language plpgsql security definer set search_path='' as $$
declare label text; record jsonb=to_jsonb(new);
begin
 foreach label in array tg_argv loop
  if record->>label ~ '(초고|저|중|고)층|[<(\[（][[:space:]]*[0-9]+층' then
   record=jsonb_set(record,array[label],to_jsonb(private.normalize_building_name(record->>label)));
  end if;
 end loop;
 new=jsonb_populate_record(new,record);
 return new;
end $$;
update public.buildings set name=private.normalize_building_name(name)
 where name ~ '[<(\[（][[:space:]]*[0-9]+층';
update public.transactions set building_name=private.normalize_building_name(building_name)
 where building_name ~ '[<(\[（][[:space:]]*[0-9]+층';
update public.tenant_movements set from_name=private.normalize_building_name(from_name),to_name=private.normalize_building_name(to_name)
 where from_name ~ '[<(\[（][[:space:]]*[0-9]+층' or to_name ~ '[<(\[（][[:space:]]*[0-9]+층';
update public.building_images set review_note=private.normalize_building_name(review_note)
 where review_note ~ '[<(\[（][[:space:]]*[0-9]+층';
commit;
