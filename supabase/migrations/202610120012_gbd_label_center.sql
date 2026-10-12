-- Center the GBD label in its revised polygon while preserving the home camera.
update public.districts
set display_boundary = jsonb_set(
  jsonb_set(display_boundary, '{properties,overviewCenter}',
    coalesce(display_boundary #> '{properties,overviewCenter}', display_boundary #> '{properties,labelPosition}')),
  '{properties,labelPosition}', '[127.0580742,37.4990552]'::jsonb)
where key = 'GBD';
