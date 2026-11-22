-- Small helpers the test files use. They live in their own "tests" schema,
-- which only exists in the throwaway test database.
--
--   call tests.sign_in(id)   act as that member (null = signed out)
--   tests.ok(check, what)    passes if check is true, otherwise stops with
--                            "FAILED: what"
--   tests.fails(sql, error, what)
--                            passes if running sql fails with an error
--                            containing that text; nothing it did is kept
--   call tests.join(inviter, id, name, city)
--                            a new person joins with an invitation link
--                            from inviter (the real sign-up path); signs
--                            everyone out afterwards

create schema tests;
grant usage on schema tests to anon, authenticated;

create procedure tests.sign_in(p_member uuid)
language sql
as $$ select set_config('request.jwt.claim.sub', coalesce(p_member::text, ''), false); $$;

create function tests.ok(p_check boolean, p_what text) returns text
language plpgsql
as $$
begin
  if p_check is distinct from true then
    raise exception 'FAILED: %', p_what;
  end if;
  return 'ok    ' || p_what;
end;
$$;

create function tests.fails(p_sql text, p_error text, p_what text) returns text
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_error || '%' then
      return 'ok    ' || p_what;
    end if;
    raise exception 'FAILED: % (it failed, but with: %)', p_what, sqlerrm;
  end;
  raise exception 'FAILED: % (it was allowed)', p_what;
end;
$$;

-- Runs as the database owner (not as a member), like Supabase's sign-up.
create procedure tests.join(p_inviter uuid, p_member uuid, p_name text, p_city text)
language plpgsql security definer
as $$
declare
  v_code text;
begin
  call tests.sign_in(p_inviter);
  v_code := public.create_invite();
  call tests.sign_in(null);
  insert into auth.users (id, email, raw_user_meta_data)
  values (p_member, lower(p_name) || '@example.com',
          jsonb_build_object('invite_code', v_code, 'name', p_name, 'city', p_city));
end;
$$;

grant execute on all routines in schema tests to anon, authenticated;
