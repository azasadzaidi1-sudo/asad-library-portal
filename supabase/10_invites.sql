-- =====================================================================
-- Invitation links: librarians invite friends, who create their own account
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Then change two settings (see the pull request): allow new users to
-- sign up, and turn off email confirmation.
-- =====================================================================
--
--   PART 1  Invitations: one row per link. A link works for one person,
--           for 14 days.
--   PART 2  Any member can invite friends, borrowers as well as librarians.
--           (Librarians still approve each first-time borrower themselves.)
--   PART 3  The gate: a new account is only accepted with a valid, unused
--           invitation. So even with sign-ups switched on, nobody gets in
--           without a link. The new member's name, city and "invited by"
--           come straight from the sign-up.
--
-- Note: once this runs, "Add user" in the Supabase dashboard no longer
-- works (it has no invitation). Create an invitation link in the app instead.


-- ---------------------------------------------------------------------
-- PART 1: invitations
-- ---------------------------------------------------------------------

create table public.invites (
  code        text primary key,            -- the random part of the link
  invited_by  uuid not null references public.members (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  used_by     uuid references public.members (id) on delete set null,
  used_at     timestamptz
);
create index invites_by_inviter on public.invites (invited_by, created_at desc);

-- You see the invitations you sent (and who joined with them). Changes only
-- go through the functions below.
alter table public.invites enable row level security;
create policy "invites: your own" on public.invites
  for select to authenticated
  using (invited_by = (select auth.uid()) or public.is_admin());
grant select on public.invites to authenticated;


-- ---------------------------------------------------------------------
-- PART 2: creating, checking and cancelling invitations
-- ---------------------------------------------------------------------

-- Creates a new link for the signed-in member and returns its code.
create or replace function public.create_invite()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_me   uuid := (select auth.uid());
  v_code text;
begin
  if v_me is null or not exists (select 1 from public.members m where m.id = v_me) then
    raise exception 'Sign in first.';
  end if;
  if (select count(*) from public.invites
      where invited_by = v_me and used_by is null and expires_at > now()) >= 20 then
    raise exception 'You have 20 open invitations. Cancel some, or wait for them to be used.';
  end if;

  -- 32 random characters: impossible to guess.
  v_code := replace(gen_random_uuid()::text, '-', '');
  insert into public.invites (code, invited_by) values (v_code, v_me);
  return v_code;
end;
$$;

-- What the Join page shows before someone signs up: who invited them, or
-- why the link no longer works. Anyone may ask (they aren't signed in yet),
-- but it only answers for an exact code.
create or replace function public.check_invite(p_code text)
returns table (inviter_name text, status text)   -- status: 'valid', 'used', 'expired' or 'unknown'
language sql stable security definer set search_path = ''
as $$
  select
    m.name,
    case when i.used_by is not null then 'used'
         when i.expires_at <= now() then 'expired'
         else 'valid' end
  from public.invites i
  join public.members m on m.id = i.invited_by
  where i.code = p_code
  union all
  select null, 'unknown'
  where not exists (select 1 from public.invites i where i.code = p_code);
$$;

-- Cancels one of your unused invitations.
create or replace function public.cancel_invite(p_code text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.invites
  where code = p_code and invited_by = (select auth.uid()) and used_by is null;
  if not found then
    raise exception 'That invitation can''t be cancelled.';
  end if;
end;
$$;

-- People who joined with your invitations, by name, for your list of
-- sent invitations. (Members can't read each other's profiles directly.)
create or replace function public.my_invites()
returns table (code text, created_at timestamptz, expires_at timestamptz, used_at timestamptz, joined_name text)
language sql stable security definer set search_path = ''
as $$
  select i.code, i.created_at, i.expires_at, i.used_at, m.name
  from public.invites i
  left join public.members m on m.id = i.used_by
  where i.invited_by = (select auth.uid())
  order by i.created_at desc
  limit 30;
$$;

revoke execute on function public.create_invite() from public, anon;
revoke execute on function public.cancel_invite(text) from public, anon;
revoke execute on function public.my_invites() from public, anon;
revoke execute on function public.check_invite(text) from public;
grant execute on function public.create_invite() to authenticated;
grant execute on function public.cancel_invite(text) to authenticated;
grant execute on function public.my_invites() to authenticated;
grant execute on function public.check_invite(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- PART 3: the gate for new accounts
-- ---------------------------------------------------------------------

-- Runs whenever an account is created (this replaces the version in 01).
-- Without a valid, unused, unexpired invitation the new account is refused.
-- With one, the member is created with the name and city they typed and
-- "invited by" set, and the invitation is used up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_code    text := new.raw_user_meta_data ->> 'invite_code';
  v_inviter uuid;
begin
  select i.invited_by into v_inviter
  from public.invites i
  where i.code = v_code and i.used_by is null and i.expires_at > now()
  for update;

  if v_inviter is null then
    raise exception 'A valid invitation is needed to join The Common Shelf.';
  end if;

  insert into public.members (id, name, city, invited_by)
  values (
    new.id,
    nullif(left(btrim(new.raw_user_meta_data ->> 'name'), 80), ''),
    nullif(left(btrim(new.raw_user_meta_data ->> 'city'), 80), ''),
    v_inviter
  );

  update public.invites set used_by = new.id, used_at = now() where code = v_code;
  return new;
end;
$$;


-- Quick check: an empty list of invitations, ready to go.
select count(*) as invitations from public.invites;
