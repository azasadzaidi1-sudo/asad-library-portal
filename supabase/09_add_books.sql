-- =====================================================================
-- Add book: librarians add their own books, and can remove copies
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================
--
--   PART 1  Books remember who added them and their Open Library work, so the
--           same book isn't added twice.
--   PART 2  Copies can be removed from a shelf. They're marked as removed,
--           not deleted, so past loans (and the "Borrowed from the library"
--           badge on reviews) stay intact.
--   PART 3  add_book(): any member adds a book to their own shelf. If it's
--           already in the catalogue, their copy joins that card.
--   PART 4  remove_copy(): a librarian removes one of their copies.
--   PART 5  The shelf, availability and lending functions from 08 now skip
--           removed copies.
--
-- The current app keeps working after this file runs.


-- ---------------------------------------------------------------------
-- PART 1: who added a book, and which Open Library work it is
-- ---------------------------------------------------------------------

alter table public.books
  add column added_by uuid references public.members (id) on delete set null;
-- e.g. 'OL679360W' for American Gods. Your original 188 books don't have one.
alter table public.books add column ol_work_key text;
create unique index books_one_per_open_library_work
  on public.books (ol_work_key) where ol_work_key is not null;


-- ---------------------------------------------------------------------
-- PART 2: removing a copy from a shelf
-- ---------------------------------------------------------------------

alter table public.copies add column removed_at timestamptz;

-- Members only ever see copies that are still on a shelf.
drop policy "copies: logged-in members can read" on public.copies;
create policy "copies: on a shelf" on public.copies
  for select to authenticated using (removed_at is null);


-- ---------------------------------------------------------------------
-- PART 3: adding a book
-- ---------------------------------------------------------------------

-- Adds a copy to the signed-in member's shelf, and the book itself if
-- it's new to the catalogue. Returns the book's id.
--   * Already in the catalogue (same Open Library work, or same title and
--     author)? Only the copy is added, and the catalogue entry stays as it is.
--   * New titles need a genre from the existing list; the description is
--     optional (in the librarian's own words). Awards come from Wikidata,
--     looked up by the app. Goodreads ratings are added later, in batches.
create or replace function public.add_book(
  p_title        text,
  p_author       text,
  p_genre        text,
  p_language     text,
  p_year         int     default null,
  p_description  text    default null,
  p_cover_id     bigint  default null,
  p_ol_work_key  text    default null,
  p_prizes       text[]  default '{}',
  p_edition_note text    default null
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_title  text := btrim(coalesce(p_title, ''));
  v_author text := btrim(coalesce(p_author, ''));
  v_book   bigint;
begin
  if v_me is null then
    raise exception 'Sign in first.';
  end if;
  if char_length(v_title) not between 1 and 300 then
    raise exception 'The book needs a title.';
  end if;
  if char_length(v_author) > 200 then
    raise exception 'That author name is too long.';
  end if;
  if char_length(coalesce(p_edition_note, '')) > 100 then
    raise exception 'Keep the note about your copy under 100 characters.';
  end if;

  select b.id into v_book
  from public.books b
  where (p_ol_work_key is not null and b.ol_work_key = p_ol_work_key)
     or (lower(btrim(b.title)) = lower(v_title) and lower(btrim(b.author)) = lower(v_author))
  order by b.id
  limit 1;

  if v_book is null then
    if not exists (select 1 from public.books b where b.genre = p_genre) then
      raise exception 'Pick a genre from the list.';
    end if;
    if coalesce(p_language, '') !~ '^[a-z]{2}$' then
      raise exception 'Pick the book''s language.';
    end if;
    if p_year is not null and p_year not between 0 and extract(year from now())::int + 1 then
      raise exception 'That year doesn''t look right.';
    end if;
    if char_length(coalesce(p_description, '')) > 600 then
      raise exception 'Keep the description under 600 characters.';
    end if;
    if cardinality(coalesce(p_prizes, '{}')) > 12
      or exists (select 1 from unnest(coalesce(p_prizes, '{}')) x where char_length(x) > 100) then
      raise exception 'That list of awards doesn''t look right.';
    end if;

    insert into public.books
      (title, author, genre, language, year_published, description, cover_id, ol_work_key, prizes, added_by)
    values
      (v_title, v_author, p_genre, p_language, p_year, nullif(btrim(p_description), ''),
       p_cover_id, p_ol_work_key, coalesce(p_prizes, '{}'), v_me)
    returning id into v_book;
  end if;

  insert into public.copies (book_id, owner_id, edition_note)
  values (v_book, v_me, nullif(btrim(p_edition_note), ''));
  return v_book;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 4: removing a copy
-- ---------------------------------------------------------------------

-- Only the copy's owner can remove it, and only while it isn't lent out.
-- If it was their last copy of that title, anyone waiting for it on their
-- shelf has their reservation cancelled, and the title leaves their
-- Restricted Section.
create or replace function public.remove_copy(p_copy_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me   uuid := (select auth.uid());
  v_book bigint;
begin
  select c.book_id into v_book
  from public.copies c
  where c.id = p_copy_id and c.owner_id = v_me and c.removed_at is null;
  if v_book is null then
    raise exception 'That copy isn''t on your shelf.';
  end if;
  if exists (select 1 from public.loans l where l.copy_id = p_copy_id and l.returned_on is null) then
    raise exception 'That copy is lent out. Mark it returned first.';
  end if;

  update public.copies set removed_at = now() where id = p_copy_id;

  if not exists (
    select 1 from public.copies c
    where c.book_id = v_book and c.owner_id = v_me and c.removed_at is null
  ) then
    update public.reservations
    set status = 'cancelled'
    where book_id = v_book and owner_id = v_me and status in ('pending_approval', 'active');
    delete from public.restricted_titles where owner_id = v_me and book_id = v_book;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 5: the functions from 08, now skipping removed copies
-- (each is the same as before, plus "removed_at is null")
-- ---------------------------------------------------------------------

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
  join public.copies c on c.owner_id = m.id and c.removed_at is null
  group by m.id, m.name, m.city
  order by m.name;
$$;

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
  group by c.book_id, c.owner_id;
$$;

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
      select 1 from public.copies c
      where c.book_id = i.book_id and c.owner_id = (select auth.uid()) and c.removed_at is null
    )
  );
$$;

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

revoke execute on function public.add_book(text, text, text, text, int, text, bigint, text, text[], text) from public, anon;
revoke execute on function public.remove_copy(bigint) from public, anon;
grant execute on function public.add_book(text, text, text, text, int, text, bigint, text, text[], text) to authenticated;
grant execute on function public.remove_copy(bigint) to authenticated;


-- Quick check: should show 188 books, none added by a librarian yet,
-- and 200 copies still on a shelf (or fewer, if any moved or were removed).
select
  (select count(*) from public.books) as books,
  (select count(*) from public.books where added_by is not null) as added_by_librarians,
  (select count(*) from public.copies where removed_at is null) as copies_on_shelves;
