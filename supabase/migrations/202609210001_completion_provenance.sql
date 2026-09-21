begin;
alter table public.buildings
 add column usage_approved_on date,
 add column completion_source_url text check(completion_source_url ~ '^https://officefind[.]co[.]kr/'),
 add column completion_collected_at timestamptz,
 add constraint approval_year_matches check(usage_approved_on is null or (completion_year is not null and completion_year = extract(year from usage_approved_on)));
comment on column public.buildings.usage_approved_on is 'Source-reported usage approval date, distinct from a development completion forecast.';
comment on column public.buildings.completion_source_url is 'Field-specific source of the completion year; imported Officefind values use usage approval year.';
commit;
