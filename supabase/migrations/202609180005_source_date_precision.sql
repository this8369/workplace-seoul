begin;
-- Month-only source dates must not be represented as a fabricated first day.
alter table public.development_records alter column as_of type text using as_of::text;
commit;
