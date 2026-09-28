begin;
-- Match the existing public catalog policy without changing publication metadata.
-- Unverified provider records remain private, and visitors still cannot write.
alter policy published_parcels on public.building_parcels using(
 verified and exists(select 1 from public.buildings b where b.id=building_id)
);
alter policy published_places on public.building_places using(
 verified and exists(select 1 from public.buildings b where b.id=building_id)
);
notify pgrst,'reload schema';
commit;
