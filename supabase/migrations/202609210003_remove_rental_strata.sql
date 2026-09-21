begin;
-- Asset identity uses physical towers, never rental floor bands.
-- Historical source snapshots/revisions remain evidence, not active dimensions.
create function private.normalize_building_name(value text) returns text
language sql immutable strict set search_path='' as $$
 select trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
   regexp_replace(value,
    '(초고|저|중|고)층(부)?[0-9]*([[:space:]]+[0-9]+층[[:space:]]*[~∼–-][[:space:]]*[0-9]+층)?', '', 'g'),
   '<[[:space:]]*>|\([[:space:]]*\)|\[[[:space:]]*\]|（[[:space:]]*）', '', 'g'),
   '([<(\[（])[[:space:]]+', '\1', 'g'),
   '[[:space:]]+([>)\]）])', '\1', 'g'),
   '[[:space:]]+', ' ', 'g'))
$$;
revoke all on function private.normalize_building_name(text) from public,anon,authenticated;

-- Clean incoming labels at the database boundary, including future imports.
create function private.normalize_asset_labels() returns trigger
language plpgsql security definer set search_path='' as $$
declare label text; record jsonb=to_jsonb(new);
begin
 foreach label in array tg_argv loop
  if record->>label ~ '(초고|저|중|고)층' then
   record=jsonb_set(record,array[label],to_jsonb(private.normalize_building_name(record->>label)));
  end if;
 end loop;
 new=jsonb_populate_record(new,record);
 return new;
end $$;
revoke all on function private.normalize_asset_labels() from public,anon,authenticated;

create trigger normalize_building_labels before insert or update of name,typical_floor_scope on public.buildings
 for each row execute function private.normalize_asset_labels('name','typical_floor_scope');
create trigger normalize_transaction_labels before insert or update of building_name on public.transactions
 for each row execute function private.normalize_asset_labels('building_name');
create trigger normalize_movement_labels before insert or update of from_name,to_name on public.tenant_movements
 for each row execute function private.normalize_asset_labels('from_name','to_name');
create trigger normalize_image_labels before insert or update of review_note on public.building_images
 for each row execute function private.normalize_asset_labels('review_note');

update public.buildings set name=private.normalize_building_name(name)
 where name ~ '(초고|저|중|고)층';
update public.buildings set typical_floor_scope='A·B동 공시 기준층'
 where typical_floor_scope='A·B동 공시 기준층 · 저층부 별도 미확인';
update public.buildings set typical_floor_scope=private.normalize_building_name(typical_floor_scope)
 where typical_floor_scope ~ '(초고|저|중|고)층';
update public.transactions set building_name=private.normalize_building_name(building_name)
 where building_name ~ '(초고|저|중|고)층';
update public.tenant_movements set from_name=private.normalize_building_name(from_name),to_name=private.normalize_building_name(to_name)
 where from_name ~ '(초고|저|중|고)층' or to_name ~ '(초고|저|중|고)층';
update public.building_images set review_note=private.normalize_building_name(review_note)
 where review_note ~ '(초고|저|중|고)층';
comment on column public.buildings.typical_floor_scope is 'Applicability of typical-floor measurements to physical buildings/towers. Rental low/mid/high floor bands are not modeled.';
commit;
