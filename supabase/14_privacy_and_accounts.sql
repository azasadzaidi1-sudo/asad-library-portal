-- =====================================================================
-- The Common Shelf: house rules, contact details and deleting an account
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Needs 01-13 to have run first.
-- =====================================================================
--
-- What this adds:
--   1. House rules: which version each member accepted, and when. New
--      members accept on the Join page; current members accept once, at
--      their next visit.
--   2. Contact details for the privacy notice and house rules (postal
--      address and email), kept in the database instead of the public
--      code. Only members and people holding a valid invitation link can
--      read them.
--   3. "Delete my account": a member can delete their own account once no
--      books are out. Past loans, reviews and replies stay without their
--      name (the app shows "Former member"); everything else about them
--      is deleted.


-- ---------------------------------------------------------------------
-- PART 1: house rules
-- ---------------------------------------------------------------------

alter table public.members
  add column rules_version     int,           -- the version of the house rules they accepted
  add column rules_accepted_at timestamptz;   -- and when

-- Members can only change their name and city directly (01), so accepting
-- goes through this function.
create or replace function public.accept_house_rules(p_version int)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_version is null or p_version < 1 then
    raise exception 'Which version of the house rules?';
  end if;
  update public.members
  set rules_version = p_version, rules_accepted_at = now()
  where id = (select auth.uid());
end;
$$;

revoke execute on function public.accept_house_rules(int) from public, anon;
grant execute on function public.accept_house_rules(int) to authenticated;

-- Runs whenever an account is created (this replaces the version in 10).
-- Same as before, plus: the Join page sends the version of the house rules
-- the person accepted, and it's recorded with today's date.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_code    text := new.raw_user_meta_data ->> 'invite_code';
  v_rules   text := new.raw_user_meta_data ->> 'rules_version';
  v_inviter uuid;
  v_version int;
begin
  select i.invited_by into v_inviter
  from public.invites i
  where i.code = v_code and i.used_at is null and i.expires_at > now()
  for update;

  if v_inviter is null then
    raise exception 'A valid invitation is needed to join The Common Shelf.';
  end if;

  if v_rules ~ '^[0-9]{1,4}$' then
    v_version := v_rules::int;
  end if;

  insert into public.members (id, name, city, invited_by, rules_version, rules_accepted_at)
  values (
    new.id,
    nullif(left(btrim(new.raw_user_meta_data ->> 'name'), 80), ''),
    nullif(left(btrim(new.raw_user_meta_data ->> 'city'), 80), ''),
    v_inviter,
    v_version,
    case when v_version is not null then now() end
  );

  update public.invites set used_by = new.id, used_at = now() where code = v_code;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 2: contact details, kept out of the public code
-- ---------------------------------------------------------------------
-- The privacy notice must say who runs the app and how to reach him. The
-- code is public on GitHub, so the postal address and email live here
-- instead. Asad fills them in once (see the pull request).

create table public.app_settings (
  key   text primary key,
  value text not null
);

-- No grants and no policies: nobody reads this table directly.
alter table public.app_settings enable row level security;

-- The address and email, for members and for people on the Join page with
-- a valid invitation link. Anyone else gets nothing back.
create or replace function public.contact_details(p_invite_code text default null)
returns table (address text, email text)
language sql stable security definer set search_path = ''
as $$
  select
    (select s.value from public.app_settings s where s.key = 'contact_address'),
    (select s.value from public.app_settings s where s.key = 'contact_email')
  where exists (select 1 from public.members m where m.id = (select auth.uid()))
     or exists (
       select 1 from public.invites i
       where i.code = p_invite_code and i.used_at is null and i.expires_at > now()
     );
$$;

revoke execute on function public.contact_details(text) from public;
grant execute on function public.contact_details(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- PART 3: deleting an account
-- ---------------------------------------------------------------------

-- 3a. Records that outlive a member. Until now, a loan, reservation or
-- copy linked to a member stopped them from being deleted at all, and their
-- reviews and replies were deleted with them. Now the link is simply
-- cleared: the record stays, without a name.
alter table public.loans
  alter column member_id drop not null,
  alter column owner_id  drop not null,
  drop constraint loans_member_id_fkey,
  drop constraint loans_owner_id_fkey,
  add constraint loans_member_id_fkey foreign key (member_id) references public.members (id) on delete set null,
  add constraint loans_owner_id_fkey  foreign key (owner_id)  references public.members (id) on delete set null;

alter table public.reservations
  alter column member_id drop not null,
  alter column owner_id  drop not null,
  drop constraint reservations_member_id_fkey,
  drop constraint reservations_owner_id_fkey,
  add constraint reservations_member_id_fkey foreign key (member_id) references public.members (id) on delete set null,
  add constraint reservations_owner_id_fkey  foreign key (owner_id)  references public.members (id) on delete set null;

alter table public.copies
  alter column owner_id drop not null,
  drop constraint copies_owner_id_fkey,
  add constraint copies_owner_id_fkey foreign key (owner_id) references public.members (id) on delete set null;

alter table public.reviews
  alter column member_id drop not null,
  drop constraint reviews_member_id_fkey,
  add constraint reviews_member_id_fkey foreign key (member_id) references public.members (id) on delete set null;

alter table public.review_replies
  alter column member_id drop not null,
  drop constraint review_replies_member_id_fkey,
  add constraint review_replies_member_id_fkey foreign key (member_id) references public.members (id) on delete set null;

-- 3b. Clearing the name from a review isn't an edit: only a change to the
-- text marks a post "edited" (this replaces the version in 07).
create or replace function public.mark_edited()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

-- 3c. Reservation rules (this replaces the version in 09). Same as before,
-- plus one line at the start of the UPDATE part: when an account is deleted,
-- clearing the person from their old reservations is let through.
create or replace function public.reservation_rules()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_status text;
begin
  if tg_op = 'INSERT' then
    -- The current app doesn't say which library: that means Asad's.
    if new.owner_id is null then
      select id into new.owner_id from public.members where is_admin order by created_at limit 1;
    end if;
    if not (public.is_admin() or new.owner_id = v_me) then
      new.member_id := v_me;
    end if;
    if new.member_id = new.owner_id then
      raise exception 'That copy is on your own shelf already.';
    end if;
    if not exists (
      select 1 from public.copies c
      where c.book_id = new.book_id and c.owner_id = new.owner_id and c.removed_at is null
    ) then
      raise exception 'That library doesn''t have a copy of this book.';
    end if;

    v_status := public.borrower_status(new.owner_id, new.member_id);
    if v_status = 'stopped' then
      raise exception 'This library isn''t lending at the moment.';
    elsif v_status is distinct from 'approved' then
      -- First request to this librarian (or asking again after a "not this time").
      insert into public.borrower_approvals (owner_id, borrower_id, status)
      values (new.owner_id, new.member_id, 'pending')
      on conflict (owner_id, borrower_id) do update
        set status = 'pending', note = null, created_at = now(), decided_at = null
        where public.borrower_approvals.status = 'declined';
      new.status := 'pending_approval';
    elsif public.is_restricted(new.owner_id, new.book_id) then
      new.status := 'pending_approval';
    else
      new.status := 'active';
    end if;
    new.decided_at := null;

  elsif tg_op = 'UPDATE' then
    -- An account was deleted: only the person's link is cleared. Members
    -- can only change a reservation's status themselves (01), so this can't
    -- be used for anything else.
    if new.status is not distinct from old.status
      and (new.member_id is null or new.owner_id is null)
      and (new.member_id is distinct from old.member_id or new.owner_id is distinct from old.owner_id) then
      return new;
    end if;
    if not (public.is_admin() or old.owner_id = v_me) then
      if new.status <> 'cancelled' or old.status not in ('pending_approval', 'active') then
        raise exception 'Members can only cancel their own open reservations';
      end if;
    elsif old.status = 'pending_approval' and new.status = 'active'
      and public.borrower_status(old.owner_id, old.member_id) is distinct from 'approved' then
      raise exception 'Approve them as a borrower first.';
    end if;
    if new.status is distinct from old.status then
      new.decided_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- 3d. Just before a member is deleted (from the app or the Supabase
-- dashboard): open reservations, theirs and any on their shelf, are
-- cancelled, and their books leave the catalogue. Past loans keep the
-- copies, so they're marked removed rather than deleted.
create or replace function public.member_leaving()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.reservations
  set status = 'cancelled'
  where (member_id = old.id or owner_id = old.id)
    and status in ('pending_approval', 'active');

  update public.copies
  set removed_at = now()
  where owner_id = old.id and removed_at is null;

  return old;
end;
$$;

create trigger member_leaving
  before delete on public.members
  for each row execute function public.member_leaving();

-- 3e. What stops the signed-in member from deleting their account right
-- now: books they've borrowed, and books of theirs that are lent out.
create or replace function public.deletion_blockers()
returns table (borrowed int, lent int)
language sql stable security definer set search_path = ''
as $$
  select
    (select count(*)::int from public.loans l
     where l.member_id = (select auth.uid()) and l.returned_on is null),
    (select count(*)::int from public.loans l
     where l.owner_id = (select auth.uid()) and l.returned_on is null);
$$;

-- 3f. "Delete my account". Deleting the sign-in deletes the member (01);
-- 3a clears their name from loans, reservations, copies, reviews and
-- replies; and everything else about them (Interested list, approvals,
-- invitations, shelf description, Restricted Section list) goes with them.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sign in first.';
  end if;
  if public.is_admin() then
    raise exception 'The admin account can''t be deleted from the app.';
  end if;
  if exists (select 1 from public.loans where member_id = v_me and returned_on is null) then
    raise exception 'Return the books you''ve borrowed first.';
  end if;
  if exists (select 1 from public.loans where owner_id = v_me and returned_on is null) then
    raise exception 'Some of your books are still lent out. Delete your account once they''re back.';
  end if;

  delete from auth.users where id = v_me;
end;
$$;

revoke execute on function public.deletion_blockers() from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.deletion_blockers() to authenticated;
grant execute on function public.delete_my_account() to authenticated;


-- Quick check: how many members have accepted the house rules so far
-- (0 right after running this; it grows as people accept).
select count(*) filter (where rules_version is not null) as accepted_house_rules,
       count(*) as members
from public.members;
