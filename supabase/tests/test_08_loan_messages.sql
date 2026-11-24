-- Loan messages and "Extend by two weeks" (16): when a conversation opens
-- and closes, who can read and write, deleting, and old conversations.
\ir people.sql
set role authenticated;

-- What was out when 16 ran
call tests.sign_in(:'SAM');
select tests.ok(exists (select 1 from public.my_threads() where role = 'borrower' and other_name = 'Asad' and stage = 'lent'),
  'a book out before 16 gets its conversation with the librarian');

-- A pass holder's reservation opens a conversation straight away
call tests.sign_in(:'LENA');
select public.request_book(3, :'JONAS', null) as lena_res \gset
select tests.ok((select stage || ' with ' || other_name from public.my_threads() where reservation_id = :lena_res)
                = 'requested with Jonas',
  'Lena holds Jonas''s pass: her reservation opens a conversation straight away');
select thread_id as t1 from public.my_threads() where reservation_id = :lena_res \gset

-- Without a pass, once the librarian says yes
call tests.sign_in(:'TOM');
select public.request_book(3, :'JONAS', 'Me again') as tom_res \gset
select tests.ok(not exists (select 1 from public.my_threads() where reservation_id = :tom_res),
  'a request still waiting for the librarian has no conversation yet');
call tests.sign_in(:'JONAS');
update public.reservations set status = 'active' where id = :tom_res;
call tests.sign_in(:'TOM');
select tests.ok(exists (select 1 from public.my_threads() where reservation_id = :tom_res),
  'once Jonas says yes, it opens');
select thread_id as t2 from public.my_threads() where reservation_id = :tom_res \gset

-- Only the two people in it
select tests.fails(format('select public.send_message(%s, %L)', :t1, 'hi'), 'isn''t yours',
  'Tom can''t write in Lena''s conversation');
select tests.ok(not exists (select 1 from public.messages where thread_id = :t1)
                and not exists (select 1 from public.message_threads where id = :t1),
  '... or see it');
call tests.sign_in(:'ASAD');
select tests.ok(not exists (select 1 from public.message_threads where id = :t1),
  'not even the admin reads it in the app');

-- Sending
call tests.sign_in(:'LENA');
select public.send_message(:t1, '  When can I pick it up?  ') as m1 \gset
select tests.ok((select body from public.messages where id = :m1) = 'When can I pick it up?', 'messages are tidied');
select tests.fails(format('select public.send_message(%s, %L)', :t1, repeat('x', 1001)), '1,000',
  'up to 1,000 characters');
select tests.fails(format('select public.send_message(%s, %L)', :t1, '   '), 'Write something', 'and not empty');
select tests.fails(format('insert into public.messages (thread_id, body) values (%s, %L)', :t1, 'sneaky'),
  'permission denied', 'nobody writes to the messages table directly');
call tests.sign_in(:'JONAS');
select tests.ok((select unread from public.my_threads() where thread_id = :t1) = 1, 'Jonas has 1 unread message');
select public.mark_thread_read(:t1) \g /dev/null
select tests.ok((select unread from public.my_threads() where thread_id = :t1) = 0, 'reading it clears the count');
select public.send_message(:t1, 'Sunday at the cafe?') \g /dev/null
select tests.ok((select unread from public.my_threads() where thread_id = :t1) = 0,
  'your own messages don''t count as unread');

-- Deleting, but no editing
select tests.fails(format('select public.delete_message(%s)', :m1), 'your own', 'Jonas can''t delete Lena''s message');
call tests.sign_in(:'LENA');
select public.delete_message(:m1) \g /dev/null
select tests.ok((select body is null and deleted_at is not null from public.messages where id = :m1),
  'Lena deletes hers: it keeps its place, without its text');
select tests.fails(format('update public.messages set body = %L where id = %s', 'edited', :m1), 'permission denied',
  'messages can''t be edited');

-- Lending carries on the same conversation
call tests.sign_in(:'JONAS');
select id as j3 from public.copies where book_id = 3 and owner_id = :'JONAS' \gset
select public.lend_copy(:j3, :'LENA') as lena_loan \gset
select tests.ok((select loan_id = :lena_loan and stage = 'lent' from public.my_threads() where thread_id = :t1),
  'lending the book carries on the same conversation');

-- Extend by two weeks
call tests.sign_in(:'LENA');
select tests.fails(format('select public.extend_loan(%s)', :lena_loan), 'isn''t out from your shelf',
  'only the librarian extends a loan');
call tests.sign_in(:'JONAS');
select tests.ok(public.extend_loan(:lena_loan) = current_date + 42, 'Extend by two weeks: now due 6 weeks after lending');
select tests.ok((select unread from public.my_threads() where thread_id = :t1) = 0,
  'the note about it isn''t news to Jonas');
select tests.fails(format('update public.loans set due_on = %L where id = %s', '2099-01-01', :lena_loan), 'permission denied',
  'nobody changes a due date directly');
select tests.fails(format('update public.loans set extended_days = 100 where id = %s', :lena_loan), 'permission denied',
  '... or the extensions');
call tests.sign_in(:'LENA');
select tests.ok((select body from public.messages where thread_id = :t1 and kind = 'event') like 'The due date is now %',
  'the conversation notes the new due date');
select tests.ok((select unread from public.my_threads() where thread_id = :t1) = 2,
  'Lena sees it as unread, with Jonas''s message');

-- Cancelled before any lending: read-only straight away
call tests.sign_in(:'TOM');
update public.reservations set status = 'cancelled' where id = :tom_res;
select tests.ok((select stage from public.my_threads() where thread_id = :t2) = 'closed',
  'Tom cancels: his conversation is read-only straight away');
select tests.fails(format('select public.send_message(%s, %L)', :t2, 'hi'), 'read-only', 'no more messages in it');
select tests.ok((select delete_after - read_only_from from public.message_threads where id = :t2) = interval '1 month',
  'it''s deleted a month later');

-- After the return: one more week
call tests.sign_in(:'JONAS');
update public.loans set returned_on = current_date where id = :lena_loan;
select tests.ok((select stage from public.my_threads() where thread_id = :t1) = 'returned',
  'after the return, the conversation stays open');
select tests.ok((select read_only_from::date from public.my_threads() where thread_id = :t1) = current_date + 7,
  'for one more week');
call tests.sign_in(:'LENA');
select tests.ok(public.send_message(:t1, 'Loved it, thank you!') is not null, 'so the two can talk about the book');

-- A week later (moving the conversation's dates back)
reset role;
update public.message_threads
set read_only_from = now() - interval '1 second', delete_after = now() + interval '1 month'
where id = :t1;
set role authenticated;
call tests.sign_in(:'LENA');
select tests.fails(format('select public.send_message(%s, %L)', :t1, 'hi'), 'read-only',
  'a week after the return, it''s read-only');
select tests.ok(exists (select 1 from public.messages where thread_id = :t1), 'but still there to read');

-- A month after that
reset role;
update public.message_threads set delete_after = now() - interval '1 second' where id = :t1;
set role authenticated;
call tests.sign_in(:'LENA');
select tests.ok(not exists (select 1 from public.my_threads() where thread_id = :t1)
                and not exists (select 1 from public.messages where thread_id = :t1),
  'past its deletion date, nobody sees it');
reset role;
select tests.ok(public.delete_expired_threads() >= 1, 'the nightly job deletes it');
select tests.ok(not exists (select 1 from public.messages where thread_id = :t1), '... with its messages');
set role authenticated;
select tests.fails('select public.delete_expired_threads()', 'permission denied', 'only the nightly job runs it');

-- Lending in person opens a conversation too
call tests.sign_in(:'JONAS');
select public.lend_copy(:j3, :'TOM') as tom_loan \gset
call tests.sign_in(:'TOM');
select tests.ok((select stage from public.my_threads() where loan_id = :tom_loan) = 'lent',
  'lending in person opens a conversation too');
select thread_id as t3 from public.my_threads() where loan_id = :tom_loan \gset
select public.send_message(:t3, 'Thanks for this') \g /dev/null

-- When someone leaves
call tests.sign_in(:'JONAS');
update public.loans set returned_on = current_date where id = :tom_loan;
call tests.sign_in(:'TOM');
select public.delete_my_account() \g /dev/null
call tests.sign_in(:'JONAS');
select tests.ok((select other_id is null and other_name is null from public.my_threads() where thread_id = :t3),
  'when Tom deletes his account, Jonas keeps the conversation, with "Former member"');
select tests.ok((select sender_id is null and body = 'Thanks for this' from public.messages
                 where thread_id = :t3 and kind = 'text'),
  'Tom''s message stays, without his name, until the conversation is deleted');
