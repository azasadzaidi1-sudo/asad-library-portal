-- =====================================================================
-- Asad's Library Portal: reviews and replies
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

-- PART 1: the tables
--
-- Any member can review any book, once (they can edit it later).
-- Under each review, members can reply in a single conversation
-- (replies to replies aren't a thing, to keep the pop-up readable).

create table public.reviews (
  id           bigint generated always as identity primary key,
  book_id      bigint      not null references public.books (id) on delete cascade,
  member_id    uuid        not null default auth.uid() references public.members (id) on delete cascade,
  body         text        not null check (length(btrim(body)) between 1 and 4000),
  has_spoilers boolean     not null default false,
  created_at   timestamptz not null default now(),
  edited_at    timestamptz,
  unique (book_id, member_id)            -- one review per member per book
);

create table public.review_replies (
  id         bigint generated always as identity primary key,
  review_id  bigint      not null references public.reviews (id) on delete cascade,
  member_id  uuid        not null default auth.uid() references public.members (id) on delete cascade,
  body       text        not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);

create index reviews_by_book on public.reviews (book_id);
create index replies_by_review on public.review_replies (review_id);

-- Mark a post as edited whenever its text changes.
create or replace function public.mark_edited()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.edited_at := now();
  return new;
end;
$$;

create trigger reviews_mark_edited before update on public.reviews
  for each row execute function public.mark_edited();
create trigger replies_mark_edited before update on public.review_replies
  for each row execute function public.mark_edited();


-- PART 2: who may do what
--
-- Every signed-in member can read all reviews and replies.
-- You can only post as yourself, and only edit your own posts.
-- You can delete your own posts; the librarian can delete anyone's.

alter table public.reviews        enable row level security;
alter table public.review_replies enable row level security;

create policy "reviews: members read all" on public.reviews
  for select to authenticated using (true);
create policy "reviews: post as yourself" on public.reviews
  for insert to authenticated with check (member_id = (select auth.uid()));
create policy "reviews: edit your own" on public.reviews
  for update to authenticated
  using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));
create policy "reviews: delete your own, or librarian" on public.reviews
  for delete to authenticated
  using (member_id = (select auth.uid()) or public.is_librarian());

create policy "replies: members read all" on public.review_replies
  for select to authenticated using (true);
create policy "replies: post as yourself" on public.review_replies
  for insert to authenticated with check (member_id = (select auth.uid()));
create policy "replies: edit your own" on public.review_replies
  for update to authenticated
  using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));
create policy "replies: delete your own, or librarian" on public.review_replies
  for delete to authenticated
  using (member_id = (select auth.uid()) or public.is_librarian());

-- Only the text (and the spoiler flag) can be changed after posting.
grant select, insert, delete on public.reviews to authenticated;
grant update (body, has_spoilers) on public.reviews to authenticated;
grant select, insert, delete on public.review_replies to authenticated;
grant update (body) on public.review_replies to authenticated;


-- PART 3: names and the "Borrowed from the library" badge
--
-- Members can't read each other's profiles (decision 4), but a review needs
-- its author's name. This function returns, for one book, only the names of
-- people who reviewed or replied there, plus whether each has ever borrowed
-- that book. Cities and everything else stay private.

create or replace function public.book_discussion_people(p_book_id bigint)
returns table (member_id uuid, name text, borrowed boolean)
language sql stable security definer set search_path = ''
as $$
  select
    m.id,
    m.name,
    exists (
      select 1 from public.loans l
      join public.copies c on c.id = l.copy_id
      where c.book_id = p_book_id and l.member_id = m.id
    )
  from public.members m
  where m.id in (
    select r.member_id from public.reviews r where r.book_id = p_book_id
    union
    select rr.member_id from public.review_replies rr
    join public.reviews r on r.id = rr.review_id
    where r.book_id = p_book_id
  );
$$;

revoke execute on function public.book_discussion_people(bigint) from public, anon;
grant execute on function public.book_discussion_people(bigint) to authenticated;
