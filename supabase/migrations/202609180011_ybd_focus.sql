begin;
-- Use Yeouido station as YBD's navigation anchor; retain responsive zoom.
update public.districts
set focus_center='[126.9243,37.52167]'::jsonb,
    focus_zoom=null,
    source_metadata=source_metadata || jsonb_build_object('focus',jsonb_build_object(
      'name','여의도역',
      'source_url','https://mapcarta.com/33055950',
      'coordinate_order','longitude,latitude'
    ))
where key='YBD';
commit;
