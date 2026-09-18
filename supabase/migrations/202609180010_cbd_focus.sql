begin;
-- Use the station as CBD's navigation anchor; retain responsive district zoom.
update public.districts
set focus_center='[126.98262,37.56595]'::jsonb,
    focus_zoom=null,
    source_metadata=source_metadata || jsonb_build_object('focus',jsonb_build_object(
      'name','을지로입구역',
      'source_url','https://mapcarta.com/N5935738064',
      'coordinate_order','longitude,latitude'
    ))
where key='CBD';
commit;
