-- =====================================================================
-- The Common Shelf: putting a book in the Restricted Section while adding it
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Needs 01-17 to have run first (18 isn't needed for this one).
-- =====================================================================
--
-- The Add book form gets a checkbox, "Restricted Section: I approve each
-- request". Ticked, the book goes onto the shelf and into the librarian's
-- Restricted Section in the same step, so people without their library
-- pass never see it, not even for a moment, and it can't end up on the
-- shelf without the restriction if something goes wrong halfway.
--
-- The stamp's reason starts as "Ask the librarian" (the table's default);
-- the librarian can pick another one later from the book's own page.
-- The Restricted Section is per title, as before: it covers all of that
-- librarian's copies of the book.
--
--   PART 1  add_book(): a new last setting, p_restricted
--   PART 2  add_copy(): adding your copy of a title already in the
--           catalogue, now in the database too, with the same setting
--   PART 3  Who may call what
--
-- The current app keeps working after this file runs: p_restricted is
-- optional and off unless the new form sends it.


-- ---------------------------------------------------------------------
-- PART 1: add_book(), with p_restricted
-- ---------------------------------------------------------------------

-- The same as in 09, plus the last setting. Adding a setting changes the
-- function's signature, so the old version is removed first.
drop function public.add_book(text, text, text, text, int, text, bigint, text, text[], text);

create function public.add_book(
  p_title        text,
  p_author       text,
  p_genre        text,
  p_language     text,
  p_year         int     default null,
  p_description  text    default null,
  p_cover_id     bigint  default null,
  p_ol_work_key  text    default null,
  p_prizes       text[]  default '{}',
  p_edition_note text    default null,
  p_restricted   boolean default false
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_title  text := btrim(coalesce(p_title, ''));
  v_author text := btrim(coalesce(p_author, ''));
  v_book   bigint;
begin
  if v_me is null then
    raise exception 'Sign in first.';
  end if;
  if char_length(v_title) not between 1 and 300 then
    raise exception 'The book needs a title.';
  end if;
  if char_length(v_author) > 200 then
    raise exception 'That author name is too long.';
  end if;
  if char_length(coalesce(p_edition_note, '')) > 100 then
    raise exception 'Keep the note about your copy under 100 characters.';
  end if;

  select b.id into v_book
  from public.books b
  where (p_ol_work_key is not null and b.ol_work_key = p_ol_work_key)
     or (lower(btrim(b.title)) = lower(v_title) and lower(btrim(b.author)) = lower(v_author))
  order by b.id
  limit 1;

  if v_book is null then
    if not exists (select 1 from public.books b where b.genre = p_genre) then
      raise exception 'Pick a genre from the list.';
    end if;
    if coalesce(p_language, '') !~ '^[a-z]{2}$' then
      raise exception 'Pick the book''s language.';
    end if;
    if p_year is not null and p_year not between 0 and extract(year from now())::int + 1 then
      raise exception 'That year doesn''t look right.';
    end if;
    if char_length(coalesce(p_description, '')) > 600 then
      raise exception 'Keep the description under 600 characters.';
    end if;
    if cardinality(coalesce(p_prizes, '{}')) > 12
      or exists (select 1 from unnest(coalesce(p_prizes, '{}')) x where char_length(x) > 100) then
      raise exception 'That list of awards doesn''t look right.';
    end if;

    insert into public.books
      (title, author, genre, language, year_published, description, cover_id, ol_work_key, prizes, added_by)
    values
      (v_title, v_author, p_genre, p_language, p_year, nullif(btrim(p_description), ''),
       p_cover_id, p_ol_work_key, coalesce(p_prizes, '{}'), v_me)
    returning id into v_book;
  end if;

  -- New: into the Restricted Section first, then onto the shelf. Both
  -- happen together or not at all. Already restricted? It stays as it is,
  -- reason included.
  if p_restricted then
    insert into public.restricted_titles (owner_id, book_id)
    values (v_me, v_book)
    on conflict (owner_id, book_id) do nothing;
  end if;

  insert into public.copies (book_id, owner_id, edition_note)
  values (v_book, v_me, nullif(btrim(p_edition_note), ''));
  return v_book;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 2: add_copy(), your copy of a title already in the catalogue
-- ---------------------------------------------------------------------

-- Until now the app added these straight into the copies table. Doing it
-- here lets the copy and its Restricted Section setting be saved together.
-- Returns the new copy's id.
create or replace function public.add_copy(
  p_book_id      bigint,
  p_edition_note text    default null,
  p_restricted   boolean default false
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_me   uuid := (select auth.uid());
  v_copy bigint;
begin
  if v_me is null then
    raise exception 'Sign in first.';
  end if;
  if not exists (select 1 from public.books b where b.id = p_book_id) then
    raise exception 'That book isn''t in the catalogue.';
  end if;
  if char_length(coalesce(p_edition_note, '')) > 100 then
    raise exception 'Keep the note about your copy under 100 characters.';
  end if;

  if p_restricted then
    insert into public.restricted_titles (owner_id, book_id)
    values (v_me, p_book_id)
    on conflict (owner_id, book_id) do nothing;
  end if;

  insert into public.copies (book_id, owner_id, edition_note)
  values (p_book_id, v_me, nullif(btrim(p_edition_note), ''))
  returning id into v_copy;
  return v_copy;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 3: who may call what
-- ---------------------------------------------------------------------

revoke execute on function public.add_book(text, text, text, text, int, text, bigint, text, text[], text, boolean) from public, anon;
revoke execute on function public.add_copy(bigint, text, boolean) from public, anon;
grant execute on function public.add_book(text, text, text, text, int, text, bigint, text, text[], text, boolean) to authenticated;
grant execute on function public.add_copy(bigint, text, boolean) to authenticated;


-- Quick check: both should say true.
select
  exists (select 1 from pg_proc where proname = 'add_book' and pronargs = 11) as add_book_ready,
  exists (select 1 from pg_proc where proname = 'add_copy') as add_copy_ready;
