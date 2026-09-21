-- Place the Seoul Others label over Dongjak without changing district membership.
update public.districts
set membership_boundary = jsonb_set(membership_boundary, '{properties,labelPosition}', '[126.951,37.500]'::jsonb),
    display_boundary = jsonb_set(display_boundary, '{properties,labelPosition}', '[126.951,37.500]'::jsonb)
where key = 'Others';
