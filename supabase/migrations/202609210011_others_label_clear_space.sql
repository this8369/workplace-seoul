-- Visually checked at the home zoom: clear space below the Dongjak-gu map label.
update public.districts
set membership_boundary = jsonb_set(membership_boundary, '{properties,labelPosition}', '[126.960,37.486]'::jsonb),
    display_boundary = jsonb_set(display_boundary, '{properties,labelPosition}', '[126.960,37.486]'::jsonb)
where key = 'Others';
