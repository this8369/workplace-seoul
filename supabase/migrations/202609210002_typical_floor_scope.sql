begin;
alter table public.buildings add column typical_floor_scope text;
comment on column public.buildings.typical_floor_scope is 'Human-reviewed applicability of published typical-floor measurements, distinct from the rent observation stratum.';
commit;
