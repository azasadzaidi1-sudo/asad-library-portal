-- A small stand-in for the parts of Supabase the SQL files rely on, so
-- they can run on plain PostgreSQL: the two roles requests run as, the
-- auth.users table (sign-ups) and auth.uid() (who is signed in).
--
-- Tests "sign in" by setting request.jwt.claim.sub, which is where
-- auth.uid() reads the member's id from, just like in Supabase.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$$;

create schema auth;

create table auth.users (
  id                  uuid primary key,
  email               text,
  raw_user_meta_data  jsonb
);

create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
