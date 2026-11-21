-- =====================================================================
-- Shelf descriptions: what each shelf is like, on the Libraries page
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================
--
--   PART 1  Two lines a librarian writes about their shelf (not about
--           themselves): its personality ("I bringeth the classics!") and
--           when and where pick-ups usually happen.
--   PART 2  What the Libraries page reads: each shelf's top 3 genres
--           (worked out from its books), the personality line for everyone,
--           and the pick-ups line only for borrowers that librarian has
--           approved (and the librarian themselves).
--
-- Nothing existing changes, so the app keeps working before and after.


-- ---------------------------------------------------------------------
-- PART 1: the description, one per shelf
-- ---------------------------------------------------------------------

create table public.shelf_descriptions (
  owner_id     uuid primary key references public.members (id) on delete cascade,
  personality  text check (char_length(personality) <= 100),
  pickups      text check (char_length(pickups) <= 100),
  updated_at   timestamptz not null default now()
);

-- Nobody reads or writes the table directly: reading goes through
-- shelf_descriptions() below, which hides pick-ups from people who
-- haven't been approved, and writing goes through describe_shelf().
alter table public.shelf_descriptions enable row level security;

-- Saves (or changes) the signed-in librarian's two lines. Either may be
-- left empty. Line breaks and extra spaces are tidied into single spaces.
create or replace function public.describe_shelf(p_personality text, p_pickups text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me          uuid := (select auth.uid());
  v_personality text := nullif(btrim(regexp_replace(coalesce(p_personality, ''), '\s+', ' ', 'g')), '');
  v_pickups     text := nullif(btrim(regexp_replace(coalesce(p_pickups, ''), '\s+', ' ', 'g')), '');
begin
  if v_me is null or not exists (
    select 1 from public.copies c where c.owner_id = v_me and c.removed_at is null
  ) then
    raise exception 'Add a book to your shelf first.';
  end if;
  if char_length(v_personality) > 100 or char_length(v_pickups) > 100 then
    raise exception 'Keep each line to 100 characters.';
  end if;

  insert into public.shelf_descriptions (owner_id, personality, pickups)
  values (v_me, v_personality, v_pickups)
  on conflict (owner_id) do update
    set personality = excluded.personality,
        pickups     = excluded.pickups,
        updated_at  = now();
end;
$$;


-- ---------------------------------------------------------------------
-- PART 2: what the Libraries page shows for each shelf
-- ---------------------------------------------------------------------

-- One row per shelf with at least one book:
--   top_genres   up to 3 genres with the most titles on that shelf
--                (ties in alphabetical order)
--   personality  the librarian's line, or null
--   pickups      only for the librarian and borrowers they've approved
--   described    whether the librarian has saved a description yet
--                (the app keeps asking until they have)
create or replace function public.shelf_descriptions()
returns table (
  owner_id     uuid,
  top_genres   text[],
  personality  text,
  pickups      text,
  described    boolean
)
language sql stable security definer set search_path = ''
as $$
  with genre_counts as (
    select c.owner_id, b.genre, count(distinct b.id) as titles
    from public.copies c
    join public.books b on b.id = c.book_id
    where c.removed_at is null
    group by c.owner_id, b.genre
  ),
  ranked as (
    select gc.owner_id, gc.genre,
           row_number() over (partition by gc.owner_id order by gc.titles desc, gc.genre) as place
    from genre_counts gc
  )
  select
    s.owner_id,
    array(select r.genre from ranked r where r.owner_id = s.owner_id and r.place <= 3 order by r.place),
    d.personality,
    case when s.owner_id = (select auth.uid())
           or public.borrower_status(s.owner_id, (select auth.uid())) = 'approved'
         then d.pickups end,
    d.owner_id is not null
  from (select distinct gc.owner_id from genre_counts gc) s
  left join public.shelf_descriptions d on d.owner_id = s.owner_id;
$$;

revoke execute on function public.describe_shelf(text, text) from public, anon;
revoke execute on function public.shelf_descriptions() from public, anon;
grant execute on function public.describe_shelf(text, text) to authenticated;
grant execute on function public.shelf_descriptions() to authenticated;


-- Quick check: should show 0 descriptions so far, and the 3 biggest genres
-- across all shelves (while yours is the only shelf, that's your top 3).
select
  (select count(*) from public.shelf_descriptions) as descriptions,
  (select string_agg(genre, ', ' order by place) from (
     select b.genre, row_number() over (order by count(distinct b.id) desc, b.genre) as place
     from public.copies c join public.books b on b.id = c.book_id
     where c.removed_at is null
     group by b.genre
   ) g where place <= 3) as top_genres_overall;
