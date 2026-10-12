-- VWorld station POI: 역삼역. Preserve the existing district zoom behavior.
update public.districts
set focus_center = '[127.0364265, 37.5006563]'::jsonb
where key = 'GBD';
