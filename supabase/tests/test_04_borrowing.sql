-- Borrowing across libraries (08, 09): first-time approvals, Restricted
-- books, one open reservation and one loan per library, lending, stopping.
\ir people.sql
set role authenticated;

-- Jonas shelves two catalogue titles (3 and 10) and restricts 10
call tests.sign_in(:'JONAS');
select public.add_book(title, author, genre, language) from public.books where id in (3, 10) \g /dev/null
insert into public.restricted_titles (owner_id, book_id, reason) values (:'JONAS', 10, 'Signed copy');
select id as j3 from public.copies where book_id = 3 and owner_id = :'JONAS' \gset
select id as j10 from public.copies where book_id = 10 and owner_id = :'JONAS' \gset

-- A first request
call tests.sign_in(:'LENA');
select public.request_book(3, :'JONAS', '  We met at your birthday  ') \g /dev/null
select tests.ok((select status || ', waiting for ' || waiting_for from public.my_open_reservations() where owner_id = :'JONAS')
                = 'pending_approval, waiting for borrower',
  'a first request to a librarian waits for their approval');
select tests.fails(format('select public.request_book(10, %L, null)', :'JONAS'), 'one_open_reservation_per_member_per_library',
  'only one open reservation per library');
select public.request_book(3, :'ASAD', null) \g /dev/null
select tests.ok((select count(*) from public.my_open_reservations()) = 2,
  'but one in each library is fine');
select tests.fails(format('update public.borrower_approvals set status = %L where borrower_id = %L', 'approved', :'LENA'),
  'permission denied', 'Lena can''t approve herself');

-- The request card
call tests.sign_in(:'JONAS');
select tests.ok((select name || ' | ' || note || ' | invited by ' || invited_by_name from public.borrower_requests())
                = 'Lena | We met at your birthday | invited by Jonas',
  'Jonas''s card shows who''s asking, their note and who invited them');
select tests.ok((select count(*) from public.members where id = :'LENA') = 0,
  'but he can''t read Lena''s profile (her city stays private)');

-- Jonas approves, Asad declines
select public.decide_borrower(:'LENA', true) \g /dev/null
call tests.sign_in(:'ASAD');
select public.decide_borrower(:'LENA', false) \g /dev/null
call tests.sign_in(:'LENA');
select tests.ok((select status from public.my_open_reservations() where owner_id = :'JONAS') = 'active',
  'once approved, the reservation joins the queue');
select tests.ok(exists (select 1 from public.reservations where member_id = :'LENA' and owner_id = :'ASAD' and status = 'declined'),
  'a declined first request is marked declined');
select tests.ok((select string_agg(name || ': ' || my_status, ', ' order by name) from public.libraries() where name in ('Asad', 'Jonas'))
                = 'Asad: declined, Jonas: approved',
  'the Libraries page shows where Lena stands with each');

-- Restricted books
update public.reservations set status = 'cancelled' where member_id = :'LENA' and owner_id = :'JONAS' and status = 'active';
select public.request_book(10, :'JONAS', null) \g /dev/null
select tests.ok((select status || ', waiting for ' || waiting_for from public.my_open_reservations() where owner_id = :'JONAS')
                = 'pending_approval, waiting for restricted',
  'an approved borrower asking for a Restricted book waits only for the book');
call tests.sign_in(:'TOM');
select public.request_book(10, :'JONAS', null) \g /dev/null
call tests.sign_in(:'JONAS');
select tests.fails(format('update public.reservations set status = %L where member_id = %L', 'active', :'TOM'),
  'borrower first', 'a new borrower''s Restricted request: the person is approved before the book');
select public.decide_borrower(:'TOM', true) \g /dev/null
call tests.sign_in(:'TOM');
select tests.ok((select waiting_for from public.my_open_reservations() where owner_id = :'JONAS') = 'restricted',
  'then the book still needs its own approval');

-- Lending
call tests.sign_in(:'JONAS');
update public.reservations set status = 'active' where member_id = :'LENA' and owner_id = :'JONAS' and status = 'pending_approval';
call tests.sign_in(:'ASAD');
select tests.fails(format('select public.lend_copy(%s, %L)', :j10, :'LENA'), 'owner', 'only a copy''s owner can lend it');
call tests.sign_in(:'JONAS');
select tests.ok(public.lend_copy(:j10, :'LENA') is not null, 'Jonas lends his copy to Lena');
select tests.fails(format('select public.lend_copy(%s, %L)', :j3, :'LENA'), 'already has a book from your shelf',
  'one book at a time from each library');
select tests.fails(format('select public.lend_copy(%s, %L)', :j3, :'JONAS'), 'your own book',
  'librarians can''t lend to themselves');
select tests.fails(format('select public.request_book(3, %L, null)', :'JONAS'), 'own shelf',
  'or reserve from their own shelf');
call tests.sign_in(:'LENA');
select tests.ok((select due_on - lent_on from public.loans where member_id = :'LENA' and returned_on is null) = 28,
  'loans last 4 weeks');
select tests.ok((select status from public.reservations where member_id = :'LENA' and book_id = 10 order by id desc limit 1) = 'fulfilled',
  'lending closes the reservation');
update public.loans set returned_on = current_date where member_id = :'LENA';
select tests.ok(exists (select 1 from public.loans where member_id = :'LENA' and returned_on is null),
  'borrowers can''t mark their own loan returned');

-- Stopping and restarting lending
call tests.sign_in(:'JONAS');
select public.stop_lending(:'TOM') \g /dev/null
call tests.sign_in(:'TOM');
select tests.ok(not exists (select 1 from public.my_open_reservations() where owner_id = :'JONAS'),
  'stopping lending cancels that person''s reservation');
select tests.fails(format('select public.request_book(3, %L, null)', :'JONAS'), 'isn''t lending',
  'and they can''t ask again');
call tests.sign_in(:'JONAS');
select public.decide_borrower(:'TOM', true) \g /dev/null
select tests.ok((select status from public.my_borrowers() where borrower_id = :'TOM') = 'approved',
  'Jonas can lend to Tom again');

-- Withdrawing a first request
call tests.sign_in(:'SAM');
select public.request_book(3, :'JONAS', 'hi') as sam_res \gset
call tests.sign_in(:'JONAS');
select tests.ok(exists (select 1 from public.borrower_requests() where name = 'Sam'), 'Sam''s first request shows on Jonas''s card');
call tests.sign_in(:'SAM');
update public.reservations set status = 'cancelled' where id = :sam_res;
call tests.sign_in(:'JONAS');
select tests.ok(not exists (select 1 from public.borrower_requests() where name = 'Sam'),
  'when Sam withdraws it, the card goes away');
