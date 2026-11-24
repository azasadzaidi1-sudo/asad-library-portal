-- Push notifications (17): devices, what causes a notification, the
-- morning job, and the queue the sending function takes from. (Actually
-- sending needs Supabase's pg_net and the deployed function, so that part
-- is tested in supabase/functions/send-notifications.)
\ir people.sql
set role authenticated;

-- Devices
call tests.sign_in(:'LENA');
select public.save_push_subscription('https://push.example/lena-phone', 'p256dh-lena', 'auth-lena') \g /dev/null
select tests.ok((select count(*) from public.push_subscriptions) = 1, 'Lena turns notifications on for her phone');
select tests.fails($$select public.save_push_subscription('http://push.example/x', 'a', 'b')$$, 'push address',
  'only real push addresses');
call tests.sign_in(:'JONAS');
select tests.ok(not exists (select 1 from public.push_subscriptions), 'Jonas can''t see Lena''s devices');
select public.save_push_subscription('https://push.example/jonas', 'p256dh-jonas', 'auth-jonas') \g /dev/null
select tests.fails('select count(*) from public.notifications', 'permission denied', 'nobody reads the queue in the app');
select tests.fails('select public.claim_notifications()', 'permission denied', '... or takes from it');
select tests.fails($$select public.save_push_setup('k', 's')$$, 'permission denied', 'only Asad saves the keys');
select tests.ok(public.push_public_key() is null, 'until then, the app has no key and doesn''t offer notifications');

-- Messages: the first unread one
call tests.sign_in(:'LENA');
select public.request_book(3, :'JONAS', null) as res \gset
select thread_id as t from public.my_threads() where reservation_id = :res \gset
select public.send_message(:t, 'Hello!') \g /dev/null
select public.send_message(:t, 'Is Sunday OK?') \g /dev/null
reset role;
select tests.ok((select string_agg(title || ' / ' || body, '; ') from public.notifications where member_id = :'JONAS')
                = 'New message about ' || (select title from public.books where id = 3) || ' / From Lena. Open The Common Shelf to read it.',
  'Jonas gets one notification for two unread messages, without their text');
set role authenticated;
call tests.sign_in(:'JONAS');
select public.mark_thread_read(:t) \g /dev/null
call tests.sign_in(:'LENA');
select public.send_message(:t, 'Or Monday?') \g /dev/null
reset role;
select tests.ok((select count(*) from public.notifications where member_id = :'JONAS') = 2,
  'once he''s read them, the next message notifies again');
set role authenticated;
call tests.sign_in(:'JONAS');
select public.send_message(:t, 'Sunday works') \g /dev/null
select id as j3 from public.copies where book_id = 3 and owner_id = :'JONAS' \gset
select public.lend_copy(:j3, :'LENA') as loan \gset
select public.extend_loan(:loan) \g /dev/null
reset role;
select tests.ok((select count(*) from public.notifications where member_id = :'LENA' and title like 'New message about%') = 1
                and (select count(*) from public.notifications where member_id = :'LENA' and title like 'New due date for%') = 1,
  'Lena hears about Jonas''s reply, and always about a new due date');
set role authenticated;

-- Requests and passes
call tests.sign_in(:'SAM');
select public.request_book(3, :'JONAS', null) as sam_res \gset
reset role;
select tests.ok((select body from public.notifications where member_id = :'JONAS' and title like 'New request for%')
                = 'Sam asks to borrow it.',
  'a request from someone without a pass notifies the librarian');
set role authenticated;
call tests.sign_in(:'JONAS');
update public.reservations set status = 'active' where id = :sam_res;
reset role;
select tests.ok(not exists (select 1 from public.notifications where member_id = :'SAM'),
  'Sam hasn''t turned notifications on, so nothing is queued for him');
set role authenticated;
call tests.sign_in(:'SAM');
select public.save_push_subscription('https://push.example/sam', 'p256dh-sam', 'auth-sam') \g /dev/null
update public.reservations set status = 'cancelled' where id = :sam_res;
select public.ask_for_pass(:'JONAS', null) \g /dev/null
call tests.sign_in(:'JONAS');
select public.decide_pass(:'SAM', true) \g /dev/null
reset role;
select tests.ok((select body from public.notifications where member_id = :'JONAS' and title = 'Library pass request')
                = 'Sam asks for your library pass.',
  'a pass request notifies the librarian');
select tests.ok((select body from public.notifications where member_id = :'SAM' and title = 'You have a library pass')
                = 'Jonas gave you a library pass: reserve from that shelf without asking.',
  'and the borrower hears when they''re given one');
set role authenticated;

-- The morning job
reset role;
update public.loans set lent_on = current_date - 35 where id = :loan;   -- 4 weeks + the 2-week extension: due in 7 days
select public.queue_morning_notifications() \g /dev/null
select public.queue_morning_notifications() \g /dev/null
select tests.ok((select count(*) from public.notifications where member_id = :'LENA' and title = 'Due back in a week') = 1,
  'a book due in a week brings one reminder, however often the job runs');
set role authenticated;
call tests.sign_in(:'JONAS');
select id as j10 from public.copies where book_id = 10 and owner_id = :'JONAS' \gset
select public.lend_copy(:j10, :'NOOR') as noor_loan \gset
update public.loans set returned_on = current_date - 1 where id = :noor_loan;
reset role;
select public.queue_morning_notifications() \g /dev/null
select tests.ok((select title from public.notifications where member_id = :'JONAS' and dedupe_key like 'question:%')
                = 'Give Noor a library pass?',
  'the morning after a return, an unanswered pass question reaches the librarian');

-- The queue
select count(*) as waiting from public.notifications n join public.push_subscriptions s using (member_id)
where n.sent_at is null \gset
select tests.ok(:waiting > 0 and jsonb_array_length(public.claim_notifications()) = :waiting,
  'the sending job takes every waiting notification, once per device');
select tests.ok(jsonb_array_length(public.claim_notifications()) = 0, 'and nothing twice');
select tests.ok(public.send_notifications() = 0, 'without the sending function set up, nothing goes out');
set role authenticated;
call tests.sign_in(:'JONAS');
select public.send_test_notification() \g /dev/null
reset role;
update public.notifications set created_at = now() - interval '2 hours' where sent_at is null;
select tests.ok(jsonb_array_length(public.claim_notifications()) = 0,
  'a notification that waited over an hour is dropped, not sent late');
select tests.ok(not exists (select 1 from public.notifications where sent_at is null), '... and leaves the queue');
select tests.ok(public.forget_push_endpoints(array['https://push.example/lena-phone']) = 1,
  'a device the push service says is gone is forgotten');
select tests.ok(not exists (select 1 from public.push_subscriptions where member_id = :'LENA'), '... for good');
select public.save_push_setup('BPublicKey', 'shared-secret') \g /dev/null
set role authenticated;
call tests.sign_in(:'NOOR');
select tests.ok(public.push_public_key() = 'BPublicKey', 'once Asad saves the keys, the app can offer notifications');
select tests.fails('select public.send_test_notification()', 'Turn notifications on first', 'a test needs a device');
call tests.sign_in(:'JONAS');
select public.remove_push_subscription('https://push.example/jonas') \g /dev/null
select tests.ok(not exists (select 1 from public.push_subscriptions), 'turning notifications off deletes the device');
