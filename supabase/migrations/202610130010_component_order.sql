begin;
-- A transaction may reorder several components without transient collisions.
alter table public.building_towers drop constraint building_towers_complex_id_sort_order_key;
alter table public.building_towers add constraint building_towers_complex_id_sort_order_key unique(complex_id,sort_order) deferrable initially immediate;
commit;
