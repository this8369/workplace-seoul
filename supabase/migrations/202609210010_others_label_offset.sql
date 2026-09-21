-- Offset the district label from the base map's Dongjak-gu text.
update public.districts
set membership_boundary = jsonb_set(membership_boundary, '{properties,labelPosition}', '[126.939,37.509]'::jsonb),
    display_boundary = jsonb_set(display_boundary, '{properties,labelPosition}', '[126.939,37.509]'::jsonb)
where key = 'Others';
