-- =====================================================================
-- Asad's Library Portal: step 2, the database tables and their rules
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART 1: THE TABLES
-- ---------------------------------------------------------------------

-- Members: one row per person. The id is the same as their login id,
-- so a login and a member profile are always linked.
create table public.members (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text,                       -- filled in by the member on first login
  city        text,                       -- filled in by the member on first login
  role        text not null default 'member'
              check (role in ('member', 'librarian')),
  created_at  timestamptz not null default now()
);

-- Books: one row per title.
create table public.books (
  id                bigint generated always as identity primary key,
  title             text not null,
  author            text not null default '',
  series            text,
  genre             text not null,
  year_published    int,
  language          text not null default 'en',
  goodreads_rating  numeric(3, 2),
  prizes            text[] not null default '{}',   -- a list, e.g. {"Booker Prize 2020"}
  notes             text,
  restricted        boolean not null default false, -- the Restricted Section
  created_at        timestamptz not null default now()
);

-- Copies: one row per physical book. The Stand = 1 book row, 2 copy rows.
create table public.copies (
  id            bigint generated always as identity primary key,
  book_id       bigint not null references public.books (id) on delete cascade,
  edition_note  text,                     -- e.g. "Hodder paperback"
  created_at    timestamptz not null default now()
);

-- Reservations: a member asks for a title (not a specific copy).
--   pending_approval = Restricted Section book, waiting for Asad
--   active           = confirmed and in the queue for that title
--   fulfilled        = turned into a loan
--   cancelled        = withdrawn by the member (or by Asad)
--   declined         = Asad said no to a Restricted Section request
create table public.reservations (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references public.members (id) on delete cascade,
  book_id     bigint not null references public.books (id) on delete cascade,
  status      text not null default 'active'
              check (status in ('pending_approval', 'active', 'fulfilled', 'cancelled', 'declined')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz                 -- when the status last changed
);

-- Loans: a specific copy handed to a member.
-- The due date is always 4 weeks (28 days) after the lent date.
-- While returned_on is empty, the book is out.
create table public.loans (
  id                bigint generated always as identity primary key,
  copy_id           bigint not null references public.copies (id),
  member_id         uuid not null references public.members (id),
  reservation_id    bigint references public.reservations (id),
  lent_on           date not null default current_date,
  due_on            date generated always as (lent_on + 28) stored,
  returned_on       date,
  reminder_sent_at  timestamptz,          -- so the daily job never emails twice
  created_at        timestamptz not null default now()
);

-- Asad's personal reading tracker. Only the librarian can see it.
create table public.reading_status (
  book_id  bigint primary key references public.books (id) on delete cascade,
  status   text not null check (status in ('unread', 'next', 'reading', 'read'))
);


-- ---------------------------------------------------------------------
-- PART 2: THE LIBRARY'S HOUSE RULES (enforced by the database itself)
-- ---------------------------------------------------------------------

-- A copy can only be lent to one person at a time.
create unique index one_open_loan_per_copy
  on public.loans (copy_id) where returned_on is null;

-- Each member can borrow one book at a time...
create unique index one_open_loan_per_member
  on public.loans (member_id) where returned_on is null;

-- ...and have one open reservation at a time.
create unique index one_open_reservation_per_member
  on public.reservations (member_id) where status in ('pending_approval', 'active');

-- Helper: is the person making this request the librarian?
-- ("security definer" lets it look at the members table even though
--  members can normally only see their own row.)
create or replace function public.is_librarian()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members
    where id = (select auth.uid()) and role = 'librarian'
  );
$$;

-- When someone accepts an invite and their login is created,
-- give them an empty member profile automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.members (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Reservation rules:
--  * A member can only reserve for themselves.
--  * Restricted Section books start as 'pending_approval', all others as 'active'.
--    Members can't skip the queue or approve their own request.
--  * A member can only change a reservation by cancelling it.
create or replace function public.reservation_rules()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  is_restricted boolean;
begin
  if tg_op = 'INSERT' then
    if not public.is_librarian() then
      new.member_id := (select auth.uid());
    end if;
    select b.restricted into is_restricted from public.books b where b.id = new.book_id;
    new.status := case when is_restricted then 'pending_approval' else 'active' end;
    new.decided_at := null;
  elsif tg_op = 'UPDATE' then
    if not public.is_librarian() then
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

create trigger reservation_rules
  before insert or update on public.reservations
  for each row execute function public.reservation_rules();


-- ---------------------------------------------------------------------
-- PART 3: WHO MAY SEE AND CHANGE WHAT (Row Level Security)
-- ---------------------------------------------------------------------

alter table public.members        enable row level security;
alter table public.books          enable row level security;
alter table public.copies         enable row level security;
alter table public.reservations   enable row level security;
alter table public.loans          enable row level security;
alter table public.reading_status enable row level security;

-- Members: you see your own profile; the librarian sees everyone.
create policy "members: read own or librarian" on public.members
  for select to authenticated
  using (id = (select auth.uid()) or public.is_librarian());

create policy "members: update own profile" on public.members
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Books and copies: every logged-in member can browse; only the librarian edits.
create policy "books: logged-in members can read" on public.books
  for select to authenticated using (true);
create policy "books: librarian adds" on public.books
  for insert to authenticated with check (public.is_librarian());
create policy "books: librarian edits" on public.books
  for update to authenticated using (public.is_librarian()) with check (public.is_librarian());
create policy "books: librarian deletes" on public.books
  for delete to authenticated using (public.is_librarian());

create policy "copies: logged-in members can read" on public.copies
  for select to authenticated using (true);
create policy "copies: librarian adds" on public.copies
  for insert to authenticated with check (public.is_librarian());
create policy "copies: librarian edits" on public.copies
  for update to authenticated using (public.is_librarian()) with check (public.is_librarian());
create policy "copies: librarian deletes" on public.copies
  for delete to authenticated using (public.is_librarian());

-- Reservations: you see and create your own; the librarian sees and manages all.
create policy "reservations: read own or librarian" on public.reservations
  for select to authenticated
  using (member_id = (select auth.uid()) or public.is_librarian());
create policy "reservations: create own" on public.reservations
  for insert to authenticated
  with check (member_id = (select auth.uid()) or public.is_librarian());
create policy "reservations: update own or librarian" on public.reservations
  for update to authenticated
  using (member_id = (select auth.uid()) or public.is_librarian())
  with check (member_id = (select auth.uid()) or public.is_librarian());

-- Loans: you see your own; only the librarian lends and records returns.
create policy "loans: read own or librarian" on public.loans
  for select to authenticated
  using (member_id = (select auth.uid()) or public.is_librarian());
create policy "loans: librarian adds" on public.loans
  for insert to authenticated with check (public.is_librarian());
create policy "loans: librarian edits" on public.loans
  for update to authenticated using (public.is_librarian()) with check (public.is_librarian());
create policy "loans: librarian deletes" on public.loans
  for delete to authenticated using (public.is_librarian());

-- Reading tracker: librarian only.
create policy "reading status: librarian only" on public.reading_status
  for all to authenticated
  using (public.is_librarian()) with check (public.is_librarian());


-- ---------------------------------------------------------------------
-- PART 4: OPEN THE TABLES TO THE WEBSITE (for logged-in users only)
-- Nothing is granted to "anon", so visitors who aren't logged in see nothing.
-- ---------------------------------------------------------------------

grant select on public.members to authenticated;
grant update (name, city) on public.members to authenticated;   -- not "role"!

grant select, insert, update, delete on public.books  to authenticated;
grant select, insert, update, delete on public.copies to authenticated;

grant select, insert on public.reservations to authenticated;
grant update (status) on public.reservations to authenticated;

grant select, insert, delete on public.loans to authenticated;
grant update (returned_on, reminder_sent_at) on public.loans to authenticated;

grant select, insert, update, delete on public.reading_status to authenticated;

grant execute on function public.is_librarian() to authenticated;
