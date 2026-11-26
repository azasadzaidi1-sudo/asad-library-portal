-- Putting a book in the Restricted Section while adding it (19).
-- By now Mira has a shelf, and Sam holds her library pass; Lena doesn't.
\ir people.sql
set role authenticated;

-- A new title, ticked "Restricted Section"
call tests.sign_in(:'MIRA');
select public.add_book('The Secret History', 'Donna Tartt', 'Literary Fiction', 'en', 1992,
                       null, null, 'OL19000001W', '{}', 'Signed first edition', true) as secret \gset
select tests.ok((select reason from public.restricted_titles where owner_id = :'MIRA' and book_id = :secret)
                = 'Ask the librarian',
  'ticked: the book goes into Mira''s Restricted Section, stamped "Ask the librarian"');
select tests.ok(exists (select 1 from public.copies where owner_id = :'MIRA' and book_id = :secret),
  'and her copy is on her shelf');

call tests.sign_in(:'LENA');
select tests.ok(not exists (select 1 from public.books where id = :secret),
  'Lena has no pass from Mira, so the book isn''t in her catalogue at all');
select tests.ok(not exists (select 1 from public.copies where book_id = :secret),
  '... nor its copy');
call tests.sign_in(:'SAM');
select tests.ok(exists (select 1 from public.copies where owner_id = :'MIRA' and book_id = :secret),
  'Sam holds Mira''s pass, so he sees it');
call tests.sign_in(:'ASAD');
select tests.ok(exists (select 1 from public.restricted_titles where owner_id = :'MIRA' and book_id = :secret),
  'the admin sees it in her Restricted Section');

-- Not ticked: as before (the old app's call, without the new setting, still works)
call tests.sign_in(:'MIRA');
select public.add_book('Stoner', 'John Williams', 'Literary Fiction', 'en') as stoner \gset
select tests.ok(not exists (select 1 from public.restricted_titles where owner_id = :'MIRA' and book_id = :stoner),
  'not ticked: the book isn''t restricted');
call tests.sign_in(:'LENA');
select tests.ok(exists (select 1 from public.copies where owner_id = :'MIRA' and book_id = :stoner),
  'and everyone sees it');

-- Adding a copy of a title already in the catalogue
call tests.sign_in(:'MIRA');
select public.add_copy(8, 'Old paperback', true) as copy8 \gset
select tests.ok((select book_id from public.copies where id = :copy8) = 8
                and exists (select 1 from public.restricted_titles where owner_id = :'MIRA' and book_id = 8),
  'Add my copy, ticked: the copy and the restriction are saved together');
call tests.sign_in(:'LENA');
select tests.ok(not exists (select 1 from public.copies where owner_id = :'MIRA' and book_id = 8),
  'Lena doesn''t see Mira''s copy of it');
select tests.ok(exists (select 1 from public.books where id = 8),
  'but the title stays in her catalogue, because Asad has an open copy');

call tests.sign_in(:'MIRA');
select public.add_copy(6) as copy6 \gset
select tests.ok(not exists (select 1 from public.restricted_titles where owner_id = :'MIRA' and book_id = 6),
  'Add my copy, not ticked: not restricted');

-- Already restricted: a new copy joins it, and the reason Mira chose stays
update public.restricted_titles set reason = 'Fragile copy' where owner_id = :'MIRA' and book_id = :secret;
select public.add_book('The Secret History', 'Donna Tartt', 'Literary Fiction', 'en', null,
                       null, null, null, '{}', 'Reading copy', true) \g /dev/null
select tests.ok((select reason from public.restricted_titles where owner_id = :'MIRA' and book_id = :secret) = 'Fragile copy',
  'a second copy, ticked again: the reason she picked stays');
select tests.ok((select count(*) from public.copies where owner_id = :'MIRA' and book_id = :secret) = 2,
  'and she now has two copies of it');
select public.add_copy(8, null, false) \g /dev/null
select tests.ok(exists (select 1 from public.restricted_titles where owner_id = :'MIRA' and book_id = 8),
  'an unticked copy of a restricted title doesn''t lift the restriction');

-- Nothing half-saved
select tests.fails(format('select public.add_copy(7, %L, true)', repeat('a', 101)), '100 characters',
  'a note about the copy over 100 characters is refused');
select tests.ok(not exists (select 1 from public.restricted_titles where owner_id = :'MIRA' and book_id = 7),
  '... and the title isn''t left in her Restricted Section');
select tests.fails($$select public.add_book('', 'Nobody', 'Literary Fiction', 'en', null, null, null, null, '{}', null, true)$$,
  'needs a title', 'a refused new title isn''t restricted either');

-- What add_copy refuses
select tests.fails('select public.add_copy(999999)', 'isn''t in the catalogue', 'only titles in the catalogue');
select tests.fails(format('insert into public.restricted_titles (owner_id, book_id) values (%L, 6)', :'JONAS'),
  'row-level security', 'nobody restricts someone else''s copies');
call tests.sign_in(null);
select tests.fails('select public.add_copy(6)', 'Sign in', 'signed out: no adding');
