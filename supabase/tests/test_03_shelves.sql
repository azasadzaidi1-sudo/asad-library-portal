-- Shelves: adding books (09), removing copies (09), shelf descriptions (11).
\ir people.sql
set role authenticated;

-- Mira starts her shelf
call tests.sign_in(:'MIRA');
select tests.ok(not exists (select 1 from public.libraries() where is_me), 'Mira starts with no shelf');
select tests.fails($$select public.describe_shelf('Hi', null)$$, 'Add a book',
  'no shelf description before a first book');
select public.add_book('Piranesi', 'Susanna Clarke', 'Fantasy', 'en', 2020,
                       'A man lives in a house of endless halls.', 10601212, 'OL20000000W',
                       array['Women''s Prize for Fiction 2021'], 'Bloomsbury hardback') as piranesi \gset
select tests.ok(exists (select 1 from public.libraries() where is_me and titles = 1),
  'her first book gives Mira a shelf on the Libraries page');
select tests.ok((select added_by from public.books where id = :piranesi) = :'MIRA',
  'the catalogue records who added a new title');

-- No duplicate titles
select tests.ok(public.add_book('piranesi', 'SUSANNA CLARKE', 'Fantasy', 'en') = :piranesi,
  'same title and author in other letters: a second copy, not a new title');
select tests.ok(public.add_book('Piranesi (novel)', 'S. Clarke', 'Fantasy', 'en', null, null, null, 'OL20000000W') = :piranesi,
  'same Open Library work under another spelling: also a copy');
select tests.ok(public.add_book((select title from public.books where id = 1), (select author from public.books where id = 1),
                                'Horror', 'de', null, 'should be ignored') = 1,
  'a title already in the catalogue: her copy joins its card');
select tests.ok((select description from public.books where id = 1) is distinct from 'should be ignored',
  'and that card''s details stay as they were');

-- What Add book refuses
select tests.fails($$select public.add_book('X', 'Y', 'Made-up genre', 'en')$$, 'genre from the list', 'only genres from the list');
select tests.fails($$select public.add_book('X', 'Y', 'Fantasy', 'english')$$, 'language', 'a two-letter language code');
select tests.fails($$select public.add_book('', 'Y', 'Fantasy', 'en')$$, 'needs a title', 'a title');
select tests.fails($$select public.add_book('X', 'Y', 'Fantasy', 'en', 3000)$$, 'year', 'a believable year');
select tests.fails(format($$select public.add_book('X', 'Y', 'Fantasy', 'en', null, %L)$$, repeat('a', 601)),
  '600 characters', 'descriptions up to 600 characters');
select tests.fails($$insert into public.books (title, author, genre) values ('Sneaky', 'Me', 'Fantasy')$$,
  'row-level security', 'members can''t write to the catalogue directly');
call tests.sign_in(null);
select tests.fails($$select public.add_book('X', 'Y', 'Fantasy', 'en')$$, 'Sign in', 'signed out: no adding');

-- Shelf descriptions
call tests.sign_in(:'MIRA');
select public.describe_shelf(E'Fantasy,\n   mostly ', 'Saturdays in Altona') \g /dev/null
select tests.ok((select personality from public.shelf_descriptions() where owner_id = :'MIRA') = 'Fantasy, mostly',
  'line breaks and extra spaces in a description are tidied');
select tests.fails(format('select public.describe_shelf(%L, null)', repeat('x', 101)), '100 characters',
  'description lines up to 100 characters');
select tests.ok((select pickups from public.shelf_descriptions() where owner_id = :'MIRA') = 'Saturdays in Altona',
  'Mira sees her own pick-ups line');
select tests.ok((select top_genres from public.shelf_descriptions() where owner_id = :'MIRA')
                = (select array_agg(genre order by genre) from (select distinct genre from public.books where id in (:piranesi, 1)) g),
  'top genres are worked out from her books (ties in alphabetical order)');
call tests.sign_in(:'LENA');
select tests.ok((select pickups from public.shelf_descriptions() where owner_id = :'MIRA') is null,
  'people Mira hasn''t approved don''t see her pick-ups');
select tests.ok((select personality from public.shelf_descriptions() where owner_id = :'MIRA') = 'Fantasy, mostly',
  'but they do see the personality line');
call tests.sign_in(:'ASAD');
select tests.ok((select pickups from public.shelf_descriptions() where owner_id = :'MIRA') is null,
  'not even the admin sees pick-ups without approval');
select tests.fails($$select * from public.shelf_descriptions$$, 'permission denied',
  'nobody reads the descriptions table directly');

-- Removing copies
call tests.sign_in(:'MIRA');
select min(id) as c1 from public.copies where book_id = :piranesi and owner_id = :'MIRA' \gset
call tests.sign_in(:'SAM');
select tests.fails(format('select public.remove_copy(%s)', :c1), 'isn''t on your shelf',
  'nobody else can remove Mira''s copy');
call tests.sign_in(:'MIRA');
insert into public.restricted_titles (owner_id, book_id, reason) values (:'MIRA', :piranesi, 'Special copy');
select tests.ok(public.lend_copy(:c1, :'SAM') is not null, 'Mira lends a copy to Sam in person');
select tests.fails(format('select public.remove_copy(%s)', :c1), 'lent out', 'a copy that''s lent out can''t be removed');
call tests.sign_in(:'SAM');
select tests.ok((select pickups from public.shelf_descriptions() where owner_id = :'MIRA') = 'Saturdays in Altona',
  'Sam has one of her books, so he sees her pick-ups');
call tests.sign_in(:'MIRA');
select public.remove_copy(id) from public.copies where book_id = :piranesi and owner_id = :'MIRA' and id <> :c1 \g /dev/null
select tests.ok((select count(*) from public.copies where book_id = :piranesi) = 1,
  'removed copies disappear from the shelf');
reset role;
update public.loans set returned_on = current_date where copy_id = :c1 and returned_on is null;
set role authenticated;
call tests.sign_in(:'MIRA');
select public.give_pass(:'SAM') \g /dev/null
call tests.sign_in(:'SAM');
select tests.ok(public.request_book(:piranesi, :'MIRA', null) is not null,
  'with a library pass, Sam reserves the last copy (it''s in her Restricted Section)');
call tests.sign_in(:'MIRA');
select public.remove_copy(:c1) \g /dev/null
select tests.ok((select status from public.reservations where book_id = :piranesi and member_id = :'SAM'
                 order by id desc limit 1) = 'cancelled',
  'removing the last copy cancels reservations for it');
select tests.ok(not exists (select 1 from public.restricted_titles where owner_id = :'MIRA' and book_id = :piranesi),
  'and takes the title out of her Restricted Section');
select tests.ok(exists (select 1 from public.loans where copy_id = :c1),
  'past loans of a removed copy are kept');
call tests.sign_in(:'SAM');
select tests.fails(format('select public.request_book(%s, %L, null)', :piranesi, :'MIRA'), 'doesn''t have a copy',
  'a removed copy can''t be reserved');
