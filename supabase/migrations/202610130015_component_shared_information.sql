begin;
-- Preserve original records as the editable source of complex-wide information.
-- A component keeps its own metrics/photos; this link does not duplicate totals.
alter table public.buildings add column component_source_building_id uuid references public.buildings(id);
alter table public.buildings add constraint component_source_not_self check(component_source_building_id is distinct from id);
update public.buildings b set component_source_building_id=m.parent_building_id
from private.complex_component_assets m where b.id=m.building_id;
comment on column public.buildings.component_source_building_id is 'Member-only link to the original aggregate asset. Shared fields keep their original IDs, scope and edit history.';
notify pgrst,'reload schema';
commit;
