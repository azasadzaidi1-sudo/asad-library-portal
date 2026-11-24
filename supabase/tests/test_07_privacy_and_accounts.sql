-- House rules, contact details and deleting an account (14).
\ir people.sql
\set PAUL '00000000-0000-0000-0000-0000000000e5'
\set ROSA '00000000-0000-0000-0000-0000000000e6'
\set NIKO '00000000-0000-0000-0000-0000000000e7'

-- House rules
set role authenticated;
call tests.sign_in(:'ASAD');
select public.create_invite() as niko_code \gset
reset role;
insert into auth.users (id, email, raw_user_meta_data)
values (:'NIKO', 'niko@example.com',
        jsonb_build_object('invite_code', :'niko_code', 'name', 'Niko', 'city', 'Berlin', 'rules_version', 1));
select tests.ok((select rules_version = 1 and rules_accepted_at is not null from public.members where id = :'NIKO'),
  'accepting the house rules on the Join page is recorded, with the version and date');

call tests.join(:'ASAD', :'PAUL', 'Paul', 'Leipzig');
call tests.join(:'ASAD', :'ROSA', 'Rosa', 'Berlin');
select tests.ok((select rules_version is null from public.members where id = :'PAUL'),
  'someone who joined before the house rules has no accepted version yet');
set role authenticated;
call tests.sign_in(:'PAUL');
select public.accept_house_rules(1) \g /dev/null
select tests.ok((select rules_version = 1 and rules_accepted_at is not null from public.members where id = :'PAUL'),
  'accepting them at the next visit records the version and date');
select tests.fails($$update public.members set rules_version = 7$$, 'permission denied',
  'members can''t change that record directly');

-- Contact details for the privacy notice
reset role;
insert into public.app_settings (key, value)
values ('contact_address', 'Teststraße 1, 10115 Berlin'), ('contact_email', 'asad@example.com');
set role authenticated;
call tests.sign_in(:'PAUL');
select tests.ok((select address || ' | ' || email from public.contact_details()) = 'Teststraße 1, 10115 Berlin | asad@example.com',
  'members see the contact details');
select tests.fails($$select * from public.app_settings$$, 'permission denied',
  'but can''t read the settings table itself');
call tests.sign_in(:'ASAD');
select public.create_invite() as open_code \gset
set role anon;
call tests.sign_in(null);
select tests.ok((select count(*) from public.contact_details(:'open_code')) = 1,
  'someone with a valid invitation link sees them on the Join page');
select tests.ok((select count(*) from public.contact_details()) = 0,
  'a signed-out visitor without a link doesn''t');
select tests.ok((select count(*) from public.contact_details(:'niko_code')) = 0,
  'and a used link doesn''t show them either');

-- Setting the scene: Rosa shelves two books and lends one to Paul, who
-- reviews it; they reply to each other; Paul marks the other book
-- Interested and makes an invitation link.
set role authenticated;
call tests.sign_in(:'ROSA');
select public.add_book(title, author, genre, language) from public.books where id in (20, 21) \g /dev/null
select id as r20 from public.copies where book_id = 20 and owner_id = :'ROSA' \gset
select id as r21 from public.copies where book_id = 21 and owner_id = :'ROSA' \gset
call tests.sign_in(:'PAUL');
select public.request_book(20, :'ROSA', 'From the book club') \g /dev/null
call tests.sign_in(:'ROSA');
update public.reservations set status = 'active' where member_id = :'PAUL' and owner_id = :'ROSA';
select public.give_pass(:'PAUL') \g /dev/null
select public.lend_copy(:r20, :'PAUL') \g /dev/null
call tests.sign_in(:'PAUL');
insert into public.reviews (book_id, body) values (20, 'Loved it') returning id as paul_review \gset
insert into public.interests (book_id) values (21);
select public.create_invite() \g /dev/null
call tests.sign_in(:'ROSA');
insert into public.review_replies (review_id, body) values (:paul_review, 'Glad you did') returning id as rosa_reply \gset
call tests.sign_in(:'PAUL');
insert into public.review_replies (review_id, body) values (:paul_review, 'Thanks!') returning id as paul_reply \gset

-- Not while books are out
select tests.ok((select borrowed || '/' || lent from public.deletion_blockers()) = '1/0',
  'Paul can see he still has a book out');
select tests.fails($$select public.delete_my_account()$$, 'Return the books',
  'nobody can delete their account with a borrowed book');
call tests.sign_in(:'ROSA');
select tests.ok((select borrowed || '/' || lent from public.deletion_blockers()) = '0/1',
  'Rosa can see a book of hers is lent out');
select tests.fails($$select public.delete_my_account()$$, 'still lent out',
  'or while one of their books is lent out');
call tests.sign_in(:'ASAD');
select tests.fails($$select public.delete_my_account()$$, 'admin account',
  'the admin account can''t be deleted from the app');
set role anon;
call tests.sign_in(null);
select tests.fails($$select public.delete_my_account()$$, 'permission denied',
  'signed-out visitors can''t call it at all');

-- Paul brings the book back, reserves Rosa's other book, then leaves
set role authenticated;
call tests.sign_in(:'ROSA');
update public.loans set returned_on = current_date where member_id = :'PAUL';
call tests.sign_in(:'PAUL');
select public.request_book(21, :'ROSA', null) \g /dev/null
select public.delete_my_account() \g /dev/null

reset role;
select tests.ok(not exists (select 1 from auth.users where id = :'PAUL'), 'Paul''s sign-in is deleted');
select tests.ok(not exists (select 1 from public.members where id = :'PAUL'), '... and his name and city');
select tests.ok(not exists (select 1 from public.interests where member_id = :'PAUL'), '... his Interested list');
select tests.ok(not exists (select 1 from public.invites where invited_by = :'PAUL'), '... his invitations');
select tests.ok(not exists (select 1 from public.borrower_approvals where borrower_id = :'PAUL'), '... and his library passes');
select tests.ok(not exists (select 1 from public.reservations where book_id = 20 and note is not null),
  '... and his notes on requests');
select tests.ok((select count(*) from public.loans where copy_id = :r20 and member_id is null and returned_on is not null) = 1,
  'his past loan stays, without his name');
select tests.ok((select status from public.reservations where book_id = 21 and owner_id = :'ROSA' and member_id is null) = 'cancelled',
  'his open reservation is cancelled and keeps no name');
select tests.ok((select member_id is null and edited_at is null from public.reviews where id = :paul_review),
  'his review stays without his name, and isn''t marked edited');
select tests.ok((select member_id is null from public.review_replies where id = :paul_reply),
  '... and so does his reply');
select tests.ok((select member_id = :'ROSA' from public.review_replies where id = :rosa_reply),
  'Rosa''s reply under it is untouched');

-- Rosa leaves too, with a request from Niko still waiting on her shelf
set role authenticated;
call tests.sign_in(:'NIKO');
select public.request_book(21, :'ROSA', 'Hi Rosa') \g /dev/null
call tests.sign_in(:'ROSA');
select public.delete_my_account() \g /dev/null
reset role;
select tests.ok((select count(*) from public.copies where id in (:r20, :r21) and owner_id is null and removed_at is not null) = 2,
  'a librarian''s books leave the catalogue when they delete their account');
select tests.ok((select status from public.reservations where member_id = :'NIKO' and book_id = 21) = 'cancelled',
  'requests waiting on their shelf are cancelled');
select tests.ok((select owner_id is null and member_id is null from public.loans where copy_id = :r20),
  'the past loan now keeps no name on either side');
select tests.ok((select member_id is null from public.review_replies where id = :rosa_reply),
  'her reply stays, without her name');
select tests.ok(not exists (select 1 from public.borrower_approvals where owner_id = :'ROSA'),
  'the library passes she gave are gone');
set role authenticated;
call tests.sign_in(:'NIKO');
select tests.ok(not exists (select 1 from public.libraries() where owner_id = :'ROSA'),
  'her shelf is gone from the Libraries page');
select tests.ok(not exists (select 1 from public.library_availability() where owner_id = :'ROSA'),
  '... and from the catalogue');
select tests.ok((select count(*) from public.reviews where id = :paul_review) = 1,
  'members still see Paul''s review');

-- Deleting someone from the Supabase dashboard works the same way
call tests.sign_in(:'NIKO');
select book_id as asad_book from public.copies
where owner_id = :'ASAD' and removed_at is null order by book_id limit 1 \gset
select public.request_book(:asad_book, :'ASAD', null) \g /dev/null
reset role;
call tests.sign_in(null);
delete from auth.users where id = :'NIKO';
select tests.ok(not exists (select 1 from public.members where id = :'NIKO'),
  'Asad can still delete an account in the dashboard');
select tests.ok((select status from public.reservations
                 where member_id is null and owner_id = :'ASAD' and book_id = :asad_book order by id desc limit 1) = 'cancelled',
  '... and their open requests are cancelled the same way');
