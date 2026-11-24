-- Genres: the clean-up from 23 genres to 18 (13).
-- 13 already ran when the test database was built; these checks look at the
-- result, then run it again on books added under the old names.
\ir people.sql
\set clean_up `cat 13_genre_cleanup.sql`

-- The old names are gone, on every shelf
select tests.ok(not exists (select 1 from public.books where genre in
    ('Young Adult', 'Sports Fiction', 'Spirituality', 'Philosophy', 'Self-Help',
     'Language Learning', 'Politics & Economics', 'Society & Futures')),
  'no book is left under an old genre name');
select tests.ok((select count(distinct genre) from public.books) = 18, 'the catalogue has 18 genres');

-- Where Asad's books went (his 188 titles from the import)
select tests.ok((select array_agg(genre order by id) from public.books where id in (117, 140)) = array['Science Fiction', 'Science Fiction'],
  'The Hunger Games and The Ballad of Songbirds & Snakes are Science Fiction');
select tests.ok((select array_agg(genre order by id) from public.books where id in (175, 178)) = array['Literary Fiction', 'Literary Fiction'],
  'Thirteen Reasons Why and Tschick are Literary Fiction');
select tests.ok((select genre from public.books where id = 179) = 'Romance', 'Twilight is Romance');
select tests.ok((select genre from public.books where id = 168) = 'Literary Fiction', 'The Test (cricket) is Literary Fiction');
select tests.ok((select count(*) from public.books where id <= 188 and genre = 'Politics, Economics & Society') = 10,
  'Politics, Economics & Society has the 7 politics and 3 society books');
select tests.ok((select count(*) from public.books where id <= 188 and genre = 'Philosophy & Spirituality') = 9,
  'Philosophy & Spirituality has the 5 philosophy and 4 spirituality books');
select tests.ok((select count(*) from public.books where id <= 188 and genre = 'Self-Help & Learning') = 9,
  'Self-Help & Learning has the 5 self-help books and the 4 German textbooks');
select tests.ok((select count(*) from public.books where id <= 188 and genre = 'Fantasy') = 30,
  'genres not in the clean-up keep their books (Fantasy still 30)');

-- Add book offers the new list
set role authenticated;
call tests.sign_in(:'MIRA');
select tests.fails($$select public.add_book('A Teen Novel', 'Someone', 'Young Adult', 'en')$$, 'genre from the list',
  'Add book no longer accepts an old genre');
select public.add_book('The Spirit Level', 'Wilkinson & Pickett', 'Politics, Economics & Society', 'en') as spirit_level \gset
select tests.ok((select genre from public.books where id = :spirit_level) = 'Politics, Economics & Society',
  'Add book accepts a merged genre');
reset role;

-- Books a librarian added under an old name before the clean-up move too
insert into public.books (title, author, genre, added_by) values
  ('Siddhartha', 'Hermann Hesse', 'Spirituality', :'MIRA'),
  ('Homo Deus', 'Yuval Noah Harari', 'Society & Futures', :'MIRA'),
  ('The Art of Fielding', 'Chad Harbach', 'Sports Fiction', :'MIRA'),
  ('Deutsch im Alltag', 'Klett', 'Language Learning', :'MIRA');
\o /dev/null
:clean_up
\o
select tests.ok((select array_agg(genre order by title) from public.books
                  where title in ('Siddhartha', 'Homo Deus', 'The Art of Fielding', 'Deutsch im Alltag'))
                = array['Self-Help & Learning', 'Politics, Economics & Society', 'Philosophy & Spirituality', 'Literary Fiction'],
  'a librarian''s books under old names are renamed like everyone else''s');
select tests.ok((select count(distinct genre) from public.books) = 18 and
                (select count(*) from public.books where id <= 188 and genre = 'Literary Fiction') = 20,
  'running the file a second time changes nothing else');

-- A Young Adult book the file doesn't know about stops it
insert into public.books (title, author, genre, added_by)
values ('Heartstopper', 'Alice Oseman', 'Young Adult', :'MIRA') returning id as heartstopper \gset
select tests.fails(:'clean_up', 'need a new genre first: Heartstopper by Alice Oseman',
  'an unknown Young Adult book stops the file and is named in the message');
delete from public.books where id = :heartstopper;
