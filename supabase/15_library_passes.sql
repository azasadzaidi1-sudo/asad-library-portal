-- =====================================================================
-- The Common Shelf: library passes
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Needs 01-14 to have run first. Run it, then merge its pull request
-- straight away: the app on the live site until then still expects the
-- old rules.
-- =====================================================================
--
-- Until now, a librarian approved someone once and they could reserve
-- freely from then on. From here on, that trust is a library pass:
--
--   * Pass holders reserve from that shelf without asking. Restricted
--     books still need the librarian's OK each time.
--   * Everyone else asks each time: every request waits for the
--     librarian, with the same request card as before (note, who invited
--     them, borrowing record).
--   * Only pass holders see a librarian's Restricted Section. To everyone
--     else, those books aren't on that shelf at all.
--   * Two ways to a pass: the librarian offers one in the week after a
--     book comes back ("Give Sara a library pass?"), or the person asks
--     for one on the Libraries page. After a "Not now" they can ask again
--     after 3 months, or sooner once they've borrowed from that shelf.
--   * A librarian can take a pass back quietly: the person goes back to
--     asking each time and isn't told. "Stop lending" stays as the
--     stronger option.
--   * Everyone already approved gets a pass, so nobody loses access.
--
--   PART 1  What the approvals table means now, and moving today's rows over
--   PART 2  Who can see a Restricted Section
--   PART 3  Hiding Restricted books from people without a pass
--   PART 4  The Libraries page: counts, passes, pick-ups
--   PART 5  Reservation rules and requests
--   PART 6  Passes: asking, deciding, giving, taking back
--   PART 7  The lending desk: request cards, borrowers, the question after a return
--   PART 8  Lending in person
--   PART 9  Who may call what


-- ---------------------------------------------------------------------
-- PART 1: the approvals table, now passes
-- ---------------------------------------------------------------------

-- One row per librarian and member (borrower_approvals, from 08):
--   pending    = asked for a library pass, waiting for the librarian
--   approved   = holds a library pass
--   declined   = "Not now" to a pass request: they can ask again after
--                3 months, or sooner once they've borrowed from that shelf
--   stopped    = the librarian stopped lending to them
--   taken_back = the librarian took the pass back; the person isn't told,
--                and is treated like anyone without a pass
-- No row: no pass, never asked.
alter table public.borrower_approvals drop constraint borrower_approvals_status_check;
alter table public.borrower_approvals add constraint borrower_approvals_status_check
  check (status in ('pending', 'approved', 'declined', 'stopped', 'taken_back'));

-- Requests now carry their own note: anyone without a pass can add one to
-- every request ("Remind Mira how you know each other" the first time).
alter table public.reservations
  add column note text check (char_length(note) <= 500);

-- The question after a return ("Give Sara a library pass?"), answered or
-- not. It's asked once per returned loan.
alter table public.loans add column pass_question_answered_at timestamptz;

-- Today's first-time requests become ordinary requests waiting for the
-- librarian: their note moves onto the request, and the "pending" row
-- goes (it would now mean "asked for a pass"). People declined as
-- first-time borrowers start afresh. (The reservation rules would refuse
-- this one-off change, because the SQL Editor isn't signed in as anyone,
-- so they're paused for this one step.)
alter table public.reservations disable trigger reservation_rules;
update public.reservations r
set note = ba.note
from public.borrower_approvals ba
where ba.status = 'pending' and ba.note is not null
  and r.owner_id = ba.owner_id and r.member_id = ba.borrower_id and r.status = 'pending_approval';
alter table public.reservations enable trigger reservation_rules;

delete from public.borrower_approvals where status in ('pending', 'declined');
-- Everyone still 'approved' keeps that status, which now means they hold a pass.

-- 08's trigger tidied up first-time requests that were withdrawn. Requests
-- no longer create those, so it goes.
drop trigger withdraw_first_request on public.reservations;
drop function public.withdraw_first_request();


-- ---------------------------------------------------------------------
-- PART 2: who can see a Restricted Section
-- ---------------------------------------------------------------------

create or replace function public.holds_pass(p_owner_id uuid, p_member_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.borrower_approvals ba
    where ba.owner_id = p_owner_id and ba.borrower_id = p_member_id and ba.status = 'approved'
  );
$$;

-- Is this title on this shelf hidden from the signed-in member? Only if
-- it's in that librarian's Restricted Section and the member isn't the
-- librarian, doesn't hold their pass and isn't the admin. Anyone always
-- sees a book they've reserved or borrowed from that shelf (say, if their
-- pass was taken back while they had it).
create or replace function public.hidden_from_me(p_owner_id uuid, p_book_id bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_restricted(p_owner_id, p_book_id)
    and p_owner_id is distinct from (select auth.uid())
    and not public.holds_pass(p_owner_id, (select auth.uid()))
    and not public.is_admin()
    and not exists (
      select 1 from public.reservations r
      where r.owner_id = p_owner_id and r.book_id = p_book_id and r.member_id = (select auth.uid())
        and r.status in ('pending_approval', 'active')
    )
    and not exists (
      select 1 from public.loans l
      join public.copies c on c.id = l.copy_id
      where c.owner_id = p_owner_id and c.book_id = p_book_id and l.member_id = (select auth.uid())
        and l.returned_on is null
    );
$$;

-- A title stays in the catalogue for the signed-in member unless every
-- copy on a shelf is hidden from them. (Titles with no copies left behave
-- as before.)
create or replace function public.book_visible(p_book_id bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (
           select 1 from public.copies c where c.book_id = p_book_id and c.removed_at is null
         )
      or exists (
           select 1 from public.copies c
           where c.book_id = p_book_id and c.removed_at is null
             and not public.hidden_from_me(c.owner_id, c.book_id)
         );
$$;


-- ---------------------------------------------------------------------
-- PART 3: hiding Restricted books from people without a pass
-- ---------------------------------------------------------------------

-- The Restricted Section list itself (with its reasons).
drop policy "restricted: everyone reads" on public.restricted_titles;
create policy "restricted: the librarian, pass holders and the admin" on public.restricted_titles
  for select to authenticated
  using (not public.hidden_from_me(owner_id, book_id));

-- Copies on shelves (09 already hid removed ones).
drop policy "copies: on a shelf" on public.copies;
create policy "copies: on a shelf, unless restricted for you" on public.copies
  for select to authenticated
  using (removed_at is null and not public.hidden_from_me(owner_id, book_id));

-- Titles: a book only on shelves whose Restricted Section you can't see
-- isn't in your catalogue at all.
drop policy "books: logged-in members can read" on public.books;
create policy "books: logged-in members read what's on a shelf for them" on public.books
  for select to authenticated
  using (public.book_visible(id));

-- Availability per title per library (this replaces the version in 09).
-- Same as before, without the hidden ones.
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
  where c.removed_at is null
    and not public.hidden_from_me(c.owner_id, c.book_id)
  group by c.book_id, c.owner_id;
$$;


-- ---------------------------------------------------------------------
-- PART 4: the Libraries page
-- ---------------------------------------------------------------------

-- After a "Not now": the first day this member can ask that librarian for
-- a pass again (3 months on), or null if they can ask now. Borrowing from
-- that shelf since the "Not now" lifts the wait.
create or replace function public.pass_ask_again_on(p_owner_id uuid, p_member_id uuid)
returns date
language sql stable security definer set search_path = ''
as $$
  select (ba.decided_at + interval '3 months')::date
  from public.borrower_approvals ba
  where ba.owner_id = p_owner_id and ba.borrower_id = p_member_id
    and ba.status = 'declined'
    and (ba.decided_at + interval '3 months')::date > current_date
    and not exists (
      select 1 from public.loans l
      where l.owner_id = p_owner_id and l.member_id = p_member_id and l.lent_on >= ba.decided_at::date
    );
$$;

-- Every shelf, with where the signed-in member stands. This replaces the
-- version in 09 (new columns, so it's dropped and created again).
--   titles, copies   what the member can see and borrow
--   hidden_titles    Restricted titles they'd see with a pass
--                    ("35 books, plus 5 for library pass holders")
--   my_status        'own', 'approved' (holds a pass), 'pending' (asked for
--                    one), 'declined', 'stopped', or null. A pass that was
--                    taken back shows as null, like never having had one.
--   decided_at       when a pass request was answered (for a short note
--                    after a "Not now")
--   ask_again_on     after a "Not now": the first day they can ask again,
--                    or null if they already can
--   first_time       never asked this librarian for a book or been lent one
drop function public.libraries();
create function public.libraries()
returns table (
  owner_id      uuid,
  name          text,
  city          text,
  titles        int,
  copies        int,
  hidden_titles int,
  my_status     text,
  decided_at    timestamptz,
  ask_again_on  date,
  first_time    boolean,
  is_me         boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    m.id,
    m.name,
    m.city,
    count(distinct c.book_id) filter (where not public.hidden_from_me(m.id, c.book_id))::int,
    count(c.id) filter (where not public.hidden_from_me(m.id, c.book_id))::int,
    count(distinct c.book_id) filter (where public.hidden_from_me(m.id, c.book_id))::int,
    case when m.id = (select auth.uid()) then 'own'
         when ba.status = 'taken_back' then null
         else ba.status end,
    case when ba.status = 'declined' then ba.decided_at end,
    public.pass_ask_again_on(m.id, (select auth.uid())),
    not exists (
      select 1 from public.reservations r where r.owner_id = m.id and r.member_id = (select auth.uid())
    ) and not exists (
      select 1 from public.loans l where l.owner_id = m.id and l.member_id = (select auth.uid())
    ),
    m.id = (select auth.uid())
  from public.members m
  join public.copies c on c.owner_id = m.id and c.removed_at is null
  left join public.borrower_approvals ba on ba.owner_id = m.id and ba.borrower_id = (select auth.uid())
  group by m.id, m.name, m.city, ba.status, ba.decided_at
  order by m.name;
$$;

-- Shelf descriptions (this replaces the version in 11). Same as before,
-- except who sees the pick-ups line: the librarian, pass holders, and
-- anyone with an approved reservation or a book out from that shelf, who
-- needs to know where to go. The top 3 genres count every book on the
-- shelf, Restricted ones too: they say what kind of shelf it is without
-- naming a title.
create or replace function public.shelf_descriptions()
returns table (
  owner_id     uuid,
  top_genres   text[],
  personality  text,
  pickups      text,
  described    boolean
)
language sql stable security definer set search_path = ''
as $$
  with genre_counts as (
    select c.owner_id, b.genre, count(distinct b.id) as titles
    from public.copies c
    join public.books b on b.id = c.book_id
    where c.removed_at is null
    group by c.owner_id, b.genre
  ),
  ranked as (
    select gc.owner_id, gc.genre,
           row_number() over (partition by gc.owner_id order by gc.titles desc, gc.genre) as place
    from genre_counts gc
  )
  select
    s.owner_id,
    array(select r.genre from ranked r where r.owner_id = s.owner_id and r.place <= 3 order by r.place),
    d.personality,
    case when s.owner_id = (select auth.uid())
           or public.holds_pass(s.owner_id, (select auth.uid()))
           or exists (
             select 1 from public.reservations r
             where r.owner_id = s.owner_id and r.member_id = (select auth.uid()) and r.status = 'active'
           )
           or exists (
             select 1 from public.loans l
             where l.owner_id = s.owner_id and l.member_id = (select auth.uid()) and l.returned_on is null
           )
         then d.pickups end,
    d.owner_id is not null
  from (select distinct gc.owner_id from genre_counts gc) s
  left join public.shelf_descriptions d on d.owner_id = s.owner_id;
$$;


-- ---------------------------------------------------------------------
-- PART 5: reservation rules and requests
-- ---------------------------------------------------------------------

-- Reservation rules (this replaces the version in 14):
--  * Members reserve only for themselves, and never from their own shelf.
--  * The library must have a copy the member can see: without a pass,
--    Restricted books aren't on offer.
--  * Pass holders: straight into the queue, except Restricted books,
--    which wait for the librarian.
--  * Everyone else: every request waits for the librarian.
--  * Members can only cancel. The library's owner (or the admin) decides.
--  * Clearing a deleted member from their old reservations is let through (14).
create or replace function public.reservation_rules()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_status text;
begin
  if tg_op = 'INSERT' then
    -- The very first app didn't say which library: that means Asad's.
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
    ) or (
      public.is_restricted(new.owner_id, new.book_id)
      and not public.holds_pass(new.owner_id, new.member_id)
    ) then
      raise exception 'That library doesn''t have a copy of this book.';
    end if;

    v_status := public.borrower_status(new.owner_id, new.member_id);
    if v_status = 'stopped' then
      raise exception 'This library isn''t lending at the moment.';
    elsif v_status = 'approved' and not public.is_restricted(new.owner_id, new.book_id) then
      new.status := 'active';
    else
      new.status := 'pending_approval';
    end if;
    new.note := left(nullif(btrim(new.note), ''), 500);
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
    end if;
    if new.status is distinct from old.status then
      new.decided_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- Ask for a book from one library, with an optional note for the
-- librarian (this replaces the version in 08). The note goes on the
-- request itself.
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
  insert into public.reservations (member_id, book_id, owner_id, note)
  values (v_me, p_book_id, p_owner_id, p_note)
  returning id into v_id;
  return v_id;
end;
$$;

-- The signed-in member's open reservations (this replaces the version in
-- 08). waiting_for is now 'request' (no pass: the librarian OKs each
-- request) or 'restricted' (a Restricted book), or null once it's in the queue.
create or replace function public.my_open_reservations()
returns table (
  reservation_id bigint,
  book_id        bigint,
  owner_id       uuid,
  status         text,
  created_at     timestamptz,
  queue_place    int,
  waiting_for    text
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
      when public.holds_pass(r.owner_id, r.member_id) then 'restricted'
      else 'request'
    end
  from public.reservations r
  where r.member_id = (select auth.uid())
    and r.status in ('pending_approval', 'active');
$$;


-- ---------------------------------------------------------------------
-- PART 6: passes
-- ---------------------------------------------------------------------

-- Ask a librarian for a library pass, with an optional note.
create or replace function public.ask_for_pass(p_owner_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_status text;
  v_again  date;
begin
  if v_me is null then
    raise exception 'Sign in first.';
  end if;
  if p_owner_id = v_me then
    raise exception 'That''s your own shelf.';
  end if;
  if not exists (select 1 from public.copies c where c.owner_id = p_owner_id and c.removed_at is null) then
    raise exception 'That shelf has no books yet.';
  end if;

  v_status := public.borrower_status(p_owner_id, v_me);
  if v_status = 'approved' then
    raise exception 'You already have a library pass for this shelf.';
  elsif v_status = 'pending' then
    raise exception 'You''ve already asked. The librarian will answer soon.';
  elsif v_status = 'stopped' then
    raise exception 'This library isn''t lending at the moment.';
  end if;
  v_again := public.pass_ask_again_on(p_owner_id, v_me);
  if v_again is not null then
    raise exception 'You can ask again from %.', to_char(v_again, 'FMDD FMMonth YYYY');
  end if;

  insert into public.borrower_approvals (owner_id, borrower_id, status, note, created_at, decided_at)
  values (p_owner_id, v_me, 'pending', left(nullif(btrim(p_note), ''), 500), now(), null)
  on conflict (owner_id, borrower_id) do update
    set status = 'pending', note = excluded.note, created_at = now(), decided_at = null;
end;
$$;

-- Take back your own pass request before the librarian answers.
create or replace function public.withdraw_pass_request(p_owner_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.borrower_approvals
  where owner_id = p_owner_id and borrower_id = (select auth.uid()) and status = 'pending';
$$;

-- The librarian answers a pass request: a pass, or "Not now".
create or replace function public.decide_pass(p_borrower_id uuid, p_give boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.borrower_approvals
  set status = case when p_give then 'approved' else 'declined' end,
      decided_at = now()
  where owner_id = (select auth.uid()) and borrower_id = p_borrower_id and status = 'pending';
  if not found then
    raise exception 'There''s no pass request from this person to answer.';
  end if;
end;
$$;

-- Is this person connected to the signed-in librarian's shelf: they've
-- asked for a pass, reserved or borrowed from it?
create or replace function public.knows_my_shelf(p_member_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.borrower_approvals ba
                 where ba.owner_id = (select auth.uid()) and ba.borrower_id = p_member_id)
      or exists (select 1 from public.reservations r
                 where r.owner_id = (select auth.uid()) and r.member_id = p_member_id)
      or exists (select 1 from public.loans l
                 where l.owner_id = (select auth.uid()) and l.member_id = p_member_id);
$$;

-- Give someone a pass at any time (the Borrowers tab, or the question
-- after a return). Also answers a pass request they've made.
create or replace function public.give_pass(p_borrower_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if p_borrower_id is null or p_borrower_id = v_me then
    raise exception 'That''s your own shelf.';
  end if;
  if not public.knows_my_shelf(p_borrower_id) then
    raise exception 'This person hasn''t borrowed from your shelf yet.';
  end if;
  insert into public.borrower_approvals (owner_id, borrower_id, status, decided_at)
  values (v_me, p_borrower_id, 'approved', now())
  on conflict (owner_id, borrower_id) do update
    set status = 'approved', decided_at = now();
end;
$$;

-- Take a pass back, quietly: the person goes back to asking each time.
-- Their open reservation and any book they have stay as they are.
create or replace function public.take_back_pass(p_borrower_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.borrower_approvals
  set status = 'taken_back', decided_at = now()
  where owner_id = (select auth.uid()) and borrower_id = p_borrower_id and status = 'approved';
  if not found then
    raise exception 'This person doesn''t have your library pass.';
  end if;
end;
$$;

-- Stop lending to someone (pass or not): their open reservation on this
-- shelf is cancelled; a book they already have comes back as normal.
-- (This replaces the version in 08, which only worked for approved borrowers.)
create or replace function public.stop_lending(p_borrower_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if p_borrower_id is null or p_borrower_id = v_me or not public.knows_my_shelf(p_borrower_id) then
    raise exception 'This person isn''t one of your borrowers.';
  end if;
  insert into public.borrower_approvals (owner_id, borrower_id, status, decided_at)
  values (v_me, p_borrower_id, 'stopped', now())
  on conflict (owner_id, borrower_id) do update
    set status = 'stopped', decided_at = now();

  update public.reservations
  set status = 'cancelled'
  where owner_id = v_me and member_id = p_borrower_id
    and status in ('pending_approval', 'active');
end;
$$;

-- Lend to someone again after stopping: they go back to asking each time
-- (give them a pass separately if you like).
create or replace function public.lend_again(p_borrower_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.borrower_approvals
  where owner_id = (select auth.uid()) and borrower_id = p_borrower_id and status = 'stopped';
  if not found then
    raise exception 'You haven''t stopped lending to this person.';
  end if;
end;
$$;

-- 08's answer to a first-time request no longer applies: requests are
-- answered one by one, passes separately.
drop function public.decide_borrower(uuid, boolean);


-- ---------------------------------------------------------------------
-- PART 7: the lending desk
-- ---------------------------------------------------------------------

-- What the request card shows about a member, for one librarian: who
-- invited them, which librarians have given them a pass, when they joined,
-- how their loans have gone, and how often they've borrowed from this shelf.
create or replace function public.borrower_facts(p_member_id uuid, p_owner_id uuid)
returns table (
  invited_by_name text,
  passes_from     text[],
  member_since    timestamptz,
  loans_total     int,
  loans_late      int,      -- came back after the due date, or overdue now
  loans_out       int,      -- still out, not yet due
  loans_from_me   int
)
language sql stable security definer set search_path = ''
as $$
  select
    (select i.name from public.members i where i.id = m.invited_by),
    array(
      select o.name from public.borrower_approvals other
      join public.members o on o.id = other.owner_id
      where other.borrower_id = m.id and other.status = 'approved' and other.owner_id <> p_owner_id
      order by o.name
    ),
    m.created_at,
    (select count(*) from public.loans l where l.member_id = m.id)::int,
    (select count(*) from public.loans l where l.member_id = m.id
       and (l.returned_on > l.due_on or (l.returned_on is null and l.due_on < current_date)))::int,
    (select count(*) from public.loans l where l.member_id = m.id
       and l.returned_on is null and l.due_on >= current_date)::int,
    (select count(*) from public.loans l where l.member_id = m.id and l.owner_id = p_owner_id)::int
  from public.members m
  where m.id = p_member_id;
$$;

-- Requests from people without a pass, waiting for the signed-in
-- librarian: one card per request, with the note and the facts above.
-- (Replaces 08's borrower_requests(), which showed first-time borrowers.)
drop function public.borrower_requests();
create function public.request_cards()
returns table (
  reservation_id  bigint,
  borrower_id     uuid,
  name            text,
  note            text,
  requested_at    timestamptz,
  book_id         bigint,
  first_time      boolean,
  invited_by_name text,
  passes_from     text[],
  member_since    timestamptz,
  loans_total     int,
  loans_late      int,
  loans_out       int,
  loans_from_me   int
)
language sql stable security definer set search_path = ''
as $$
  select
    r.id, m.id, m.name, r.note, r.created_at, r.book_id,
    not exists (
      select 1 from public.reservations e
      where e.owner_id = r.owner_id and e.member_id = r.member_id and e.id <> r.id and e.created_at < r.created_at
    ) and not exists (
      select 1 from public.loans l where l.owner_id = r.owner_id and l.member_id = r.member_id
    ),
    f.invited_by_name, f.passes_from, f.member_since, f.loans_total, f.loans_late, f.loans_out, f.loans_from_me
  from public.reservations r
  join public.members m on m.id = r.member_id
  cross join lateral public.borrower_facts(r.member_id, r.owner_id) f
  where r.owner_id = (select auth.uid()) and r.status = 'pending_approval'
    and not public.holds_pass(r.owner_id, r.member_id)
  order by r.created_at;
$$;

-- Pass requests waiting for the signed-in librarian, with the same facts.
create or replace function public.pass_requests()
returns table (
  borrower_id     uuid,
  name            text,
  note            text,
  requested_at    timestamptz,
  invited_by_name text,
  passes_from     text[],
  member_since    timestamptz,
  loans_total     int,
  loans_late      int,
  loans_out       int,
  loans_from_me   int
)
language sql stable security definer set search_path = ''
as $$
  select
    m.id, m.name, ba.note, ba.created_at,
    f.invited_by_name, f.passes_from, f.member_since, f.loans_total, f.loans_late, f.loans_out, f.loans_from_me
  from public.borrower_approvals ba
  join public.members m on m.id = ba.borrower_id
  cross join lateral public.borrower_facts(ba.borrower_id, ba.owner_id) f
  where ba.owner_id = (select auth.uid()) and ba.status = 'pending'
  order by ba.created_at;
$$;

-- The question after a return: books that came back to the signed-in
-- librarian in the last 7 days from someone without their pass (and who
-- hasn't asked for one, or been stopped), not yet answered. One per
-- person: their latest return.
create or replace function public.pass_questions()
returns table (
  loan_id     bigint,
  borrower_id uuid,
  name        text,
  book_id     bigint,
  returned_on date
)
language sql stable security definer set search_path = ''
as $$
  select distinct on (l.member_id)
    l.id, l.member_id, m.name, c.book_id, l.returned_on
  from public.loans l
  join public.members m on m.id = l.member_id
  join public.copies c on c.id = l.copy_id
  where l.owner_id = (select auth.uid())
    and l.returned_on is not null
    and l.returned_on >= current_date - 7
    and l.pass_question_answered_at is null
    and coalesce(public.borrower_status(l.owner_id, l.member_id), 'none') not in ('approved', 'pending', 'stopped')
  order by l.member_id, l.returned_on desc, l.id desc;
$$;

-- Answer the question: a pass, or "Not now" (which only dismisses the
-- question; the person isn't told and can still ask for a pass).
create or replace function public.answer_pass_question(p_loan_id bigint, p_give boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_member uuid;
begin
  update public.loans
  set pass_question_answered_at = now()
  where id = p_loan_id and owner_id = (select auth.uid()) and returned_on is not null
  returning member_id into v_member;
  if not found then
    raise exception 'That loan isn''t one of yours.';
  end if;
  if p_give and v_member is not null then
    perform public.give_pass(v_member);
  end if;
end;
$$;

-- The signed-in librarian's borrowers, for the Borrowers tab and the
-- "Lend to" list (replaces the version in 08):
--   status 'pass'     holds a pass
--          'borrower' has borrowed before, no pass
--          'stopped'  the librarian stopped lending to them
drop function public.my_borrowers();
create function public.my_borrowers()
returns table (
  borrower_id   uuid,
  name          text,
  status        text,
  pass_since    timestamptz,
  has_my_book   boolean,
  loans_from_me int
)
language sql stable security definer set search_path = ''
as $$
  with people as (
    select ba.borrower_id as id from public.borrower_approvals ba
    where ba.owner_id = (select auth.uid()) and ba.status in ('approved', 'stopped')
    union
    select l.member_id from public.loans l
    where l.owner_id = (select auth.uid()) and l.member_id is not null
  )
  select
    m.id,
    m.name,
    case ba.status when 'approved' then 'pass' when 'stopped' then 'stopped' else 'borrower' end,
    case when ba.status = 'approved' then ba.decided_at end,
    exists (
      select 1 from public.loans l
      where l.member_id = m.id and l.owner_id = (select auth.uid()) and l.returned_on is null
    ),
    (select count(*) from public.loans l where l.member_id = m.id and l.owner_id = (select auth.uid()))::int
  from people p
  join public.members m on m.id = p.id
  left join public.borrower_approvals ba on ba.owner_id = (select auth.uid()) and ba.borrower_id = m.id
  order by m.name;
$$;


-- ---------------------------------------------------------------------
-- PART 8: lending in person
-- ---------------------------------------------------------------------

-- Lending (this replaces the version in 09). Same as before, except that
-- lending in person no longer approves the person: it gives no pass.
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
  select c.book_id, c.owner_id into v_book_id, v_owner_id
  from public.copies c where c.id = p_copy_id and c.removed_at is null;
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

  insert into public.loans (copy_id, member_id, reservation_id, lent_on)
  values (p_copy_id, p_member_id, v_reservation_id, p_lent_on)
  returning id into v_loan_id;

  if v_reservation_id is not null then
    update public.reservations set status = 'fulfilled' where id = v_reservation_id;
  end if;
  return v_loan_id;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 9: who may call what
-- ---------------------------------------------------------------------

-- Only logged-in members may call these. New functions are callable by
-- everyone by default, so take that away first.
revoke execute on function public.holds_pass(uuid, uuid) from public, anon;
revoke execute on function public.hidden_from_me(uuid, bigint) from public, anon;
revoke execute on function public.book_visible(bigint) from public, anon;
revoke execute on function public.libraries() from public, anon;
revoke execute on function public.pass_ask_again_on(uuid, uuid) from public, anon;
revoke execute on function public.ask_for_pass(uuid, text) from public, anon;
revoke execute on function public.withdraw_pass_request(uuid) from public, anon;
revoke execute on function public.decide_pass(uuid, boolean) from public, anon;
revoke execute on function public.knows_my_shelf(uuid) from public, anon;
revoke execute on function public.give_pass(uuid) from public, anon;
revoke execute on function public.take_back_pass(uuid) from public, anon;
revoke execute on function public.lend_again(uuid) from public, anon;
revoke execute on function public.borrower_facts(uuid, uuid) from public, anon;
revoke execute on function public.request_cards() from public, anon;
revoke execute on function public.pass_requests() from public, anon;
revoke execute on function public.pass_questions() from public, anon;
revoke execute on function public.answer_pass_question(bigint, boolean) from public, anon;
revoke execute on function public.my_borrowers() from public, anon;

-- The policies above call these, so signed-in members need them.
grant execute on function public.holds_pass(uuid, uuid) to authenticated;
grant execute on function public.hidden_from_me(uuid, bigint) to authenticated;
grant execute on function public.book_visible(bigint) to authenticated;
-- What the app calls.
grant execute on function public.libraries() to authenticated;
grant execute on function public.ask_for_pass(uuid, text) to authenticated;
grant execute on function public.withdraw_pass_request(uuid) to authenticated;
grant execute on function public.decide_pass(uuid, boolean) to authenticated;
grant execute on function public.give_pass(uuid) to authenticated;
grant execute on function public.take_back_pass(uuid) to authenticated;
grant execute on function public.lend_again(uuid) to authenticated;
grant execute on function public.request_cards() to authenticated;
grant execute on function public.pass_requests() to authenticated;
grant execute on function public.pass_questions() to authenticated;
grant execute on function public.answer_pass_question(bigint, boolean) to authenticated;
grant execute on function public.my_borrowers() to authenticated;
-- (pass_ask_again_on, knows_my_shelf and borrower_facts are only used
-- inside the functions above, so nobody calls them directly.)


-- Quick check: how many passes there are (everyone approved before this
-- file), requests still waiting for a librarian, and Restricted titles.
select
  (select count(*) from public.borrower_approvals where status = 'approved') as library_passes,
  (select count(*) from public.reservations where status = 'pending_approval') as requests_waiting,
  (select count(*) from public.restricted_titles) as restricted_titles;
