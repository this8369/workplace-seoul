begin;
alter table public.buildings add column typical_floor_area_pyeong numeric(14,4)
  check (typical_floor_area_pyeong > 0);
comment on column public.buildings.typical_floor_area_pyeong is
  'Source-reported typical floor area in pyeong; null when unavailable. Never inferred from gross area or floor count.';
commit;
