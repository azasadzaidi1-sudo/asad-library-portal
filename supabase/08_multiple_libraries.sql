-- =====================================================================
-- The Common Shelf: several libraries in one catalogue
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================
--
-- Until now there was one library: Asad's. From here on, every copy has
-- an owner, and anyone who owns a copy is a librarian of their own shelf.
--
-- What changes:
--   PART 1  Asad becomes the "admin", and every member records who invited them.
--   PART 2  Every copy gets an owner. All existing copies are Asad's.
--   PART 3  The Restricted Section is decided per librarian, per title.
--   PART 4  First-time borrowers: a librarian approves someone once,
--           with a note from them. Asad's current members count as approved.
--   PART 5  Reservations and loans belong to a library, and the limits
--           become 1 book + 1 reservation per member *per library*.
--   PART 6  Who may see and change what, rewritten per owner.
--   PART 7  Functions the app calls (each returns only what that person may see).
--
-- The current app keeps working after this file runs, so there's no rush
-- between running it and merging the pull request.


-- ---------------------------------------------------------------------
-- PART 1: the admin, and who invited whom
-- ---------------------------------------------------------------------

-- Asad stays in charge of the whole app (removing reviews, his reading
-- tracker), whether or not he's lending. "role" is no longer used for
-- that; it stays only so the current app keeps working until the new one
-- is live.
alter table public.members add column is_admin boolean not null default false;
update public.members set is_admin = true where role = 'librarian';

-- Who invited this member. Shown to librarians on a first-time request.
-- Until in-app invites exist, Asad fills it in when creating an account
-- (Table Editor -> members -> invited_by).
alter table public.members
  add column invited_by uuid references public.members (id) on delete set null;

-- Everyone who's a member today was invited by Asad.
update public.members
set invited_by = (select id from public.members where is_admin order by created_at limit 1)
where not is_admin and invited_by is null;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members
    where id = (select auth.uid()) and is_admin
  );
$$;

-- Older rules (deleting any review, the reading tracker) use is_librarian().
-- It now means "the admin", which is exactly who those rules were for.
create or replace function public.is_librarian()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_admin();
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;


-- ---------------------------------------------------------------------
-- PART 2: every copy has an owner
-- ---------------------------------------------------------------------

alter table public.copies add column owner_id uuid references public.members (id);
update public.copies
set owner_id = (select id from public.members where is_admin order by created_at limit 1);
alter table public.copies alter column owner_id set not null;
alter table public.copies alter column owner_id set default auth.uid();
create index copies_by_owner on public.copies (owner_id, book_id);


-- ---------------------------------------------------------------------
-- PART 3: the Restricted Section, per librarian
-- ---------------------------------------------------------------------

-- One row = "this librarian approves each request for their copies of
-- this title". A friend's copy of the same book isn't restricted unless
-- they add it here too.
create table public.restricted_titles (
  owner_id   uuid   not null references public.members (id) on delete cascade,
  book_id    bigint not null references public.books (id) on delete cascade,
  reason     text   not null default 'Ask the librarian'
             check (char_length(reason) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (owner_id, book_id)
);

-- Asad's 17 titles become his own restricted list.
insert into public.restricted_titles (owner_id, book_id, reason)
select
  (select id from public.members where is_admin order by created_at limit 1),
  b.id,
  coalesce(b.restricted_reason, 'Ask the librarian')
from public.books b
where b.restricted;

-- books.restricted and books.restricted_reason are no longer used by the
-- new app. They stay until a later clean-up so the current app still works.

create or replace function public.is_restricted(p_owner_id uuid, p_book_id bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.restricted_titles t
    where t.owner_id = p_owner_id and t.book_id = p_book_id
  );
$$;


-- ---------------------------------------------------------------------
-- PART 4: first-time borrowers
-- ---------------------------------------------------------------------

-- One row per librarian and borrower:
--   pending  = asked to borrow for the first time, waiting for the librarian
--   approved = can reserve from this librarian freely from now on
--   declined = the librarian said no this time (they may ask again later)
--   stopped  = the librarian stopped lending to them
create table public.borrower_approvals (
  owner_id    uuid not null references public.members (id) on delete cascade,
  borrower_id uuid not null references public.members (id) on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'declined', 'stopped')),
  note        text check (char_length(note) <= 500),   -- "Remind Mira how you know each other"
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  primary key (owner_id, borrower_id),
  check (owner_id <> borrower_id)
);

-- Asad's current members already borrow from him, so they count as approved.
insert into public.borrower_approvals (owner_id, borrower_id, status, decided_at)
select a.id, m.id, 'approved', now()
from public.members m
cross join (select id from public.members where is_admin order by created_at limit 1) a
where m.id <> a.id;

create or replace function public.borrower_status(p_owner_id uuid, p_borrower_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select ba.status from public.borrower_approvals ba
  where ba.owner_id = p_owner_id and ba.borrower_id = p_borrower_id;
$$;


-- ---------------------------------------------------------------------
-- PART 5: reservations and loans belong to a library
-- ---------------------------------------------------------------------

-- A reservation is for a title *from one librarian's shelf*.
alter table public.reservations add column owner_id uuid references public.members (id);
-- (The reservation rules would refuse this one-off change, because the SQL
-- Editor isn't signed in as anyone, so they're paused for this one step.)
alter table public.reservations disable trigger reservation_rules;
update public.reservations
set owner_id = (select id from public.members where is_admin order by created_at limit 1);
alter table public.reservations enable trigger reservation_rules;
alter table public.reservations alter column owner_id set not null;

-- A loan belongs to the owner of the copy (filled in automatically below).
alter table public.loans add column owner_id uuid references public.members (id);
update public.loans l set owner_id = c.owner_id from public.copies c where c.id = l.copy_id;
alter table public.loans alter column owner_id set not null;

create or replace function public.loan_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select c.owner_id into new.owner_id from public.copies c where c.id = new.copy_id;
  return new;
end;
$$;

create trigger loan_owner
  before insert or update of copy_id on public.loans
  for each row execute function public.loan_owner();

-- The limits: 1 book borrowed and 1 open reservation per member, per library.
-- (A member can have one book from Asad and one from Mira at the same time.)
drop index public.one_open_loan_per_member;
create unique index one_open_loan_per_member_per_library
  on public.loans (member_id, owner_id) where returned_on is null;

drop index public.one_open_reservation_per_member;
create unique index one_open_reservation_per_member_per_library
  on public.reservations (member_id, owner_id) where status in ('pending_approval', 'active');

-- Reservation rules, now per library:
--  * Members reserve only for themselves, and never from their own shelf.
--  * The library must actually have a copy of the book.
--  * Someone the librarian hasn't approved yet starts as 'pending_approval',
--    and their first-time request appears on the librarian's approval card.
--  * Restricted titles also start as 'pending_approval'. Someone who is
--    both new and asking for a Restricted book needs two approvals: first
--    as a borrower, then for the book.
--  * Members can only cancel. The library's owner (or the admin) decides.
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
      select 1 from public.copies c where c.book_id = new.book_id and c.owner_id = new.owner_id
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


-- If someone withdraws their first request before the librarian answers,
-- the request card disappears too.
create or replace function public.withdraw_first_request()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status = 'pending_approval'
    and not exists (
      select 1 from public.reservations r
      where r.member_id = new.member_id and r.owner_id = new.owner_id
        and r.status = 'pending_approval' and r.id <> new.id
    ) then
    delete from public.borrower_approvals
    where owner_id = new.owner_id and borrower_id = new.member_id and status = 'pending';
  end if;
  return null;
end;
$$;

create trigger withdraw_first_request
  after update of status on public.reservations
  for each row execute function public.withdraw_first_request();


-- ---------------------------------------------------------------------
-- PART 6: who may see and change what, per owner
-- ---------------------------------------------------------------------

-- Copies: everyone browses; you add, edit and remove your own copies.
drop policy "copies: librarian adds" on public.copies;
drop policy "copies: librarian edits" on public.copies;
drop policy "copies: librarian deletes" on public.copies;
create policy "copies: add your own" on public.copies
  for insert to authenticated with check (owner_id = (select auth.uid()) or public.is_admin());
create policy "copies: edit your own" on public.copies
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin())
  with check (owner_id = (select auth.uid()) or public.is_admin());
create policy "copies: remove your own" on public.copies
  for delete to authenticated using (owner_id = (select auth.uid()) or public.is_admin());

-- Restricted titles: everyone sees them (with the reason); you set your own.
alter table public.restricted_titles enable row level security;
create policy "restricted: everyone reads" on public.restricted_titles
  for select to authenticated using (true);
create policy "restricted: set your own" on public.restricted_titles
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "restricted: change your own" on public.restricted_titles
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "restricted: remove your own" on public.restricted_titles
  for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, delete on public.restricted_titles to authenticated;
grant update (reason) on public.restricted_titles to authenticated;

-- Borrower approvals: the borrower and the librarian see their row.
-- Changes only go through the functions in PART 7.
alter table public.borrower_approvals enable row level security;
create policy "approvals: borrower, librarian or admin reads" on public.borrower_approvals
  for select to authenticated
  using (borrower_id = (select auth.uid()) or owner_id = (select auth.uid()) or public.is_admin());
grant select on public.borrower_approvals to authenticated;

-- Reservations: yours, your library's, or everything for the admin.
drop policy "reservations: read own or librarian" on public.reservations;
drop policy "reservations: create own" on public.reservations;
drop policy "reservations: update own or librarian" on public.reservations;
create policy "reservations: yours or your library's" on public.reservations
  for select to authenticated
  using (member_id = (select auth.uid()) or owner_id = (select auth.uid()) or public.is_admin());
create policy "reservations: create" on public.reservations
  for insert to authenticated
  with check (member_id = (select auth.uid()) or owner_id = (select auth.uid()) or public.is_admin());
create policy "reservations: cancel yours or decide for your library" on public.reservations
  for update to authenticated
  using (member_id = (select auth.uid()) or owner_id = (select auth.uid()) or public.is_admin())
  with check (member_id = (select auth.uid()) or owner_id = (select auth.uid()) or public.is_admin());

-- Loans: yours, your library's, or everything for the admin.
-- Lending goes through lend_copy(); the library's owner records returns.
drop policy "loans: read own or librarian" on public.loans;
drop policy "loans: librarian adds" on public.loans;
drop policy "loans: librarian edits" on public.loans;
create policy "loans: yours or your library's" on public.loans
  for select to authenticated
  using (member_id = (select auth.uid()) or owner_id = (select auth.uid()) or public.is_admin());
create policy "loans: your library lends" on public.loans
  for insert to authenticated
  with check (owner_id = (select auth.uid()) or public.is_admin());
create policy "loans: your library records returns" on public.loans
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin())
  with check (owner_id = (select auth.uid()) or public.is_admin());

-- Interested lists: the member, plus librarians who own a copy of that title.
drop policy "interests: read own or librarian" on public.interests;
create policy "interests: yours, or owners of a copy" on public.interests
  for select to authenticated
  using (
    member_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1 from public.copies c
      where c.book_id = interests.book_id and c.owner_id = (select auth.uid())
    )
  );


-- ---------------------------------------------------------------------
-- PART 7: functions the app calls
-- Members can't read each other's profiles, so anything that needs a
-- name goes through a function that returns only what that person may see.
-- ---------------------------------------------------------------------

-- Every library: the librarian's name and city, how many titles and
-- copies, and where the signed-in member stands with them.
create or replace function public.libraries()
returns table (
  owner_id  uuid,
  name      text,
  city      text,
  titles    int,
  copies    int,
  my_status text,     -- 'own', 'approved', 'pending', 'declined', 'stopped' or null (never asked)
  is_me     boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    m.id,
    m.name,
    m.city,
    count(distinct c.book_id)::int,
    count(c.id)::int,
    case when m.id = (select auth.uid()) then 'own'
         else public.borrower_status(m.id, (select auth.uid())) end,
    m.id = (select auth.uid())
  from public.members m
  join public.copies c on c.owner_id = m.id
  group by m.id, m.name, m.city
  order by m.name;
$$;

-- Availability per title per library: counts only, never who.
create or replace function public.library_availability()
returns table (
  book_id      bigint,
  owner_id     uuid,
  copies_total int,
  copies_out   int,
  waiting      int
)
language sql stable security definer set search_path = ''
as $$
  select
    c.book_id,
    c.owner_id,
    count(*)::int,
    count(*) filter (where exists (
      select 1 from public.loans l where l.copy_id = c.id and l.returned_on is null
    ))::int,
    (select count(*) from public.reservations r
      where r.book_id = c.book_id and r.owner_id = c.owner_id
        and r.status in ('pending_approval', 'active'))::int
  from public.copies c
  group by c.book_id, c.owner_id;
$$;

-- The signed-in member's open reservations (one per library at most),
-- each with its place in that library's queue for that title, and what
-- it's waiting for.
create or replace function public.my_open_reservations()
returns table (
  reservation_id bigint,
  book_id        bigint,
  owner_id       uuid,
  status         text,
  created_at     timestamptz,
  queue_place    int,
  waiting_for    text     -- 'borrower' (first-time approval), 'restricted', or null
)
language sql stable security definer set search_path = ''
as $$
  select
    r.id, r.book_id, r.owner_id, r.status, r.created_at,
    1 + (select count(*) from public.reservations o
          where o.book_id = r.book_id and o.owner_id = r.owner_id
            and o.status in ('pending_approval', 'active')
            and (o.created_at, o.id) < (r.created_at, r.id))::int,
    case
      when r.status <> 'pending_approval' then null
      when public.borrower_status(r.owner_id, r.member_id) is distinct from 'approved' then 'borrower'
      else 'restricted'
    end
  from public.reservations r
  where r.member_id = (select auth.uid())
    and r.status in ('pending_approval', 'active');
$$;

-- Names (only names) of the people connected to the signed-in librarian's
-- shelf: anyone who asked to borrow, reserved, borrowed or marked one of
-- their titles as interested.
create or replace function public.library_people()
returns table (member_id uuid, name text)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.name
  from public.members m
  where m.id in (
    select ba.borrower_id from public.borrower_approvals ba where ba.owner_id = (select auth.uid())
    union
    select r.member_id from public.reservations r where r.owner_id = (select auth.uid())
    union
    select l.member_id from public.loans l where l.owner_id = (select auth.uid())
    union
    select i.member_id from public.interests i
    where exists (
      select 1 from public.copies c where c.book_id = i.book_id and c.owner_id = (select auth.uid())
    )
  );
$$;

-- The signed-in librarian's first-time requests, with what the approval
-- card shows: the note, which book, who invited them, which librarians
-- already lend to them, when they joined and how their loans have gone.
create or replace function public.borrower_requests()
returns table (
  borrower_id       uuid,
  name              text,
  note              text,
  requested_at      timestamptz,
  book_id           bigint,
  invited_by_name   text,
  also_borrows_from text[],
  member_since      timestamptz,
  loans_total       int,
  loans_late        int,      -- came back after the due date, or overdue now
  loans_out         int       -- still out, not yet due
)
language sql stable security definer set search_path = ''
as $$
  select
    m.id,
    m.name,
    ba.note,
    ba.created_at,
    (select r.book_id from public.reservations r
      where r.member_id = m.id and r.owner_id = ba.owner_id and r.status = 'pending_approval'
      order by r.created_at limit 1),
    (select i.name from public.members i where i.id = m.invited_by),
    array(
      select o.name from public.borrower_approvals other
      join public.members o on o.id = other.owner_id
      where other.borrower_id = m.id and other.status = 'approved' and other.owner_id <> ba.owner_id
      order by o.name
    ),
    m.created_at,
    (select count(*) from public.loans l where l.member_id = m.id)::int,
    (select count(*) from public.loans l where l.member_id = m.id
       and (l.returned_on > l.due_on or (l.returned_on is null and l.due_on < current_date)))::int,
    (select count(*) from public.loans l where l.member_id = m.id
       and l.returned_on is null and l.due_on >= current_date)::int
  from public.borrower_approvals ba
  join public.members m on m.id = ba.borrower_id
  where ba.owner_id = (select auth.uid()) and ba.status = 'pending'
    and exists (
      select 1 from public.reservations r
      where r.member_id = m.id and r.owner_id = ba.owner_id and r.status = 'pending_approval'
    )
  order by ba.created_at;
$$;

-- The signed-in librarian's approved borrowers (and anyone they stopped
-- lending to), for the "Lend to" list and the Borrowers tab.
create or replace function public.my_borrowers()
returns table (
  borrower_id uuid,
  name        text,
  status      text,         -- 'approved' or 'stopped'
  since       timestamptz,
  has_my_book boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    m.id, m.name, ba.status, ba.decided_at,
    exists (
      select 1 from public.loans l
      where l.member_id = m.id and l.owner_id = ba.owner_id and l.returned_on is null
    )
  from public.borrower_approvals ba
  join public.members m on m.id = ba.borrower_id
  where ba.owner_id = (select auth.uid()) and ba.status in ('approved', 'stopped')
  order by m.name;
$$;

-- Ask for a book from one library, with an optional note for a
-- first-time request ("Remind Mira how you know each other").
create or replace function public.request_book(
  p_book_id  bigint,
  p_owner_id uuid,
  p_note     text default null
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id bigint;
begin
  if v_me is null then
    raise exception 'Sign in first.';
  end if;
  insert into public.reservations (member_id, book_id, owner_id)
  values (v_me, p_book_id, p_owner_id)
  returning id into v_id;

  if nullif(btrim(p_note), '') is not null then
    update public.borrower_approvals
    set note = left(btrim(p_note), 500)
    where owner_id = p_owner_id and borrower_id = v_me and status = 'pending';
  end if;
  return v_id;
end;
$$;

-- The librarian's answer to a first-time request.
-- Approving: their waiting reservation goes into the queue, unless the
-- book is restricted, in which case it now waits for the second approval.
-- Declining: their waiting reservation is declined ("not this time").
-- Also used to lend again to someone the librarian had stopped lending to.
create or replace function public.decide_borrower(p_borrower_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  update public.borrower_approvals
  set status = case when p_approve then 'approved' else 'declined' end,
      decided_at = now()
  where owner_id = v_me and borrower_id = p_borrower_id
    and status in ('pending', 'stopped', 'declined');
  if not found then
    raise exception 'There''s no request from this person to decide.';
  end if;

  if p_approve then
    update public.reservations r
    set status = 'active'
    where r.owner_id = v_me and r.member_id = p_borrower_id and r.status = 'pending_approval'
      and not public.is_restricted(r.owner_id, r.book_id);
  else
    update public.reservations r
    set status = 'declined'
    where r.owner_id = v_me and r.member_id = p_borrower_id and r.status = 'pending_approval';
  end if;
end;
$$;

-- Stop lending to someone: their open reservation on this shelf is
-- cancelled; a book they already have comes back as normal.
create or replace function public.stop_lending(p_borrower_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  update public.borrower_approvals
  set status = 'stopped', decided_at = now()
  where owner_id = v_me and borrower_id = p_borrower_id and status = 'approved';
  if not found then
    raise exception 'This person isn''t one of your borrowers.';
  end if;

  update public.reservations
  set status = 'cancelled'
  where owner_id = v_me and member_id = p_borrower_id
    and status in ('pending_approval', 'active');
end;
$$;

-- Lending, now per library: only the copy's owner lends it, and the
-- 1-book limit counts loans from this library only. Lending in person to
-- someone counts as approving them as a borrower.
create or replace function public.lend_copy(
  p_copy_id        bigint,
  p_member_id      uuid,
  p_lent_on        date   default current_date,
  p_reservation_id bigint default null
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_me             uuid := (select auth.uid());
  v_book_id        bigint;
  v_owner_id       uuid;
  v_reservation_id bigint := p_reservation_id;
  v_loan_id        bigint;
begin
  select c.book_id, c.owner_id into v_book_id, v_owner_id from public.copies c where c.id = p_copy_id;
  if v_book_id is null then
    raise exception 'That copy doesn''t exist.';
  end if;
  if v_owner_id is distinct from v_me then
    raise exception 'Only the copy''s owner can lend it.';
  end if;
  if p_member_id = v_me then
    raise exception 'That''s your own book.';
  end if;
  if public.borrower_status(v_me, p_member_id) = 'stopped' then
    raise exception 'You stopped lending to this member. Lend to them again from the Borrowers tab first.';
  end if;

  if exists (select 1 from public.loans l where l.copy_id = p_copy_id and l.returned_on is null) then
    raise exception 'That copy is already lent out.';
  end if;
  if exists (
    select 1 from public.loans l
    where l.member_id = p_member_id and l.owner_id = v_me and l.returned_on is null
  ) then
    raise exception 'This member already has a book from your shelf. It needs to come back before they can borrow another.';
  end if;

  -- No reservation given? Use the member's open reservation for this book here, if any.
  if v_reservation_id is null then
    select r.id into v_reservation_id
    from public.reservations r
    where r.member_id = p_member_id and r.book_id = v_book_id
      and r.owner_id = v_me and r.status = 'active';
  elsif not exists (
    select 1 from public.reservations r
    where r.id = v_reservation_id and r.member_id = p_member_id and r.book_id = v_book_id
      and r.owner_id = v_me and r.status = 'active'
  ) then
    raise exception 'That reservation isn''t open for this member and book.';
  end if;

  insert into public.borrower_approvals (owner_id, borrower_id, status, decided_at)
  values (v_me, p_member_id, 'approved', now())
  on conflict (owner_id, borrower_id) do update
    set status = 'approved', decided_at = now()
    where public.borrower_approvals.status <> 'approved';

  insert into public.loans (copy_id, member_id, reservation_id, lent_on)
  values (p_copy_id, p_member_id, v_reservation_id, p_lent_on)
  returning id into v_loan_id;

  if v_reservation_id is not null then
    update public.reservations set status = 'fulfilled' where id = v_reservation_id;
  end if;
  return v_loan_id;
end;
$$;

-- Only logged-in members may call these. New functions are callable by
-- everyone by default, so take that away first.
revoke execute on function public.libraries() from public, anon;
revoke execute on function public.library_availability() from public, anon;
revoke execute on function public.my_open_reservations() from public, anon;
revoke execute on function public.library_people() from public, anon;
revoke execute on function public.borrower_requests() from public, anon;
revoke execute on function public.my_borrowers() from public, anon;
revoke execute on function public.request_book(bigint, uuid, text) from public, anon;
revoke execute on function public.decide_borrower(uuid, boolean) from public, anon;
revoke execute on function public.stop_lending(uuid) from public, anon;
revoke execute on function public.lend_copy(bigint, uuid, date, bigint) from public, anon;
revoke execute on function public.is_restricted(uuid, bigint) from public, anon;
revoke execute on function public.borrower_status(uuid, uuid) from public, anon;

grant execute on function public.libraries() to authenticated;
grant execute on function public.library_availability() to authenticated;
grant execute on function public.my_open_reservations() to authenticated;
grant execute on function public.library_people() to authenticated;
grant execute on function public.borrower_requests() to authenticated;
grant execute on function public.my_borrowers() to authenticated;
grant execute on function public.request_book(bigint, uuid, text) to authenticated;
grant execute on function public.decide_borrower(uuid, boolean) to authenticated;
grant execute on function public.stop_lending(uuid) to authenticated;
grant execute on function public.lend_copy(bigint, uuid, date, bigint) to authenticated;


-- Quick check: should show 1 admin, 200 copies all owned by Asad,
-- 17 restricted titles, and one approval per current member.
select
  (select count(*) from public.members where is_admin) as admins,
  (select count(*) from public.copies where owner_id is not null) as copies_with_owner,
  (select count(*) from public.restricted_titles) as restricted_titles,
  (select count(*) from public.borrower_approvals where status = 'approved') as approved_borrowers;
