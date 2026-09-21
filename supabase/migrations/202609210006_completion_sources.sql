begin;
-- Completion evidence can also come from the original workbook or an owner's
-- official site; it is independent of the typical-floor data provider.
alter table public.buildings drop constraint buildings_completion_source_url_check;
alter table public.buildings add constraint buildings_completion_source_url_check
 check (completion_source_url is null or completion_source_url ~ '^https://[^[:space:]/?#]+(/|$)');
comment on column public.buildings.completion_source_url is 'Field-specific HTTPS evidence for the completion year. A year-only source must not fabricate a usage approval date.';
commit;
