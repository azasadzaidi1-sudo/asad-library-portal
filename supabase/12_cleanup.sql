-- =====================================================================
-- Clean-up: remove what's left over from the single-library days
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================
--
-- Since 08 (several libraries), a few things in the database aren't used
-- by anything any more. Nothing members see changes.
--
--   PART 1  The admin check gets an honest name. is_librarian() has meant
--           "is admin" since 08 ("librarian" now means anyone with books
--           on a shelf). The 8 rules that used it now use is_admin(), are
--           renamed to say "admin", and is_librarian() is removed.
--   PART 2  Two functions nothing calls: book_availability() (replaced by
--           library_availability()) and my_open_reservation() (replaced by
--           my_open_reservations()).
--   PART 3  Three columns nothing reads. Their contents are deleted for good:
--             books.restricted, books.restricted_reason  -> replaced by each
--               librarian's own list (restricted_titles)
--             members.role                               -> replaced by is_admin
--
-- All in one go: if any step fails, nothing changes.

begin;

-- ---------------------------------------------------------------------
-- PART 1: the 8 admin-only rules use is_admin()
-- ---------------------------------------------------------------------
-- Same behaviour as before: is_librarian() was just another name for
-- is_admin(). Only the name of the check and of each rule changes.

alter policy "members: read own or librarian" on public.members
  using (id = (select auth.uid()) or public.is_admin());
alter policy "members: read own or librarian" on public.members
  rename to "members: read own, or admin";

alter policy "books: librarian adds" on public.books
  with check (public.is_admin());
alter policy "books: librarian adds" on public.books
  rename to "books: admin adds";

alter policy "books: librarian edits" on public.books
  using (public.is_admin()) with check (public.is_admin());
alter policy "books: librarian edits" on public.books
  rename to "books: admin edits";

alter policy "books: librarian deletes" on public.books
  using (public.is_admin());
alter policy "books: librarian deletes" on public.books
  rename to "books: admin deletes";

alter policy "loans: librarian deletes" on public.loans
  using (public.is_admin());
alter policy "loans: librarian deletes" on public.loans
  rename to "loans: admin deletes";

alter policy "reading status: librarian only" on public.reading_status
  using (public.is_admin()) with check (public.is_admin());
alter policy "reading status: librarian only" on public.reading_status
  rename to "reading status: admin only";

alter policy "replies: delete your own, or librarian" on public.review_replies
  using (member_id = (select auth.uid()) or public.is_admin());
alter policy "replies: delete your own, or librarian" on public.review_replies
  rename to "replies: delete your own, or admin";

alter policy "reviews: delete your own, or librarian" on public.reviews
  using (member_id = (select auth.uid()) or public.is_admin());
alter policy "reviews: delete your own, or librarian" on public.reviews
  rename to "reviews: delete your own, or admin";

-- Nothing uses it now. (If something still did, this line would fail and
-- nothing in this file would change.)
drop function public.is_librarian();


-- ---------------------------------------------------------------------
-- PART 2: two functions nothing calls
-- ---------------------------------------------------------------------

drop function public.book_availability();
drop function public.my_open_reservation();


-- ---------------------------------------------------------------------
-- PART 3: three columns nothing reads
-- ---------------------------------------------------------------------

alter table public.books
  drop column restricted,
  drop column restricted_reason;

alter table public.members
  drop column role;

commit;


-- Quick check: should show old_functions 0, old_columns 0, and
-- rules_saying_admin 9 (the 8 renamed here, plus one from 08).
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('is_librarian', 'book_availability', 'my_open_reservation')) as old_functions,
  (select count(*) from information_schema.columns
     where table_schema = 'public'
       and ((table_name = 'books' and column_name in ('restricted', 'restricted_reason'))
         or (table_name = 'members' and column_name = 'role'))) as old_columns,
  (select count(*) from pg_policies
     where schemaname = 'public' and policyname ilike '%admin%') as rules_saying_admin;
