-- =====================================================================
-- Genre clean-up: from 23 genres to 18
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================
--
-- Genres describe what a book is about, not who it's written for, and a
-- genre with one or two books in it doesn't help anyone browse. So:
--
--   PART 1  Young Adult goes (an age group, not a theme). Its five books
--           move one by one:
--             The Hunger Games, The Ballad of Songbirds & Snakes -> Science Fiction
--             Thirteen Reasons Why, Tschick                     -> Literary Fiction
--             Twilight                                          -> Romance
--           If a librarian has added another Young Adult book since then,
--           the file stops before changing anything and names the book.
--   PART 2  Genres merge, on every shelf (books librarians added too):
--             Politics & Economics + Society & Futures -> Politics, Economics & Society
--             Philosophy + Spirituality                -> Philosophy & Spirituality
--             Self-Help + Language Learning            -> Self-Help & Learning
--             Sports Fiction                           -> Literary Fiction
--
-- Only the genre on each book changes. The genre filter, the Add book list
-- and each shelf's "Top genres" line are worked out from the books, so they
-- follow by themselves; no app change is needed.
--
-- All in one go: if any step fails, nothing changes. Running it a second
-- time does no harm.

do $$
declare
  v_left_over text;
begin
  -- -------------------------------------------------------------------
  -- PART 1: Young Adult, book by book (ids from 02_import_books.sql)
  -- -------------------------------------------------------------------
  update public.books set genre = 'Science Fiction'
   where genre = 'Young Adult' and id in (140,   -- The Hunger Games
                                          117);  -- The Ballad of Songbirds & Snakes
  update public.books set genre = 'Literary Fiction'
   where genre = 'Young Adult' and id in (175,   -- Thirteen Reasons Why
                                          178);  -- Tschick
  update public.books set genre = 'Romance'
   where genre = 'Young Adult' and id = 179;     -- Twilight

  select string_agg(format('%s by %s (book %s)', title, author, id), '; ' order by title)
    into v_left_over
    from public.books
   where genre = 'Young Adult';

  if v_left_over is not null then
    raise exception 'Stopped, nothing was changed. These Young Adult books need a new genre first: %. Add a line for each to PART 1 of this file, then run it again.', v_left_over;
  end if;

  -- -------------------------------------------------------------------
  -- PART 2: merges, on every shelf
  -- -------------------------------------------------------------------
  update public.books set genre = 'Politics, Economics & Society'
   where genre in ('Politics & Economics', 'Society & Futures');
  update public.books set genre = 'Philosophy & Spirituality'
   where genre in ('Philosophy', 'Spirituality');
  update public.books set genre = 'Self-Help & Learning'
   where genre in ('Self-Help', 'Language Learning');
  update public.books set genre = 'Literary Fiction'
   where genre = 'Sports Fiction';
end
$$;


-- Quick check: the genres now in the catalogue and how many titles each has.
-- It should show 18 rows, and none of the old names (Young Adult, Sports
-- Fiction, Spirituality, Philosophy, Self-Help, Language Learning,
-- Politics & Economics, Society & Futures).
select genre, count(*) as titles
  from public.books
 group by genre
 order by titles desc, genre;
