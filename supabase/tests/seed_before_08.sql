-- Made-up members who exist before 08, like the real library did then:
-- Asad (the librarian, who becomes admin in 08) and two friends with some
-- history. All test people are fictional apart from Asad's name.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'asad@example.com'),
  ('00000000-0000-0000-0000-0000000000f1', 'sam@example.com'),
  ('00000000-0000-0000-0000-0000000000f2', 'noor@example.com');

update public.members set name = 'Asad', city = 'Berlin', role = 'librarian'
where id = '00000000-0000-0000-0000-00000000000a';
update public.members set name = 'Sam', city = 'Berlin'
where id = '00000000-0000-0000-0000-0000000000f1';
update public.members set name = 'Noor', city = 'Berlin'
where id = '00000000-0000-0000-0000-0000000000f2';

-- Sam has book 1 out and a reservation for book 3.
insert into public.loans (copy_id, member_id, lent_on)
values (1, '00000000-0000-0000-0000-0000000000f1', current_date - 10);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
insert into public.reservations (member_id, book_id) values ('00000000-0000-0000-0000-0000000000f1', 3);

-- Noor has asked for a Restricted Section book.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
insert into public.reservations (member_id, book_id)
select '00000000-0000-0000-0000-0000000000f2', min(id) from public.books where restricted;

select set_config('request.jwt.claim.sub', '', false);
