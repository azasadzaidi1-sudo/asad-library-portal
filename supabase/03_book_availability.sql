-- =====================================================================
-- Asad's Library Portal: step 5, book availability for members
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

-- The problem: members may only see their own loans and reservations
-- (that's what the row-level security rules in file 01 do). But to show
-- "1 of 2 on the shelf" or "All copies out, 2 in the queue" for every book,
-- the app needs to count everyone's loans and reservations.
--
-- The answer: a function that runs with the database owner's rights
-- ("security definer") and hands back only counts per book. Members learn
-- how many copies are out and how many people are waiting, never who.

create or replace function public.book_availability()
returns table (
  book_id      bigint,
  copies_total int,   -- physical copies Asad owns
  copies_out   int,   -- copies currently lent out
  waiting      int    -- open reservations (confirmed or awaiting approval)
)
language sql stable security definer set search_path = ''
as $$
  select
    b.id,
    (select count(*) from public.copies c
      where c.book_id = b.id)::int,
    (select count(*) from public.loans l
      join public.copies c on c.id = l.copy_id
      where c.book_id = b.id and l.returned_on is null)::int,
    (select count(*) from public.reservations r
      where r.book_id = b.id and r.status in ('pending_approval', 'active'))::int
  from public.books b;
$$;

-- Only logged-in members may call it. New functions are callable by
-- everyone by default, so take that away first.
revoke execute on function public.book_availability() from public, anon;
grant execute on function public.book_availability() to authenticated;
