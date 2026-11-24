-- =====================================================================
-- The Common Shelf: book club meet-ups
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Needs 01-17 to have run first, and Cron on (it is, since 16).
-- =====================================================================
--
-- One meet-up at a time, posted by Asad (the admin) from his Account page.
-- Everyone brings the book they can't put down and tells the others about
-- it, so there's no set book.
--
--   * Members see a card at the top of the Catalogue while a meet-up is
--     coming up (until the end of its day): date, time, place, Asad's note,
--     how many are coming, and "Count me in". Only Asad sees who.
--   * Posting it pushes an announcement to everyone with notifications on;
--     the morning before, those coming get a reminder. If Asad moves or
--     cancels it, those coming are told.
--   * For a week afterwards, people who said they'd come see "Presented a
--     book? Add it to your shelf", so others can borrow it.
--   * A week after the meet-up, the names are deleted and only the number
--     who said they'd come is kept (every morning, by a scheduled job).
--
--   PART 1  Tables
--   PART 2  Small helpers: dates in Berlin, checking what Asad typed
--   PART 3  Asad: post, edit, cancel, and see who's coming
--   PART 4  Members: the card, "Count me in", "Can't make it after all"
--   PART 5  The morning job: reminders, and deleting names after a week
--   PART 6  Scheduling
--   PART 7  Who may call what


-- ---------------------------------------------------------------------
-- PART 1: tables
-- ---------------------------------------------------------------------

create table public.meetups (
  id                bigint generated always as identity primary key,
  starts_at         timestamptz not null,
  place             text not null,
  note              text,
  created_at        timestamptz not null default now(),
  cancelled_at      timestamptz,
  headcount         int,           -- how many said they'd come, kept once the names are deleted
  names_deleted_at  timestamptz
);

-- One row per member who tapped "Count me in". nudge_hidden: they closed
-- "Presented a book?" after the meet-up.
create table public.meetup_rsvps (
  meetup_id     bigint not null references public.meetups (id) on delete cascade,
  member_id     uuid not null references public.members (id) on delete cascade,
  created_at    timestamptz not null default now(),
  nudge_hidden  boolean not null default false,
  primary key (meetup_id, member_id)
);

create index meetup_rsvps_by_member on public.meetup_rsvps (member_id);

-- Nobody reads these tables directly: members get the card from
-- meetup_card() (a count, never names), Asad gets names from
-- meetups_for_admin().
alter table public.meetups enable row level security;
alter table public.meetup_rsvps enable row level security;


-- ---------------------------------------------------------------------
-- PART 2: small helpers
-- ---------------------------------------------------------------------

-- The day something happens, in Berlin (the database itself runs on UTC).
create or replace function public.berlin_day(p_at timestamptz)
returns date
language sql stable set search_path = ''
as $$ select (p_at at time zone 'Europe/Berlin')::date; $$;

-- "Thu 11 Dec, 19:00", for notifications.
create or replace function public.meetup_when(p_at timestamptz)
returns text
language sql stable set search_path = ''
as $$ select to_char(p_at at time zone 'Europe/Berlin', 'Dy FMDD Mon, HH24:MI'); $$;

-- Tidies and checks what Asad typed; returns the place and note to save.
create or replace function public.check_meetup(p_starts_at timestamptz, p_place text, p_note text,
  out place text, out note text)
language plpgsql stable set search_path = ''
as $$
begin
  place := nullif(trim(coalesce(p_place, '')), '');
  note := nullif(trim(coalesce(p_note, '')), '');
  if p_starts_at is null then
    raise exception 'Pick a date and time.';
  end if;
  if place is null then
    raise exception 'Say where it is.';
  end if;
  if length(place) > 150 then
    raise exception 'Keep the place under 150 characters.';
  end if;
  if length(note) > 300 then
    raise exception 'Keep the note under 300 characters.';
  end if;
end;
$$;

-- Queue the same notification for everyone who said they're coming.
create or replace function public.notify_meetup_guests(p_meetup_id bigint, p_title text, p_body text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_member uuid;
begin
  for v_member in select r.member_id from public.meetup_rsvps r where r.meetup_id = p_meetup_id loop
    perform public.notify(v_member, p_title, p_body, '#catalogue', 'meetup-' || p_meetup_id);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 3: Asad: post, edit, cancel, and see who's coming
-- ---------------------------------------------------------------------

-- Post the next meet-up, and announce it. Only one can be coming up at a
-- time; the next one can be posted as soon as the current one has started
-- (say, at the end of the evening).
create or replace function public.post_meetup(p_starts_at timestamptz, p_place text, p_note text)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_text   record;
  v_id     bigint;
  v_member uuid;
begin
  if not public.is_admin() then
    raise exception 'Only the admin can post a meet-up.';
  end if;
  select * into v_text from public.check_meetup(p_starts_at, p_place, p_note);
  if p_starts_at <= now() then
    raise exception 'Pick a date and time in the future.';
  end if;
  if exists (select 1 from public.meetups m where m.cancelled_at is null and m.starts_at > now()) then
    raise exception 'There''s already a meet-up coming up. Edit or cancel that one first.';
  end if;

  insert into public.meetups (starts_at, place, note)
  values (p_starts_at, v_text.place, v_text.note)
  returning id into v_id;

  -- The announcement, to every member with notifications on (not Asad).
  for v_member in select m.id from public.members m where m.id <> (select auth.uid()) loop
    perform public.notify(v_member, 'Book club meet-up on ' || to_char(p_starts_at at time zone 'Europe/Berlin', 'Dy FMDD Mon'),
      to_char(p_starts_at at time zone 'Europe/Berlin', 'HH24:MI') || ' at ' || v_text.place ||
        '. Bring the book you can''t put down and tell everyone why it''s got you hooked.',
      '#catalogue', 'meetup-' || v_id);
  end loop;
  return v_id;
end;
$$;

-- Change the details before it starts. No second announcement; if the date,
-- time or place changed, those coming are told.
create or replace function public.edit_meetup(p_id bigint, p_starts_at timestamptz, p_place text, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old  public.meetups;
  v_text record;
begin
  if not public.is_admin() then
    raise exception 'Only the admin can change a meet-up.';
  end if;
  select * into v_old from public.meetups where id = p_id for update;
  if v_old.id is null or v_old.cancelled_at is not null then
    raise exception 'That meet-up isn''t on any more.';
  end if;
  if v_old.starts_at <= now() then
    raise exception 'That meet-up has already started.';
  end if;
  select * into v_text from public.check_meetup(p_starts_at, p_place, p_note);
  if p_starts_at <= now() then
    raise exception 'Pick a date and time in the future.';
  end if;

  update public.meetups set starts_at = p_starts_at, place = v_text.place, note = v_text.note where id = p_id;

  if p_starts_at <> v_old.starts_at or v_text.place <> v_old.place then
    perform public.notify_meetup_guests(p_id, 'Book club meet-up changed',
      'Now ' || public.meetup_when(p_starts_at) || ' at ' || v_text.place || '.');
  end if;
end;
$$;

-- Call it off before it starts. Those coming are told, and their names go
-- straight away (nothing to count).
create or replace function public.cancel_meetup(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.meetups;
begin
  if not public.is_admin() then
    raise exception 'Only the admin can cancel a meet-up.';
  end if;
  select * into v_old from public.meetups where id = p_id for update;
  if v_old.id is null or v_old.cancelled_at is not null then
    raise exception 'That meet-up isn''t on any more.';
  end if;
  if v_old.starts_at <= now() then
    raise exception 'That meet-up has already started.';
  end if;

  perform public.notify_meetup_guests(p_id, 'Book club meet-up cancelled',
    public.meetup_when(v_old.starts_at) || ' at ' || v_old.place || ' is off. The next one will show up in the app.');
  update public.meetups set cancelled_at = now(), names_deleted_at = now() where id = p_id;
  delete from public.meetup_rsvps where meetup_id = p_id;
end;
$$;

-- For Asad's Account page: the last ten meet-ups that weren't cancelled,
-- newest first, with how many said they'd come and (until the names are
-- deleted) who, in the order they said it.
create or replace function public.meetups_for_admin()
returns table (id bigint, starts_at timestamptz, place text, note text, coming int, names text[])
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the admin can see this.';
  end if;
  return query
    select m.id, m.starts_at, m.place, m.note,
           coalesce(m.headcount, (select count(*) from public.meetup_rsvps r where r.meetup_id = m.id))::int,
           case when m.names_deleted_at is null then
             array(select coalesce(p.name, 'A new member') from public.meetup_rsvps r
                   join public.members p on p.id = r.member_id
                   where r.meetup_id = m.id order by r.created_at)
           end
    from public.meetups m
    where m.cancelled_at is null
    order by m.starts_at desc
    limit 10;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 4: members: the card, "Count me in", "Can't make it after all"
-- ---------------------------------------------------------------------

-- What the top of the Catalogue shows the signed-in member. Always one row:
--   * the meet-up coming up (or happening today), if there is one, with how
--     many are coming and whether you are; otherwise those columns are null
--   * nudge_meetup_id: a meet-up you said you'd come to, in the past week,
--     if you haven't closed "Presented a book?" or added a book since
create or replace function public.meetup_card()
returns table (meetup_id bigint, starts_at timestamptz, place text, note text, coming int,
               i_am_coming boolean, nudge_meetup_id bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_me    uuid := (select auth.uid());
  v_today date := public.berlin_day(now());
  v_next  public.meetups;
begin
  if v_me is null then
    return;
  end if;

  -- The latest one whose day isn't over: on a meet-up evening, a next one
  -- that's already posted takes over the card.
  select * into v_next from public.meetups m
  where m.cancelled_at is null and public.berlin_day(m.starts_at) >= v_today
  order by m.starts_at desc
  limit 1;

  meetup_id := v_next.id;
  starts_at := v_next.starts_at;
  place := v_next.place;
  note := v_next.note;
  if v_next.id is not null then
    coming := (select count(*) from public.meetup_rsvps r where r.meetup_id = v_next.id);
    i_am_coming := exists (select 1 from public.meetup_rsvps r where r.meetup_id = v_next.id and r.member_id = v_me);
  end if;

  select m.id into nudge_meetup_id
  from public.meetups m
  join public.meetup_rsvps r on r.meetup_id = m.id and r.member_id = v_me
  where m.cancelled_at is null
    and public.berlin_day(m.starts_at) < v_today
    and public.berlin_day(m.starts_at) > v_today - 7
    and not r.nudge_hidden
    and not exists (select 1 from public.copies c where c.owner_id = v_me and c.created_at > m.starts_at)
  order by m.starts_at desc
  limit 1;

  return next;
end;
$$;

-- Open until the end of the meet-up's day (someone might decide to drop by).
create or replace function public.open_meetup(p_id bigint)
returns public.meetups
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_meetup public.meetups;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.';
  end if;
  select * into v_meetup from public.meetups where id = p_id;
  if v_meetup.id is null or v_meetup.cancelled_at is not null then
    raise exception 'That meet-up isn''t on any more.';
  end if;
  if public.berlin_day(v_meetup.starts_at) < public.berlin_day(now()) then
    raise exception 'That meet-up is over.';
  end if;
  return v_meetup;
end;
$$;

create or replace function public.count_me_in(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.open_meetup(p_id);
  insert into public.meetup_rsvps (meetup_id, member_id)
  values (p_id, (select auth.uid()))
  on conflict do nothing;
end;
$$;

create or replace function public.cant_make_it(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.open_meetup(p_id);
  delete from public.meetup_rsvps where meetup_id = p_id and member_id = (select auth.uid());
end;
$$;

-- Closing "Presented a book? Add it to your shelf".
create or replace function public.hide_meetup_nudge(p_id bigint)
returns void
language sql security definer set search_path = ''
as $$
  update public.meetup_rsvps set nudge_hidden = true
  where meetup_id = p_id and member_id = (select auth.uid());
$$;


-- ---------------------------------------------------------------------
-- PART 5: the morning job
-- ---------------------------------------------------------------------

-- Every morning: a reminder to everyone coming to tomorrow's meet-up, and,
-- a week after each meet-up, the names are deleted and only the number
-- who said they'd come is kept. Returns how many reminders were queued.
create or replace function public.meetup_morning()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := public.berlin_day(now());
  v_row   record;
  v_count int := 0;
begin
  for v_row in
    select m.id, m.starts_at, m.place, r.member_id
    from public.meetups m
    join public.meetup_rsvps r on r.meetup_id = m.id
    where m.cancelled_at is null and public.berlin_day(m.starts_at) = v_today + 1
  loop
    perform public.notify(v_row.member_id, 'Book club meet-up tomorrow',
      to_char(v_row.starts_at at time zone 'Europe/Berlin', 'HH24:MI') || ' at ' || v_row.place ||
        '. Don''t forget the book you can''t put down.',
      '#catalogue', 'meetup-' || v_row.id,
      'meetup-reminder:' || v_row.id || ':' || v_row.member_id || ':' || public.berlin_day(v_row.starts_at));
    v_count := v_count + 1;
  end loop;

  update public.meetups m
  set headcount = (select count(*) from public.meetup_rsvps r where r.meetup_id = m.id),
      names_deleted_at = now()
  where m.names_deleted_at is null and public.berlin_day(m.starts_at) <= v_today - 7;
  delete from public.meetup_rsvps r
  using public.meetups m
  where m.id = r.meetup_id and m.names_deleted_at is not null;

  return v_count;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 6: scheduling
-- ---------------------------------------------------------------------

-- 08:11 UTC: 09:11 in Berlin in winter, 10:11 in summer (just after the
-- other morning notifications).
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('meetup-morning', '11 8 * * *', 'select public.meetup_morning()');
  else
    raise notice 'Cron isn''t on here, so meet-up reminders aren''t scheduled.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 7: who may call what
-- ---------------------------------------------------------------------

revoke execute on function public.check_meetup(timestamptz, text, text) from public, anon, authenticated;
revoke execute on function public.notify_meetup_guests(bigint, text, text) from public, anon, authenticated;
revoke execute on function public.open_meetup(bigint) from public, anon, authenticated;
revoke execute on function public.meetup_morning() from public, anon, authenticated;
revoke execute on function public.post_meetup(timestamptz, text, text) from public, anon;
revoke execute on function public.edit_meetup(bigint, timestamptz, text, text) from public, anon;
revoke execute on function public.cancel_meetup(bigint) from public, anon;
revoke execute on function public.meetups_for_admin() from public, anon;
revoke execute on function public.meetup_card() from public, anon;
revoke execute on function public.count_me_in(bigint) from public, anon;
revoke execute on function public.cant_make_it(bigint) from public, anon;
revoke execute on function public.hide_meetup_nudge(bigint) from public, anon;

-- (The admin functions check is_admin() themselves.)
grant execute on function public.post_meetup(timestamptz, text, text) to authenticated;
grant execute on function public.edit_meetup(bigint, timestamptz, text, text) to authenticated;
grant execute on function public.cancel_meetup(bigint) to authenticated;
grant execute on function public.meetups_for_admin() to authenticated;
grant execute on function public.meetup_card() to authenticated;
grant execute on function public.count_me_in(bigint) to authenticated;
grant execute on function public.cant_make_it(bigint) to authenticated;
grant execute on function public.hide_meetup_nudge(bigint) to authenticated;


-- Quick check: is the morning job scheduled? (Should say true.)
create or replace function public.meetup_job_scheduled()
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_scheduled boolean := false;
begin
  if to_regclass('cron.job') is not null then
    execute $q$select exists (select 1 from cron.job where jobname = 'meetup-morning' and active)$q$
      into v_scheduled;
  end if;
  return v_scheduled;
end;
$$;
revoke execute on function public.meetup_job_scheduled() from public, anon, authenticated;

select public.meetup_job_scheduled() as meetup_job_scheduled;
