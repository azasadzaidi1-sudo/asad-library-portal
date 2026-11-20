-- =====================================================================
-- Asad's Library Portal: lending round
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

-- Lending a book means two changes that must happen together:
--   1. a new loan for the copy and the member, and
--   2. if the member had reserved that book, their reservation is marked
--      'fulfilled' so it leaves the queue.
-- If the app made these as two separate requests, a dropped connection
-- in between could leave a loan with a reservation still in the queue.
-- This function does both in one step: either everything happens or nothing.
--
-- It runs with the caller's own rights ("security invoker"), so the
-- row-level security rules still apply: only the librarian can lend.
-- The date comes from the app, so a loan made after midnight in Berlin
-- isn't dated the day before (the database clock runs on UTC).

create or replace function public.lend_copy(
  p_copy_id        bigint,
  p_member_id      uuid,
  p_lent_on        date   default current_date,
  p_reservation_id bigint default null
)
returns bigint
language plpgsql security invoker set search_path = ''
as $$
declare
  v_book_id        bigint;
  v_reservation_id bigint := p_reservation_id;
  v_loan_id        bigint;
begin
  if not public.is_librarian() then
    raise exception 'Only the librarian can lend books.';
  end if;

  select c.book_id into v_book_id from public.copies c where c.id = p_copy_id;
  if v_book_id is null then
    raise exception 'That copy doesn''t exist.';
  end if;

  if exists (select 1 from public.loans l where l.copy_id = p_copy_id and l.returned_on is null) then
    raise exception 'That copy is already lent out.';
  end if;

  if exists (select 1 from public.loans l where l.member_id = p_member_id and l.returned_on is null) then
    raise exception 'This member already has a book. It needs to come back before they can borrow another.';
  end if;

  -- No reservation given? Use the member's open reservation for this book, if any.
  if v_reservation_id is null then
    select r.id into v_reservation_id
    from public.reservations r
    where r.member_id = p_member_id and r.book_id = v_book_id and r.status = 'active';
  elsif not exists (
    select 1 from public.reservations r
    where r.id = v_reservation_id and r.member_id = p_member_id
      and r.book_id = v_book_id and r.status = 'active'
  ) then
    raise exception 'That reservation isn''t open for this member and book.';
  end if;

  insert into public.loans (copy_id, member_id, reservation_id, lent_on)
  values (p_copy_id, p_member_id, v_reservation_id, p_lent_on)
  returning id into v_loan_id;

  if v_reservation_id is not null then
    update public.reservations set status = 'fulfilled' where id = v_reservation_id;
  end if;

  return v_loan_id;
end;
$$;

revoke execute on function public.lend_copy(bigint, uuid, date, bigint) from public, anon;
grant execute on function public.lend_copy(bigint, uuid, date, bigint) to authenticated;

-- Returning a book needs no new function: the librarian sets the loan's
-- returned_on date, which the rules in file 01 already allow.
