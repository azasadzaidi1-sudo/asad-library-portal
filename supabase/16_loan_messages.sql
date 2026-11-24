-- =====================================================================
-- The Common Shelf: loan messages, and "Extend by two weeks"
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Needs 01-15 to have run first.
--
-- Before running it: Supabase -> Integrations -> Cron -> enable it (one
-- click). This file then schedules a nightly job that deletes old
-- conversations; the quick check at the end says whether it's there.
-- =====================================================================
--
-- A borrower and a librarian can message each other about one
-- reservation or loan: arranging the pick-up, a question about the book,
-- a late return. Nothing else: no open direct messages, no group chat.
--
--   * A conversation opens when a reservation is confirmed: straight away
--     for a pass holder, after the librarian's OK for everyone else (and
--     for Restricted books). Lending a book in person opens one too.
--   * It stays open while the book is out, and for one more week after it
--     comes back, so the two can talk about the book (and swap numbers if
--     they like). Then it's read-only.
--   * If the reservation is cancelled or declined before any lending, it's
--     read-only straight away.
--   * A month after it turns read-only, it's deleted: nightly, by the
--     scheduled job. (Until then, nobody sees it past that date anyway.)
--   * Text only, up to 1,000 characters. No editing; you can delete your
--     own messages ("Message deleted").
--   * Only the two people involved can read it. When someone deletes
--     their account, their messages stay in the other person's
--     conversation as "Former member" until it's deleted.
--   * The librarian can extend a loan by two weeks from the lending desk
--     (as often as they like); the conversation notes the new due date.
--
--   PART 1  Tables: conversations, messages, what each person has read
--   PART 2  Opening and closing conversations as reservations and loans change
--   PART 3  Who can see what
--   PART 4  Functions the app calls
--   PART 5  Extending a loan
--   PART 6  Deleting old conversations, every night
--   PART 7  Current reservations and loans get their conversation
--   PART 8  Who may call what


-- ---------------------------------------------------------------------
-- PART 1: tables
-- ---------------------------------------------------------------------

-- One conversation per reservation (and the loan that follows it), or per
-- loan lent in person without a reservation.
create table public.message_threads (
  id              bigint generated always as identity primary key,
  reservation_id  bigint unique references public.reservations (id) on delete cascade,
  loan_id         bigint unique references public.loans (id) on delete cascade,
  owner_id        uuid references public.members (id) on delete set null,   -- the librarian
  member_id       uuid references public.members (id) on delete set null,   -- the borrower
  book_id         bigint not null references public.books (id) on delete cascade,
  opened_at       timestamptz not null default now(),
  read_only_from  timestamptz,      -- null while it's open
  delete_after    timestamptz,      -- a month after read_only_from
  check (reservation_id is not null or loan_id is not null)
);

create index message_threads_by_owner on public.message_threads (owner_id);
create index message_threads_by_member on public.message_threads (member_id);

-- kind 'text' is someone's message; 'event' is a note from the app (a new
-- due date). A deleted message keeps its place, without its text.
create table public.messages (
  id          bigint generated always as identity primary key,
  thread_id   bigint not null references public.message_threads (id) on delete cascade,
  sender_id   uuid references public.members (id) on delete set null,
  kind        text not null default 'text' check (kind in ('text', 'event')),
  body        text check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check (deleted_at is not null or body is not null)
);

create index messages_by_thread on public.messages (thread_id, created_at);

-- When each person last read each conversation, for the unread counts.
create table public.thread_reads (
  thread_id     bigint not null references public.message_threads (id) on delete cascade,
  member_id     uuid not null references public.members (id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (thread_id, member_id)
);


-- ---------------------------------------------------------------------
-- PART 2: opening and closing conversations
-- ---------------------------------------------------------------------

-- Close a conversation: read-only from p_from, deleted a month later.
create or replace function public.close_thread(p_thread_id bigint, p_from timestamptz)
returns void
language sql security definer set search_path = ''
as $$
  update public.message_threads
  set read_only_from = p_from, delete_after = p_from + interval '1 month'
  where id = p_thread_id;
$$;

-- Reservations: a confirmed one ('active') opens a conversation; one
-- cancelled or declined before any lending closes it straight away.
create or replace function public.reservation_thread()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_thread bigint;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    insert into public.message_threads (reservation_id, owner_id, member_id, book_id)
    values (new.id, new.owner_id, new.member_id, new.book_id)
    on conflict (reservation_id) do nothing;
  elsif tg_op = 'UPDATE' and new.status in ('cancelled', 'declined') and old.status is distinct from new.status then
    select t.id into v_thread
    from public.message_threads t
    where t.reservation_id = new.id and t.loan_id is null and t.read_only_from is null;
    if v_thread is not null then
      perform public.close_thread(v_thread, now());
    end if;
  end if;
  return null;
end;
$$;

create trigger reservation_thread
  after insert or update of status on public.reservations
  for each row execute function public.reservation_thread();

-- Loans: lending carries on the reservation's conversation (or opens one,
-- when lent in person); the return starts the last week.
create or replace function public.loan_thread()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_thread bigint;
begin
  if tg_op = 'INSERT' then
    if new.reservation_id is not null then
      update public.message_threads
      set loan_id = new.id, read_only_from = null, delete_after = null
      where reservation_id = new.reservation_id
      returning id into v_thread;
    end if;
    if v_thread is null then
      insert into public.message_threads (loan_id, owner_id, member_id, book_id)
      select new.id, new.owner_id, new.member_id, c.book_id
      from public.copies c where c.id = new.copy_id;
    end if;
  elsif new.returned_on is not null and old.returned_on is null then
    select t.id into v_thread from public.message_threads t where t.loan_id = new.id;
    if v_thread is not null then
      perform public.close_thread(v_thread, now() + interval '7 days');
    end if;
  elsif new.returned_on is null and old.returned_on is not null then
    -- A return recorded by mistake and undone: open again.
    update public.message_threads
    set read_only_from = null, delete_after = null
    where loan_id = new.id;
  end if;
  return null;
end;
$$;

-- (An "after" trigger, so 08's loan_owner has already filled in owner_id.)
create trigger loan_thread
  after insert or update of returned_on on public.loans
  for each row execute function public.loan_thread();


-- ---------------------------------------------------------------------
-- PART 3: who can see what
-- ---------------------------------------------------------------------

-- Is the signed-in member one of the two people in this conversation, and
-- is it still there (not past its deletion date)?
create or replace function public.in_thread(p_thread_id bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.message_threads t
    where t.id = p_thread_id
      and (t.owner_id = (select auth.uid()) or t.member_id = (select auth.uid()))
      and (t.delete_after is null or t.delete_after > now())
  );
$$;

alter table public.message_threads enable row level security;
create policy "threads: the two people in it" on public.message_threads
  for select to authenticated using (public.in_thread(id));
grant select on public.message_threads to authenticated;

alter table public.messages enable row level security;
create policy "messages: the two people in the conversation" on public.messages
  for select to authenticated using (public.in_thread(thread_id));
grant select on public.messages to authenticated;
-- Sending and deleting go through the functions in PART 4.

alter table public.thread_reads enable row level security;
create policy "reads: your own" on public.thread_reads
  for select to authenticated using (member_id = (select auth.uid()));
grant select on public.thread_reads to authenticated;

-- New messages reach an open conversation straight away (Supabase
-- Realtime), still filtered by the rules above. (The test database has no
-- Realtime, so this is skipped there.)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 4: functions the app calls
-- ---------------------------------------------------------------------

-- The signed-in member's conversations, newest activity first, with what
-- the list and the conversation page show.
--   role          'borrower' or 'librarian': which side the member is on
--   other_name    the other person's name (null: they've left the app)
--   stage         'requested' (reserved), 'lent', 'returned' (the last
--                 week) or 'closed' (read-only)
create or replace function public.my_threads()
returns table (
  thread_id       bigint,
  book_id         bigint,
  title           text,
  role            text,
  other_id        uuid,
  other_name      text,
  reservation_id  bigint,
  loan_id         bigint,
  stage           text,
  due_on          date,
  opened_at       timestamptz,
  read_only_from  timestamptz,
  delete_after    timestamptz,
  last_message_at timestamptz,
  unread          int
)
language sql stable security definer set search_path = ''
as $$
  select
    t.id,
    t.book_id,
    b.title,
    case when t.owner_id = (select auth.uid()) then 'librarian' else 'borrower' end,
    case when t.owner_id = (select auth.uid()) then t.member_id else t.owner_id end,
    o.name,
    t.reservation_id,
    t.loan_id,
    case
      when t.read_only_from is not null and t.read_only_from <= now() then 'closed'
      when l.returned_on is not null then 'returned'
      when t.loan_id is not null then 'lent'
      else 'requested'
    end,
    l.due_on,
    t.opened_at,
    t.read_only_from,
    t.delete_after,
    (select max(m.created_at) from public.messages m where m.thread_id = t.id),
    (select count(*) from public.messages m
      where m.thread_id = t.id and m.deleted_at is null
        and m.sender_id is distinct from (select auth.uid())
        and m.created_at > coalesce(
          (select r.last_read_at from public.thread_reads r
            where r.thread_id = t.id and r.member_id = (select auth.uid())),
          '-infinity'))::int
  from public.message_threads t
  join public.books b on b.id = t.book_id
  left join public.loans l on l.id = t.loan_id
  left join public.members o
    on o.id = case when t.owner_id = (select auth.uid()) then t.member_id else t.owner_id end
  where (t.owner_id = (select auth.uid()) or t.member_id = (select auth.uid()))
    and (t.delete_after is null or t.delete_after > now())
  order by coalesce((select max(m.created_at) from public.messages m where m.thread_id = t.id), t.opened_at) desc;
$$;

-- Send a message. Text only, 1 to 1,000 characters, while the
-- conversation is open.
create or replace function public.send_message(p_thread_id bigint, p_body text)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_me   uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_open timestamptz;
  v_id   bigint;
begin
  if not public.in_thread(p_thread_id) then
    raise exception 'That conversation isn''t yours.';
  end if;
  select t.read_only_from into v_open from public.message_threads t where t.id = p_thread_id;
  if v_open is not null and v_open <= now() then
    raise exception 'This conversation is read-only now.';
  end if;
  if char_length(v_body) = 0 then
    raise exception 'Write something first.';
  end if;
  if char_length(v_body) > 1000 then
    raise exception 'Keep a message under 1,000 characters.';
  end if;

  insert into public.messages (thread_id, sender_id, body)
  values (p_thread_id, v_me, v_body)
  returning id into v_id;
  -- Your own message counts as read.
  perform public.mark_thread_read(p_thread_id);
  return v_id;
end;
$$;

-- Delete one of your own messages. It keeps its place in the
-- conversation, as "Message deleted".
create or replace function public.delete_message(p_message_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.messages
  set body = null, deleted_at = now()
  where id = p_message_id and sender_id = (select auth.uid()) and kind = 'text' and deleted_at is null;
  if not found then
    raise exception 'You can only delete your own messages.';
  end if;
end;
$$;

-- Mark a conversation as read up to now.
create or replace function public.mark_thread_read(p_thread_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.in_thread(p_thread_id) then
    raise exception 'That conversation isn''t yours.';
  end if;
  insert into public.thread_reads (thread_id, member_id, last_read_at)
  values (p_thread_id, (select auth.uid()), now())
  on conflict (thread_id, member_id) do update set last_read_at = now();
end;
$$;


-- ---------------------------------------------------------------------
-- PART 5: extending a loan
-- ---------------------------------------------------------------------

-- Until now the due date was always 4 weeks after lending, worked out by
-- the database (01). Extending moves it, so the database now works it out
-- as 4 weeks after lending plus any extensions. (Members still can't
-- change either: they can only update returned_on, 01.)
alter table public.loans add column extended_days int not null default 0 check (extended_days >= 0);
alter table public.loans alter column due_on drop expression;

create or replace function public.loan_due_date()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.due_on := new.lent_on + 28 + new.extended_days;
  return new;
end;
$$;

create trigger loan_due_date
  before insert or update on public.loans
  for each row execute function public.loan_due_date();

-- "Extend by two weeks", on the lending desk: only the librarian, only
-- while the book is out. The conversation notes the new due date.
create or replace function public.extend_loan(p_loan_id bigint)
returns date
language plpgsql security definer set search_path = ''
as $$
declare
  v_due    date;
  v_thread bigint;
begin
  update public.loans
  set extended_days = extended_days + 14
  where id = p_loan_id and owner_id = (select auth.uid()) and returned_on is null
  returning due_on into v_due;
  if not found then
    raise exception 'That loan isn''t out from your shelf.';
  end if;

  insert into public.messages (thread_id, kind, body)
  select t.id, 'event', 'The due date is now ' || to_char(v_due, 'FMDD Mon YYYY') || '.'
  from public.message_threads t where t.loan_id = p_loan_id
  returning thread_id into v_thread;
  -- The note is news to the borrower, not to the librarian who extended.
  if v_thread is not null then
    perform public.mark_thread_read(v_thread);
  end if;
  return v_due;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 6: deleting old conversations
-- ---------------------------------------------------------------------

-- Deletes every conversation (and its messages) a month past read-only.
-- Returns how many went.
create or replace function public.delete_expired_threads()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_count int;
begin
  delete from public.message_threads where delete_after <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Every night at 03:17 (UTC), using Supabase Cron. If Cron isn't on yet,
-- this says so in the results: turn it on (Integrations -> Cron) and run
-- this file's PART 6 again.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('delete-old-conversations', '17 3 * * *', 'select public.delete_expired_threads()');
  else
    raise notice 'Cron isn''t available here, so old conversations aren''t deleted automatically yet.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 7: current reservations and loans get their conversation
-- ---------------------------------------------------------------------

-- Books out now (with their reservation's conversation, if any) ...
insert into public.message_threads (reservation_id, loan_id, owner_id, member_id, book_id)
select l.reservation_id, l.id, l.owner_id, l.member_id, c.book_id
from public.loans l
join public.copies c on c.id = l.copy_id
where l.returned_on is null and l.member_id is not null and l.owner_id is not null;

-- ... and confirmed reservations waiting for a book.
insert into public.message_threads (reservation_id, owner_id, member_id, book_id)
select r.id, r.owner_id, r.member_id, r.book_id
from public.reservations r
where r.status = 'active' and r.member_id is not null and r.owner_id is not null
on conflict (reservation_id) do nothing;


-- ---------------------------------------------------------------------
-- PART 8: who may call what
-- ---------------------------------------------------------------------

revoke execute on function public.close_thread(bigint, timestamptz) from public, anon, authenticated;
revoke execute on function public.delete_expired_threads() from public, anon, authenticated;
revoke execute on function public.in_thread(bigint) from public, anon;
revoke execute on function public.my_threads() from public, anon;
revoke execute on function public.send_message(bigint, text) from public, anon;
revoke execute on function public.delete_message(bigint) from public, anon;
revoke execute on function public.mark_thread_read(bigint) from public, anon;
revoke execute on function public.extend_loan(bigint) from public, anon;

grant execute on function public.in_thread(bigint) to authenticated;
grant execute on function public.my_threads() to authenticated;
grant execute on function public.send_message(bigint, text) to authenticated;
grant execute on function public.delete_message(bigint) to authenticated;
grant execute on function public.mark_thread_read(bigint) to authenticated;
grant execute on function public.extend_loan(bigint) to authenticated;


-- Is the nightly deletion job scheduled? (Also handy to check later:
-- select public.deletion_job_scheduled(); in the SQL Editor.)
create or replace function public.deletion_job_scheduled()
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_scheduled boolean := false;
begin
  if to_regclass('cron.job') is not null then
    execute $q$select exists (select 1 from cron.job where jobname = 'delete-old-conversations' and active)$q$
      into v_scheduled;
  end if;
  return v_scheduled;
end;
$$;
revoke execute on function public.deletion_job_scheduled() from public, anon, authenticated;


-- Quick check: conversations opened for what's reserved or out right now,
-- and whether the nightly deletion job is scheduled (should say true; if
-- false, turn on Cron in Integrations and run PART 6 again).
select
  (select count(*) from public.message_threads) as conversations_opened,
  public.deletion_job_scheduled() as nightly_deletion_scheduled;
