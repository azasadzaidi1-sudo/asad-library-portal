-- Borrowing across libraries (08, 09, 15): library passes, requests without
-- a pass, Restricted books, one open reservation and one loan per library,
-- lending, the question after a return, stopping.
\ir people.sql
set role authenticated;

-- Jonas shelves two catalogue titles (3 and 10) and restricts 10
call tests.sign_in(:'JONAS');
select public.add_book(title, author, genre, language) from public.books where id in (3, 10) \g /dev/null
insert into public.restricted_titles (owner_id, book_id, reason) values (:'JONAS', 10, 'Signed copy');
select id as j3 from public.copies where book_id = 3 and owner_id = :'JONAS' \gset
select id as j10 from public.copies where book_id = 10 and owner_id = :'JONAS' \gset
select public.describe_shelf('Mostly crime', 'Sundays at the Kiez cafe') \g /dev/null

-- Without a pass, Jonas's Restricted Section isn't there
call tests.sign_in(:'LENA');
select tests.ok(not exists (select 1 from public.restricted_titles where owner_id = :'JONAS'),
  'without a pass, Lena doesn''t see Jonas''s Restricted Section');
select tests.ok(not exists (select 1 from public.copies where owner_id = :'JONAS' and book_id = 10),
  '... or his copy of it');
select tests.ok(not exists (select 1 from public.library_availability() where owner_id = :'JONAS' and book_id = 10),
  '... or its availability');
select tests.ok(exists (select 1 from public.books where id = 10),
  'the title stays in her catalogue, because Asad has an open copy of it');
select tests.ok((select titles || ' + ' || hidden_titles from public.libraries() where owner_id = :'JONAS') = '1 + 1',
  'the Libraries page counts 1 book, plus 1 for pass holders');
select tests.fails(format('select public.request_book(10, %L, null)', :'JONAS'), 'doesn''t have a copy',
  'and she can''t ask for it');
call tests.sign_in(:'ASAD');
select tests.ok(exists (select 1 from public.restricted_titles where owner_id = :'JONAS'),
  'the admin sees every Restricted Section');

-- A request without a pass
call tests.sign_in(:'LENA');
select tests.ok((select first_time from public.libraries() where owner_id = :'JONAS'),
  'Lena has never asked Jonas for anything');
select public.request_book(3, :'JONAS', '  We met at your birthday  ') \g /dev/null
select tests.ok((select status || ', waiting for ' || waiting_for from public.my_open_reservations() where owner_id = :'JONAS')
                = 'pending_approval, waiting for request',
  'without a pass, a request waits for the librarian');
select tests.ok(not (select first_time from public.libraries() where owner_id = :'JONAS'),
  'now she has');
select tests.fails(format('select public.request_book(3, %L, null)', :'JONAS'), 'one_open_reservation_per_member_per_library',
  'only one open reservation per library');
select public.request_book(3, :'ASAD', null) \g /dev/null
select tests.ok((select count(*) from public.my_open_reservations()) = 2,
  'but one in each library is fine');
select tests.fails(format('update public.borrower_approvals set status = %L where borrower_id = %L', 'approved', :'LENA'),
  'permission denied', 'Lena can''t give herself a pass');
select tests.ok((select pickups from public.shelf_descriptions() where owner_id = :'JONAS') is null,
  'a request that''s still waiting doesn''t show Jonas''s pick-ups');

-- The request card
call tests.sign_in(:'JONAS');
select tests.ok((select name || ' | ' || note || ' | invited by ' || invited_by_name || ' | first time: ' || first_time
                 from public.request_cards())
                = 'Lena | We met at your birthday | invited by Jonas | first time: true',
  'Jonas''s card shows who''s asking, their note, who invited them, and that it''s her first request');
select tests.ok((select count(*) from public.members where id = :'LENA') = 0,
  'but he can''t read Lena''s profile (her city stays private)');

-- Jonas approves this request, Asad declines his
update public.reservations set status = 'active' where member_id = :'LENA' and owner_id = :'JONAS';
call tests.sign_in(:'ASAD');
update public.reservations set status = 'declined' where member_id = :'LENA' and owner_id = :'ASAD';
call tests.sign_in(:'LENA');
select tests.ok((select status from public.my_open_reservations() where owner_id = :'JONAS') = 'active',
  'once approved, the request joins the queue');
select tests.ok(exists (select 1 from public.reservations where member_id = :'LENA' and owner_id = :'ASAD' and status = 'declined'),
  'a declined request is marked declined');
select tests.ok((select pickups from public.shelf_descriptions() where owner_id = :'JONAS') = 'Sundays at the Kiez cafe',
  'an approved request shows Jonas''s pick-ups, so Lena knows where to go');
select tests.ok((select my_status from public.libraries() where owner_id = :'JONAS') is null,
  'approving one request gives no pass');

-- Lending
call tests.sign_in(:'ASAD');
select tests.fails(format('select public.lend_copy(%s, %L)', :j3, :'LENA'), 'owner', 'only a copy''s owner can lend it');
call tests.sign_in(:'JONAS');
select tests.ok(public.lend_copy(:j3, :'LENA') is not null, 'Jonas lends his copy to Lena');
select tests.fails(format('select public.lend_copy(%s, %L)', :j10, :'LENA'), 'already has a book from your shelf',
  'one book at a time from each library');
select tests.fails(format('select public.lend_copy(%s, %L)', :j10, :'JONAS'), 'your own book',
  'librarians can''t lend to themselves');
select tests.fails(format('select public.request_book(3, %L, null)', :'JONAS'), 'own shelf',
  'or reserve from their own shelf');
select tests.ok((select status from public.my_borrowers() where borrower_id = :'LENA') = 'borrower',
  'lending gives no pass: Lena is on his Borrowers tab without one');
call tests.sign_in(:'LENA');
select tests.ok((select due_on - lent_on from public.loans where member_id = :'LENA' and returned_on is null) = 28,
  'loans last 4 weeks');
select tests.ok((select status from public.reservations where member_id = :'LENA' and owner_id = :'JONAS' order by id desc limit 1)
                = 'fulfilled',
  'lending closes the reservation');
update public.loans set returned_on = current_date where member_id = :'LENA';
select tests.ok(exists (select 1 from public.loans where member_id = :'LENA' and returned_on is null),
  'borrowers can''t mark their own loan returned');

-- The question after a return
call tests.sign_in(:'JONAS');
update public.loans set returned_on = current_date where member_id = :'LENA' and owner_id = :'JONAS';
select tests.ok((select name from public.pass_questions()) = 'Lena',
  'when Lena''s book comes back, Jonas is asked whether to give her a pass');
call tests.sign_in(:'LENA');
select tests.fails(format('select public.answer_pass_question(%s, true)',
                          (select id from public.loans where member_id = :'LENA' and owner_id = :'JONAS')),
  'isn''t one of yours', 'only the librarian can answer it');
call tests.sign_in(:'JONAS');
select public.answer_pass_question(loan_id, true) from public.pass_questions() \g /dev/null
select tests.ok(not exists (select 1 from public.pass_questions()), 'once answered, the question goes');
select tests.ok((select status from public.my_borrowers() where borrower_id = :'LENA') = 'pass',
  'Lena now holds his pass');

-- With a pass
call tests.sign_in(:'LENA');
select tests.ok((select my_status from public.libraries() where owner_id = :'JONAS') = 'approved',
  'the Libraries page shows Lena has a pass');
select tests.ok((select titles || ' + ' || hidden_titles from public.libraries() where owner_id = :'JONAS') = '2 + 0',
  'and she sees his whole shelf');
select tests.ok(exists (select 1 from public.restricted_titles where owner_id = :'JONAS' and book_id = 10),
  'including his Restricted Section');
select public.request_book(3, :'JONAS', null) \g /dev/null
select tests.ok((select status from public.my_open_reservations() where owner_id = :'JONAS') = 'active',
  'a pass holder''s request goes straight into the queue');
update public.reservations set status = 'cancelled' where member_id = :'LENA' and owner_id = :'JONAS' and status = 'active';
select public.request_book(10, :'JONAS', null) \g /dev/null
select tests.ok((select status || ', waiting for ' || waiting_for from public.my_open_reservations() where owner_id = :'JONAS')
                = 'pending_approval, waiting for restricted',
  'Restricted books still need the librarian''s OK');
call tests.sign_in(:'JONAS');
select tests.ok(not exists (select 1 from public.request_cards() where name = 'Lena'),
  'a pass holder''s Restricted request isn''t a request card');

-- Taking a pass back
select public.take_back_pass(:'LENA') \g /dev/null
select tests.ok((select status from public.my_borrowers() where borrower_id = :'LENA') = 'taken_back',
  'Jonas''s Borrowers tab shows he took Lena''s pass back');
call tests.sign_in(:'LENA');
select tests.ok((select my_status from public.libraries() where owner_id = :'JONAS') = 'taken_back',
  'Lena''s Libraries page says plainly that the pass was taken back');
select tests.ok((select ask_again_on from public.libraries() where owner_id = :'JONAS') is null,
  'with no date to ask again');
select tests.fails(format('select public.ask_for_pass(%L, null)', :'JONAS'), 'taken back',
  'because she can''t ask for it again');
select tests.ok(exists (select 1 from public.copies where owner_id = :'JONAS' and book_id = 10),
  'she still sees the Restricted book she has asked for');
update public.reservations set status = 'cancelled' where member_id = :'LENA' and owner_id = :'JONAS' and status in ('pending_approval', 'active');
select tests.ok(not exists (select 1 from public.copies where owner_id = :'JONAS' and book_id = 10),
  'once she lets the request go, it''s hidden again');
select public.request_book(3, :'JONAS', null) \g /dev/null
select tests.ok((select waiting_for from public.my_open_reservations() where owner_id = :'JONAS') = 'request',
  'and she asks each time again');
update public.reservations set status = 'cancelled' where member_id = :'LENA' and owner_id = :'JONAS' and status in ('pending_approval', 'active');

-- Asking for a pass
call tests.sign_in(:'TOM');
select tests.ok((select titles from public.libraries() where owner_id = :'JONAS') = 1,
  'Tom sees one of Jonas''s two books');
select public.ask_for_pass(:'JONAS', 'Lena''s flatmate') \g /dev/null
select tests.fails(format('select public.ask_for_pass(%L, null)', :'JONAS'), 'already asked', 'one request at a time');
select tests.ok((select my_status from public.libraries() where owner_id = :'JONAS') = 'pending',
  'the Libraries page shows Tom is waiting');
call tests.sign_in(:'JONAS');
select tests.ok((select name || ' | ' || note || ' | borrowed here: ' || loans_from_me from public.pass_requests())
                = 'Tom | Lena''s flatmate | borrowed here: 0',
  'Jonas sees Tom''s pass request, with his note');
select public.decide_pass(:'TOM', false) \g /dev/null
call tests.sign_in(:'TOM');
select tests.ok((select my_status || ', again on ' || ask_again_on from public.libraries() where owner_id = :'JONAS')
                = 'declined, again on ' || (current_date + interval '3 months')::date,
  'after a "Not now", Tom can ask again in 3 months');
select tests.fails(format('select public.ask_for_pass(%L, null)', :'JONAS'), 'ask again from', 'not before');
call tests.sign_in(:'JONAS');
select public.lend_copy(:j3, :'TOM') \g /dev/null
select tests.ok(not exists (select 1 from public.pass_questions()), 'no question about a book still out');
call tests.sign_in(:'TOM');
select tests.ok((select ask_again_on from public.libraries() where owner_id = :'JONAS') is null,
  'borrowing from Jonas since then lifts the wait');
select public.ask_for_pass(:'JONAS', null) \g /dev/null
select public.withdraw_pass_request(:'JONAS') \g /dev/null
select tests.ok((select my_status from public.libraries() where owner_id = :'JONAS') is null,
  'Tom can withdraw his pass request');
call tests.sign_in(:'JONAS');
update public.loans set returned_on = current_date where member_id = :'TOM' and owner_id = :'JONAS';
select tests.ok((select name from public.pass_questions()) = 'Tom', 'Tom''s return brings the question');
select public.answer_pass_question(loan_id, false) from public.pass_questions() \g /dev/null
select tests.ok(not exists (select 1 from public.pass_questions()), '"Not now" dismisses it');
select tests.ok((select status from public.my_borrowers() where borrower_id = :'TOM') = 'borrower',
  'and gives no pass');
call tests.sign_in(:'TOM');
select tests.ok((select ask_again_on from public.libraries() where owner_id = :'JONAS') is null,
  'it doesn''t stop Tom asking for one');

-- Stopping and restarting lending
call tests.sign_in(:'TOM');
select public.request_book(3, :'JONAS', null) \g /dev/null
call tests.sign_in(:'JONAS');
select public.stop_lending(:'TOM') \g /dev/null
call tests.sign_in(:'TOM');
select tests.ok(not exists (select 1 from public.my_open_reservations() where owner_id = :'JONAS'),
  'stopping lending cancels that person''s reservation');
select tests.fails(format('select public.request_book(3, %L, null)', :'JONAS'), 'isn''t lending',
  'and they can''t ask again');
select tests.fails(format('select public.ask_for_pass(%L, null)', :'JONAS'), 'isn''t lending',
  'or ask for a pass');
call tests.sign_in(:'JONAS');
select tests.fails(format('select public.lend_copy(%s, %L)', :j3, :'TOM'), 'stopped lending', 'or be lent a book');
select public.lend_again(:'TOM') \g /dev/null
select tests.ok((select status from public.my_borrowers() where borrower_id = :'TOM') = 'borrower',
  'Jonas can lend to Tom again; he''s back to asking each time');
select tests.fails(format('select public.give_pass(%L)', :'SAM'), 'hasn''t borrowed',
  'a pass is only for someone who knows the shelf');

-- Giving a pass from the Borrowers tab
select public.give_pass(:'LENA') \g /dev/null
select tests.ok((select string_agg(name || ': ' || status, ', ' order by name) from public.my_borrowers())
                = 'Lena: pass, Tom: borrower',
  'Jonas''s Borrowers tab: Lena with a pass again, Tom without');

-- A shelf that's all Restricted
call tests.sign_in(:'JONAS');
insert into public.restricted_titles (owner_id, book_id, reason) values (:'JONAS', 3, 'Signed copy');
call tests.sign_in(:'TOM');
select tests.ok((select titles || ' + ' || hidden_titles from public.libraries() where owner_id = :'JONAS') = '0 + 2',
  'with everything Restricted, Tom sees 0 books, plus 2 for pass holders');
select tests.ok(public.request_book(3, :'ASAD', null) is not null and not exists (
                  select 1 from public.copies where owner_id = :'JONAS'),
  'none of Jonas''s copies show for him');
update public.reservations set status = 'cancelled' where member_id = :'TOM' and owner_id = :'ASAD' and status in ('pending_approval', 'active');
select public.ask_for_pass(:'JONAS', null) \g /dev/null
select tests.ok((select my_status from public.libraries() where owner_id = :'JONAS') = 'pending',
  'but he can still ask for a pass');
call tests.sign_in(:'JONAS');
select public.decide_pass(:'TOM', true) \g /dev/null
call tests.sign_in(:'TOM');
select tests.ok((select titles from public.libraries() where owner_id = :'JONAS') = 2,
  'with a pass, the whole shelf appears');
call tests.sign_in(:'JONAS');
delete from public.restricted_titles where owner_id = :'JONAS' and book_id = 3;
select public.take_back_pass(:'TOM') \g /dev/null
select id as j3 from public.copies where book_id = 3 and owner_id = :'JONAS' \gset
select public.lend_copy(:j3, :'TOM') \g /dev/null
update public.loans set returned_on = current_date where member_id = :'TOM' and owner_id = :'JONAS' and returned_on is null;
select tests.ok(not exists (select 1 from public.pass_questions() where name = 'Tom'),
  'after taking a pass back, Jonas isn''t asked about giving one when Tom''s next book comes back');
