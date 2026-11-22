-- Privacy and the admin-only rules (01, 07, 08, renamed in 12).
\ir people.sql
set role authenticated;

-- Profiles
call tests.sign_in(:'LENA');
select tests.ok((select count(*) from public.members) = 1, 'members can read only their own profile');
call tests.sign_in(:'ASAD');
select tests.ok((select count(*) from public.members) > 1, 'the admin can read everyone''s');

-- "Interested" marks
call tests.sign_in(:'LENA');
insert into public.interests (book_id) values (3), (20);
select tests.ok((select count(*) from public.interests) = 2, 'Lena sees her own Interested books');
call tests.sign_in(:'JONAS');
select tests.ok((select array_agg(book_id) from public.interests where member_id = :'LENA') = array[3::bigint],
  'a librarian sees interest only in titles on their own shelf');
call tests.sign_in(:'TOM');
select tests.ok((select count(*) from public.interests where member_id = :'LENA') = 0,
  'other borrowers see none of it');

-- Reviews and replies
call tests.sign_in(:'SAM');
insert into public.reviews (book_id, body) values (3, 'Loved it') returning id as review \gset
call tests.sign_in(:'LENA');
insert into public.review_replies (review_id, body) values (:review, 'Same!') returning id as reply \gset
call tests.sign_in(:'JONAS');
delete from public.reviews where id = :review;
select tests.ok(exists (select 1 from public.reviews where id = :review), 'a librarian can''t delete someone else''s review');
call tests.sign_in(:'LENA');
delete from public.review_replies where id = :reply;
select tests.ok(not exists (select 1 from public.review_replies where id = :reply), 'members can delete their own reply');
call tests.sign_in(:'ASAD');
delete from public.reviews where id = :review;
select tests.ok(not exists (select 1 from public.reviews where id = :review), 'the admin can delete any review');

-- Asad's reading tracker
call tests.sign_in(:'ASAD');
insert into public.reading_status (book_id, status) values (1, 'read');
select tests.ok((select count(*) from public.reading_status) = 1, 'the admin keeps a reading tracker');
call tests.sign_in(:'JONAS');
select tests.ok((select count(*) from public.reading_status) = 0, 'nobody else can see it');
select tests.fails($$insert into public.reading_status (book_id, status) values (2, 'read')$$, 'row-level security',
  'or write to it');

-- Book details and loans
call tests.sign_in(:'JONAS');
update public.books set series = 'Hacked' where id = 1;
select tests.ok((select series from public.books where id = 1) is distinct from 'Hacked',
  'librarians can''t edit book details directly');
delete from public.loans;
select tests.ok(exists (select 1 from public.loans), 'or delete loans');
call tests.sign_in(:'ASAD');
update public.books set series = 'Edited by admin' where id = 1 returning id \g /dev/null
select tests.ok((select series from public.books where id = 1) = 'Edited by admin', 'the admin can edit book details');

-- Signed out
set role anon;
call tests.sign_in(null);
select tests.fails($$select * from public.books$$, 'permission denied', 'signed-out visitors can''t read the catalogue');
select tests.fails($$select * from public.members$$, 'permission denied', 'or anyone''s profile');
