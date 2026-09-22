-- Apply to the IGIS source project only, together with the prepared AuthSetup adapter.
-- Existing signed-in users can update only their own login timestamp.
-- Employee identity, role, activation and enrollment are changed only by a trusted server/admin.
begin;
revoke insert,update,delete on public.iota_seoul_pilot_members from public,anon,authenticated;
grant update(last_login_at) on public.iota_seoul_pilot_members to authenticated;
create policy workplace_identity_update_guard on public.iota_seoul_pilot_members
 as restrictive for update to authenticated
 using(auth_id=(select auth.uid())) with check(auth_id=(select auth.uid()));
-- No existing SELECT policies or business tables are changed.
create or replace function public.workplace_identity_guard_ready() returns boolean
language sql stable security definer set search_path='' as $$
 select not exists (
  select 1 from unnest(array['anon','authenticated']) r
  cross join unnest(array['auth_id','email','is_active','role_code']) c
  where has_column_privilege(r,'public.iota_seoul_pilot_members',c,'UPDATE')
 ) and not exists (
  select 1 from unnest(array['anon','authenticated']) r
  where has_table_privilege(r,'public.iota_seoul_pilot_members','INSERT')
     or has_table_privilege(r,'public.iota_seoul_pilot_members','DELETE')
 )
$$;
revoke all on function public.workplace_identity_guard_ready() from public;
grant execute on function public.workplace_identity_guard_ready() to anon,authenticated,service_role;
create schema if not exists workplace_auth;
revoke all on schema workplace_auth from public,anon,authenticated;
create table workplace_auth.igis_auth_attempts (key text primary key, started_at timestamptz not null, attempts int not null);
revoke all on workplace_auth.igis_auth_attempts from public,anon,authenticated;
alter table workplace_auth.igis_auth_attempts enable row level security;
create function public.consume_igis_auth_attempt(attempt_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 delete from workplace_auth.igis_auth_attempts where started_at < now()-interval '1 day';
 insert into workplace_auth.igis_auth_attempts values(attempt_key,now(),1)
 on conflict(key) do update set
 attempts=case when workplace_auth.igis_auth_attempts.started_at < now()-interval '15 minutes' then 1 else workplace_auth.igis_auth_attempts.attempts+1 end,
 started_at=case when workplace_auth.igis_auth_attempts.started_at < now()-interval '15 minutes' then now() else workplace_auth.igis_auth_attempts.started_at end
 returning attempts into n;
 return n<=5;
end $$;
revoke all on function public.consume_igis_auth_attempt(text) from public,anon,authenticated;
grant execute on function public.consume_igis_auth_attempt(text) to service_role;
commit;
