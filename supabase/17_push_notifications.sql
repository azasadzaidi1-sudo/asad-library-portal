-- =====================================================================
-- The Common Shelf: push notifications
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Needs 01-16 to have run first, and Cron on (it is, since 16).
--
-- After running it, the rest of the setup is in supabase/README.md
-- ("Push notifications"): make the keys, deploy the sending function,
-- save the keys. Until then nothing is sent, and the app doesn't offer
-- notifications yet.
-- =====================================================================
--
-- Members who turn notifications on (per device, in their account) get a
-- short notification for:
--   * a new message in one of their loan conversations (only the first
--     unread one, not one per message), or a new due date
--   * librarians: a new request for one of their books, a request for
--     their library pass, and, the morning after a return, "Give Sara a
--     library pass?" if they haven't answered it yet
--   * borrowers: a request approved, a library pass given, and a book
--     due back in a week (in the morning)
-- A notification never contains a message itself, only something like
-- "New message about The Kite Runner".
--
--   PART 1  Devices
--   PART 2  The queue of notifications waiting to go out
--   PART 3  What causes a notification
--   PART 4  The morning job: due dates and the question after a return
--   PART 5  Sending, every minute
--   PART 6  Settings, and the test notification
--   PART 7  Scheduling
--   PART 8  Who may call what


-- ---------------------------------------------------------------------
-- PART 1: devices
-- ---------------------------------------------------------------------

-- One row per device (browser) that has notifications on. The endpoint is
-- the address the browser maker's push service gave that device; p256dh
-- and auth are the device's keys, so only it can read what's sent.
create table public.push_subscriptions (
  id            bigint generated always as identity primary key,
  member_id     uuid not null references public.members (id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  created_at    timestamptz not null default now(),
  last_sent_at  timestamptz
);

create index push_subscriptions_by_member on public.push_subscriptions (member_id);

alter table public.push_subscriptions enable row level security;
create policy "devices: your own" on public.push_subscriptions
  for select to authenticated using (member_id = (select auth.uid()));
grant select on public.push_subscriptions to authenticated;

-- Turning notifications on for this device (or again, after the browser
-- renewed its address).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.';
  end if;
  if p_endpoint !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'That isn''t a push address this app can use.';
  end if;
  insert into public.push_subscriptions (member_id, endpoint, p256dh, auth)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

-- Turning them off on this device deletes its address (as the privacy
-- notice says).
create or replace function public.remove_push_subscription(p_endpoint text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and member_id = (select auth.uid());
$$;


-- ---------------------------------------------------------------------
-- PART 2: the queue
-- ---------------------------------------------------------------------

-- Notifications waiting to go out, and those sent (kept a week, see
-- PART 4). dedupe_key stops the same reminder going out twice.
create table public.notifications (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references public.members (id) on delete cascade,
  title       text not null,
  body        text not null,
  url         text not null,           -- where tapping it opens, e.g. #messages/42
  tag         text not null,           -- a newer one with the same tag replaces the older
  dedupe_key  text unique,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz              -- also set when it was too old to send
);

create index notifications_waiting on public.notifications (id) where sent_at is null;

-- Nobody reads the queue through the app.
alter table public.notifications enable row level security;

-- Queue a notification, only if the member has notifications on somewhere.
create or replace function public.notify(
  p_member_id uuid,
  p_title     text,
  p_body      text,
  p_url       text,
  p_tag       text,
  p_dedupe    text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_member_id is null
    or not exists (select 1 from public.push_subscriptions s where s.member_id = p_member_id) then
    return;
  end if;
  insert into public.notifications (member_id, title, body, url, tag, dedupe_key)
  values (p_member_id, p_title, p_body, p_url, p_tag, p_dedupe)
  on conflict (dedupe_key) do nothing;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 3: what causes a notification
-- ---------------------------------------------------------------------

-- A new message (or a new due date) in a loan conversation. For messages,
-- only the first unread one: while the other person hasn't read the
-- earlier ones, more messages don't send more notifications. A new due
-- date always goes out.
create or replace function public.notify_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_thread    public.message_threads;
  v_title     text;
  v_to        uuid;
  v_from_name text;
begin
  select * into v_thread from public.message_threads where id = new.thread_id;
  select b.title into v_title from public.books b where b.id = v_thread.book_id;

  if new.kind = 'event' then
    v_to := v_thread.member_id;      -- a new due date is news to the borrower
  elsif new.sender_id = v_thread.owner_id then
    v_to := v_thread.member_id;
  else
    v_to := v_thread.owner_id;
  end if;
  if v_to is null or v_to = new.sender_id then
    return null;
  end if;

  if new.kind = 'text' and exists (
    select 1 from public.messages m
    where m.thread_id = new.thread_id and m.id < new.id and m.deleted_at is null
      and m.sender_id is distinct from v_to
      and m.created_at > coalesce(
        (select r.last_read_at from public.thread_reads r where r.thread_id = new.thread_id and r.member_id = v_to),
        '-infinity')
  ) then
    return null;
  end if;

  if new.kind = 'event' then
    perform public.notify(v_to, 'New due date for ' || v_title, new.body,
      '#messages/' || new.thread_id, 'thread-' || new.thread_id);
  else
    select m.name into v_from_name from public.members m where m.id = new.sender_id;
    perform public.notify(v_to, 'New message about ' || v_title,
      'From ' || coalesce(v_from_name, 'a member') || '. Open The Common Shelf to read it.',
      '#messages/' || new.thread_id, 'thread-' || new.thread_id);
  end if;
  return null;
end;
$$;

create trigger notify_message
  after insert on public.messages
  for each row execute function public.notify_message();

-- Requests: the librarian hears about a new one; the borrower hears when
-- it's approved. (A declined request isn't pushed: it shows on Borrowing
-- lists, in the warm wording.)
create or replace function public.notify_reservation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_title  text;
  v_name   text;
  v_thread bigint;
begin
  select b.title into v_title from public.books b where b.id = new.book_id;

  if tg_op = 'INSERT' and new.status = 'pending_approval' then
    select m.name into v_name from public.members m where m.id = new.member_id;
    perform public.notify(new.owner_id, 'New request for ' || v_title,
      coalesce(v_name, 'A member') ||
        case when public.is_restricted(new.owner_id, new.book_id)
             then ' asks for it from your Restricted Section.'
             else ' asks to borrow it.' end,
      '#desk', 'request-' || new.id);

  elsif tg_op = 'UPDATE' and old.status = 'pending_approval' and new.status = 'active' then
    select m.name into v_name from public.members m where m.id = new.owner_id;
    select t.id into v_thread from public.message_threads t where t.reservation_id = new.id;
    perform public.notify(new.member_id, 'Request approved',
      coalesce(v_name, 'The librarian') || ' said yes to ' || v_title ||
        '. You can arrange the pick-up in your messages.',
      coalesce('#messages/' || v_thread, '#borrowing'), 'request-' || new.id);
  end if;
  return null;
end;
$$;

-- (Named so it runs after 16's reservation_thread, which opens the
-- conversation it links to.)
create trigger reservation_zz_notify
  after insert or update of status on public.reservations
  for each row execute function public.notify_reservation();

-- Library passes: the librarian hears about a request; the borrower hears
-- when they're given one. (A "Not now" or a pass taken back isn't pushed;
-- the Libraries page says so.)
create or replace function public.notify_pass()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    select m.name into v_name from public.members m where m.id = new.borrower_id;
    perform public.notify(new.owner_id, 'Library pass request',
      coalesce(v_name, 'A member') || ' asks for your library pass.',
      '#desk', 'pass-' || new.borrower_id);
  elsif new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    select m.name into v_name from public.members m where m.id = new.owner_id;
    perform public.notify(new.borrower_id, 'You have a library pass',
      coalesce(v_name, 'A librarian') || ' gave you a library pass: reserve from that shelf without asking.',
      '#libraries', 'pass-' || new.owner_id);
  end if;
  return null;
end;
$$;

create trigger notify_pass
  after insert or update of status on public.borrower_approvals
  for each row execute function public.notify_pass();


-- ---------------------------------------------------------------------
-- PART 4: the morning job
-- ---------------------------------------------------------------------

-- Every morning: books due back in a week, and the question after a
-- return that's still waiting from yesterday. Also tidies up: sent
-- notifications older than a week, and Cron's own log older than a week.
create or replace function public.queue_morning_notifications()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_row   record;
  v_count int := 0;
begin
  -- Due back in a week.
  for v_row in
    select l.id, l.member_id, l.due_on, b.title, o.name as owner_name
    from public.loans l
    join public.copies c on c.id = l.copy_id
    join public.books b on b.id = c.book_id
    left join public.members o on o.id = l.owner_id
    where l.returned_on is null and l.due_on = current_date + 7
  loop
    perform public.notify(v_row.member_id, 'Due back in a week',
      v_row.title || ' is due back to ' || coalesce(v_row.owner_name, 'its librarian') || ' on ' ||
        to_char(v_row.due_on, 'FMDD Mon') || '.',
      '#borrowing', 'due-' || v_row.id, 'due:' || v_row.id || ':' || v_row.due_on);
    v_count := v_count + 1;
  end loop;

  -- "Give Sara a library pass?", the morning after a return, if the
  -- question is still waiting (the same rules as pass_questions in 15).
  for v_row in
    select l.id, l.owner_id, m.name, b.title
    from public.loans l
    join public.members m on m.id = l.member_id
    join public.copies c on c.id = l.copy_id
    join public.books b on b.id = c.book_id
    where l.returned_on = current_date - 1
      and l.pass_question_answered_at is null
      and coalesce(public.borrower_status(l.owner_id, l.member_id), 'none')
          not in ('approved', 'pending', 'stopped', 'taken_back')
  loop
    perform public.notify(v_row.owner_id, 'Give ' || v_row.name || ' a library pass?',
      v_row.name || ' brought back ' || v_row.title || '. The question stays on your lending desk this week.',
      '#desk', 'question-' || v_row.id, 'question:' || v_row.id);
    v_count := v_count + 1;
  end loop;

  delete from public.notifications where sent_at < now() - interval '7 days';
  if to_regclass('cron.job_run_details') is not null then
    execute $q$delete from cron.job_run_details where end_time < now() - interval '7 days'$q$;
  end if;
  return v_count;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 5: sending
-- ---------------------------------------------------------------------

-- Each batch handed to the sending function, so its answer can be read
-- later (Supabase's pg_net keeps answers for a few hours).
create table public.push_batches (
  request_id  bigint primary key,
  sent_at     timestamptz not null default now(),
  handled_at  timestamptz
);
alter table public.push_batches enable row level security;

-- Devices the push service says no longer exist: forget them.
create or replace function public.forget_push_endpoints(p_endpoints text[])
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_count int;
begin
  delete from public.push_subscriptions where endpoint = any (p_endpoints);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Take the waiting notifications (up to 200) and mark them sent; returns
-- them as the sending function expects: one entry per device. Ones that
-- waited over an hour (say, before the setup was finished) are dropped.
create or replace function public.claim_notifications()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids     bigint[];
  v_payload jsonb;
begin
  update public.notifications set sent_at = now()
  where sent_at is null and created_at < now() - interval '1 hour';

  with taken as (
    select n.id from public.notifications n
    where n.sent_at is null
    order by n.id
    limit 200
    for update skip locked
  ), marked as (
    update public.notifications n set sent_at = now()
    from taken where n.id = taken.id
    returning n.id
  )
  select array_agg(marked.id) into v_ids from marked;

  select coalesce(jsonb_agg(jsonb_build_object(
           'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
           'title', n.title, 'body', n.body, 'url', n.url, 'tag', n.tag)
         order by n.id), '[]'::jsonb)
    into v_payload
  from public.notifications n
  join public.push_subscriptions s on s.member_id = n.member_id
  where n.id = any (coalesce(v_ids, '{}'));

  update public.push_subscriptions s set last_sent_at = now()
  where s.member_id in (select n.member_id from public.notifications n where n.id = any (coalesce(v_ids, '{}')));
  return v_payload;
end;
$$;

-- Every minute: read the answers to earlier batches (forgetting devices
-- that are gone), then hand the waiting notifications to the sending
-- function. Does nothing until the setup is finished (the function's
-- address and shared secret are saved, PART 6).
create or replace function public.send_notifications()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_url     text := (select s.value from public.app_settings s where s.key = 'notify_url');
  v_secret  text := (select s.value from public.app_settings s where s.key = 'notify_secret');
  v_batch   record;
  v_status  int;
  v_content text;
  v_payload jsonb;
  v_request bigint;
begin
  if v_url is null or v_secret is null or to_regnamespace('net') is null then
    return 0;
  end if;

  for v_batch in select b.request_id, b.sent_at from public.push_batches b where b.handled_at is null loop
    v_status := null;
    v_content := null;
    execute 'select r.status_code, r.content from net._http_response r where r.id = $1'
      into v_status, v_content using v_batch.request_id;
    if v_status = 200 then
      perform public.forget_push_endpoints(
        array(select jsonb_array_elements_text(coalesce(v_content::jsonb -> 'gone', '[]'::jsonb))));
    end if;
    if v_status is not null or v_batch.sent_at < now() - interval '1 hour' then
      update public.push_batches set handled_at = now() where request_id = v_batch.request_id;
    end if;
  end loop;
  delete from public.push_batches where handled_at < now() - interval '1 day';

  if not exists (select 1 from public.notifications n where n.sent_at is null) then
    return 0;
  end if;
  v_payload := public.claim_notifications();
  if jsonb_array_length(v_payload) = 0 then
    return 0;
  end if;

  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 20000)'
    into v_request
    using v_url,
          jsonb_build_object('notifications', v_payload),
          jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret);
  insert into public.push_batches (request_id) values (v_request);
  return jsonb_array_length(v_payload);
end;
$$;


-- ---------------------------------------------------------------------
-- PART 6: settings, and the test notification
-- ---------------------------------------------------------------------

-- Where the sending function lives (this project's address, which is
-- public anyway: it's in src/config.js).
insert into public.app_settings (key, value)
values ('notify_url', 'https://xrtwfagmtrtfoxbvynge.supabase.co/functions/v1/send-notifications')
on conflict (key) do update set value = excluded.value;

-- Saving the keys from push-keys.html: the public key (the app needs it to
-- turn notifications on) and the secret the database and the sending
-- function share. Run by Asad in the SQL Editor; nobody can call it from
-- the app.
create or replace function public.save_push_setup(p_public_key text, p_notify_secret text)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.app_settings (key, value)
  values ('push_public_key', p_public_key), ('notify_secret', p_notify_secret)
  on conflict (key) do update set value = excluded.value;
$$;

-- The app's public push key, for turning notifications on. Null until the
-- setup is finished, and then the app doesn't offer notifications.
create or replace function public.push_public_key()
returns text
language sql stable security definer set search_path = ''
as $$
  select s.value from public.app_settings s where s.key = 'push_public_key';
$$;

-- "Send me a test notification", on the Account page.
create or replace function public.send_test_notification()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.push_subscriptions s where s.member_id = (select auth.uid())) then
    raise exception 'Turn notifications on first.';
  end if;
  perform public.notify((select auth.uid()), 'Notifications are on',
    'This is how The Common Shelf lets you know about messages, requests and due dates.',
    '#account', 'test');
end;
$$;


-- ---------------------------------------------------------------------
-- PART 7: scheduling
-- ---------------------------------------------------------------------

-- pg_net lets the database call the sending function. Supabase has it; the
-- test database doesn't, so both jobs are skipped there.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if to_regnamespace('cron') is not null then
    perform cron.schedule('send-notifications', '* * * * *', 'select public.send_notifications()');
    -- 08:07 UTC: 09:07 in Berlin in winter, 10:07 in summer.
    perform cron.schedule('morning-notifications', '7 8 * * *', 'select public.queue_morning_notifications()');
  else
    raise notice 'Cron isn''t on here, so notifications aren''t scheduled.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 8: who may call what
-- ---------------------------------------------------------------------

revoke execute on function public.notify(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.queue_morning_notifications() from public, anon, authenticated;
revoke execute on function public.forget_push_endpoints(text[]) from public, anon, authenticated;
revoke execute on function public.claim_notifications() from public, anon, authenticated;
revoke execute on function public.send_notifications() from public, anon, authenticated;
revoke execute on function public.save_push_setup(text, text) from public, anon, authenticated;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
revoke execute on function public.remove_push_subscription(text) from public, anon;
revoke execute on function public.push_public_key() from public, anon;
revoke execute on function public.send_test_notification() from public, anon;

grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;
grant execute on function public.push_public_key() to authenticated;
grant execute on function public.send_test_notification() to authenticated;


-- Quick check: both jobs scheduled (should say true), and whether the keys
-- are saved yet (false until you finish the setup in supabase/README.md).
create or replace function public.push_jobs_scheduled()
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_count int := 0;
begin
  if to_regclass('cron.job') is not null then
    execute $q$select count(*) from cron.job
               where jobname in ('send-notifications', 'morning-notifications') and active$q$
      into v_count;
  end if;
  return v_count = 2;
end;
$$;
revoke execute on function public.push_jobs_scheduled() from public, anon, authenticated;

select
  public.push_jobs_scheduled() as notification_jobs_scheduled,
  public.push_public_key() is not null as keys_saved;
