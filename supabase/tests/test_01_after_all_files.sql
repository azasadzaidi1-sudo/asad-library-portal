-- After every SQL file has run: the library is in the shape we expect.
\ir people.sql

-- The import (02) and several libraries (08)
select tests.ok((select count(*) from public.books) = 188, 'the import has 188 books');
select tests.ok((select count(*) from public.copies) = 200, 'and 200 copies');
select tests.ok((select count(*) from public.copies where owner_id = :'ASAD') = 200,
  'after 08, every imported copy is on Asad''s shelf');
select tests.ok((select is_admin from public.members where id = :'ASAD'), 'Asad is the admin');
select tests.ok((select count(*) from public.members where is_admin) = 1, 'and the only admin');
select tests.ok((select count(*) from public.restricted_titles where owner_id = :'ASAD') = 17,
  'Asad''s Restricted Section has its 17 titles');
select tests.ok(public.borrower_status(:'ASAD', :'SAM') = 'approved',
  'Sam, who borrowed before 08, counts as approved on Asad''s shelf (and so holds his library pass, 15)');
select tests.ok(exists (select 1 from public.loans
                        where member_id = :'SAM' and owner_id = :'ASAD' and returned_on is null),
  'Sam''s loan from before 08 belongs to Asad''s shelf');
select tests.ok(exists (select 1 from public.reservations
                        where member_id = :'NOOR' and owner_id = :'ASAD' and status = 'pending_approval'),
  'Noor''s Restricted request from before 08 still waits for Asad');

-- Library passes (15)
select tests.ok((select status || ': ' || note from public.reservations where member_id = :'INES')
                = 'pending_approval: Sam''s cousin, we met at the book swap',
  '15: a first-time request waiting before 15 still waits, with its note');
select tests.ok(not exists (select 1 from public.borrower_approvals where status in ('pending', 'declined')),
  '15: no first-time approvals are left over as pass requests');
select tests.ok(to_regprocedure('public.decide_borrower(uuid, boolean)') is null
                and to_regprocedure('public.borrower_requests()') is null,
  '15: the first-time borrower functions are gone');

-- The clean-up (12)
select tests.ok(to_regprocedure('public.is_librarian()') is null, '12: is_librarian() is gone');
select tests.ok(to_regprocedure('public.book_availability()') is null, '12: book_availability() is gone');
select tests.ok(to_regprocedure('public.my_open_reservation()') is null, '12: my_open_reservation() is gone');
select tests.ok(not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'books' and column_name in ('restricted', 'restricted_reason'))
        or (table_name = 'members' and column_name = 'role'))),
  '12: the three old columns are gone');
select tests.ok((select count(*) from pg_policies
                 where schemaname = 'public'
                   and policyname in ('members: read own, or admin', 'books: admin adds', 'books: admin edits',
                                      'books: admin deletes', 'loans: admin deletes', 'reading status: admin only',
                                      'replies: delete your own, or admin', 'reviews: delete your own, or admin')) = 8,
  '12: the 8 admin-only rules are named for the admin');
