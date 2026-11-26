-- Book club meet-ups (18): only Asad posts, members see a count and say
-- they're coming, notifications, the week after, and deleting names.
\ir people.sql

-- 19:00 in Berlin, so many days from today, as the app would send it.
create function tests.at_day(p_days int) returns timestamptz
language sql stable
as $$ select ((public.berlin_day(now()) + p_days) + time '19:00') at time zone 'Europe/Berlin'; $$;
grant execute on function tests.at_day(int) to authenticated;

set role authenticated;

-- Only Asad posts, and nobody reads the tables directly
call tests.sign_in(:'MIRA');
select tests.fails($$select public.post_meetup(now() + interval '3 days', 'Café Pförtner', null)$$, 'Only the admin',
  'only the admin posts a meet-up');
select tests.ok((select meetup_id from public.meetup_card()) is null, 'no meet-up yet: the card is empty');
select tests.fails('select * from public.meetups', 'permission denied', 'members can''t read the meet-ups directly');
select tests.fails('select * from public.meetup_rsvps', 'permission denied', '... or who''s coming');
select tests.fails('select * from public.meetups_for_admin()', 'Only the admin', '... or ask for the names');

-- Posting, and the announcement
call tests.sign_in(:'NOOR');
select public.save_push_subscription('https://push.example/noor', 'p256dh-noor', 'auth-noor') \g /dev/null
call tests.sign_in(:'ASAD');
select public.save_push_subscription('https://push.example/asad', 'p256dh-asad', 'auth-asad') \g /dev/null
select tests.fails($$select public.post_meetup(now() - interval '1 hour', 'Café Pförtner', null)$$, 'in the future',
  'a meet-up can''t be in the past');
select tests.fails($$select public.post_meetup(now() + interval '3 days', '   ', null)$$, 'Say where it is',
  'it needs a place');
select tests.fails($$select public.post_meetup(now() + interval '3 days', 'Café', repeat('x', 301))$$, 'under 300',
  'the note stays short');
select public.post_meetup(tests.at_day(10), '  Café Pförtner, Uferstraße 8 ', '') as m1 \gset
select tests.fails($$select public.post_meetup(now() + interval '20 days', 'Somewhere else', null)$$,
  'already a meet-up coming up', 'one meet-up at a time');
reset role;
select tests.ok((select place = 'Café Pförtner, Uferstraße 8' and note is null from public.meetups where id = :m1),
  'the place is tidied and an empty note is no note');
select tests.ok((select title || ' / ' || body from public.notifications
                 where member_id = :'NOOR' and title like 'Book club meet-up on%')
                = 'Book club meet-up on ' || to_char(public.berlin_day(now()) + 10, 'Dy FMDD Mon')
                  || ' / 19:00 at Café Pförtner, Uferstraße 8. Bring the book you can''t put down and tell everyone why it''s got you hooked.',
  'everyone with notifications on hears about it');
select tests.ok(not exists (select 1 from public.notifications where member_id = :'ASAD' and title like 'Book club%'),
  '... apart from Asad, who posted it');
set role authenticated;

-- Count me in
call tests.sign_in(:'NOOR');
select tests.ok((select place = 'Café Pförtner, Uferstraße 8' and coming = 0 and not i_am_coming
                 from public.meetup_card()),
  'Noor sees the meet-up, with nobody coming yet');
select public.count_me_in(:m1) \g /dev/null
select public.count_me_in(:m1) \g /dev/null
select tests.ok((select coming = 1 and i_am_coming from public.meetup_card()), 'Noor counts herself in, once');
call tests.sign_in(:'SAM');
select public.count_me_in(:m1) \g /dev/null
call tests.sign_in(:'MIRA');
select tests.ok((select coming = 2 and not i_am_coming from public.meetup_card()),
  'Mira sees that two are coming, not who');
call tests.sign_in(:'ASAD');
select tests.ok((select names = array['Noor', 'Sam'] and coming = 2 from public.meetups_for_admin() where id = :m1),
  'Asad sees who, in the order they said it');
call tests.sign_in(:'NOOR');
select public.cant_make_it(:m1) \g /dev/null
select tests.ok((select coming = 1 and not i_am_coming from public.meetup_card()), 'Noor can''t make it after all');
select public.count_me_in(:m1) \g /dev/null

-- Changing it
call tests.sign_in(:'MIRA');
select tests.fails(format('select public.edit_meetup(%s, now() + interval ''5 days'', ''x'', null)', :m1),
  'Only the admin', 'only Asad changes it');
call tests.sign_in(:'ASAD');
select public.edit_meetup(:m1, tests.at_day(11), 'Café Pförtner, Uferstraße 8', null) \g /dev/null
select public.edit_meetup(:m1, tests.at_day(11), 'Café Pförtner, Uferstraße 8', 'Big table at the back') \g /dev/null
reset role;
select tests.ok((select string_agg(body, '; ') from public.notifications
                 where member_id = :'NOOR' and title = 'Book club meet-up changed')
                = 'Now ' || to_char(public.berlin_day(now()) + 11, 'Dy FMDD Mon') || ', 19:00 at Café Pförtner, Uferstraße 8.',
  'a new date reaches those coming; a new note alone doesn''t');
select tests.ok(not exists (select 1 from public.notifications where member_id = :'MIRA' and title = 'Book club meet-up changed'),
  '... and nobody else');

-- The morning before
update public.meetups set starts_at = tests.at_day(1) where id = :m1;
select public.meetup_morning() \g /dev/null
select public.meetup_morning() \g /dev/null
select tests.ok((select count(*) from public.notifications
                 where member_id in (:'NOOR', :'SAM') and title = 'Book club meet-up tomorrow') = 2,
  'the morning before, each person coming gets one reminder, however often the job runs');

-- The week after
update public.meetups set starts_at = tests.at_day(-2) where id = :m1;
set role authenticated;
call tests.sign_in(:'NOOR');
select tests.ok((select meetup_id is null and nudge_meetup_id = :m1 from public.meetup_card()),
  'after the meet-up the card goes, and Noor is asked to shelve the book she presented');
select tests.fails(format('select public.count_me_in(%s)', :m1), 'is over', 'nobody counts themselves in afterwards');
call tests.sign_in(:'MIRA');
select tests.ok((select nudge_meetup_id is null from public.meetup_card()), 'Mira didn''t say she''d come: no nudge');
call tests.sign_in(:'ASAD');
select tests.fails(format('select public.edit_meetup(%s, now() + interval ''5 days'', ''x'', null)', :m1),
  'already started', 'a past meet-up can''t be changed');
call tests.sign_in(:'NOOR');
select public.hide_meetup_nudge(:m1) \g /dev/null
select tests.ok((select nudge_meetup_id is null from public.meetup_card()), 'Noor closes the nudge');
reset role;
insert into public.copies (book_id, owner_id) values (3, :'SAM');
set role authenticated;
call tests.sign_in(:'SAM');
select tests.ok((select nudge_meetup_id is null from public.meetup_card()),
  'Sam added a book since the meet-up, so the nudge goes by itself');

-- The next one, posted on a meet-up evening
call tests.sign_in(:'ASAD');
select public.post_meetup(tests.at_day(5), 'Shakespeare and Sons', null) as m2 \gset
reset role;
update public.meetups set starts_at = public.berlin_day(now())::timestamp at time zone 'Europe/Berlin' where id = :m2;
set role authenticated;
call tests.sign_in(:'LENA');
select tests.ok((select meetup_id = :m2 from public.meetup_card()), 'on the day, the card stays until midnight');
select public.count_me_in(:m2) \g /dev/null
select tests.ok((select i_am_coming from public.meetup_card()), '... and Lena can still decide to drop by');
call tests.sign_in(:'ASAD');
select public.post_meetup(tests.at_day(30), 'The Curious Fox', null) as m3 \gset
call tests.sign_in(:'LENA');
select tests.ok((select meetup_id = :m3 and coming = 0 from public.meetup_card()),
  'once that one has started, the next can be posted, and takes over the card');

-- Cancelling
call tests.sign_in(:'NOOR');
select public.count_me_in(:m3) \g /dev/null
call tests.sign_in(:'ASAD');
select public.cancel_meetup(:m3) \g /dev/null
select tests.ok(not exists (select 1 from public.meetups_for_admin() where id = :m3), 'Asad cancels it');
select tests.fails(format('select public.cancel_meetup(%s)', :m3), 'isn''t on any more', 'once');
call tests.sign_in(:'NOOR');
select tests.ok((select meetup_id = :m2 from public.meetup_card()), 'the card goes back to today''s');
select tests.fails(format('select public.count_me_in(%s)', :m3), 'isn''t on any more', 'nobody joins a cancelled one');
reset role;
select tests.ok((select body from public.notifications where member_id = :'NOOR' and title = 'Book club meet-up cancelled')
                = to_char(public.berlin_day(now()) + 30, 'Dy FMDD Mon') || ', 19:00 at The Curious Fox is off. The next one will show up in the app.',
  'those coming are told it''s off');
select tests.ok(not exists (select 1 from public.meetup_rsvps where meetup_id = :m3), '... and their names go straight away');

-- A week after, the names go and the number stays
update public.meetups set starts_at = tests.at_day(-7) where id = :m1;
select public.meetup_morning() \g /dev/null
select tests.ok(not exists (select 1 from public.meetup_rsvps where meetup_id = :m1),
  'a week after the meet-up, the names are deleted');
select tests.ok(exists (select 1 from public.meetup_rsvps where meetup_id = :m2), '... not before');
set role authenticated;
call tests.sign_in(:'ASAD');
select tests.ok((select coming = 2 and names is null from public.meetups_for_admin() where id = :m1),
  'Asad still sees how many came');
