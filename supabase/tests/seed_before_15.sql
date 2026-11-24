-- Before 15 (library passes): a first-time request still waiting for the
-- librarian, the way the live library has them. 15 must turn it into an
-- ordinary request that keeps its note. Ines is fictional.
\ir people.sql

select set_config('request.jwt.claim.sub', :'ASAD', false);
select public.create_invite() as ines_code \gset
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (id, email, raw_user_meta_data)
values (:'INES', 'ines@example.com', jsonb_build_object('invite_code', :'ines_code', 'name', 'Ines', 'city', 'Leipzig'));

select set_config('request.jwt.claim.sub', :'INES', false);
select public.request_book(5, :'ASAD', 'Sam''s cousin, we met at the book swap');
select set_config('request.jwt.claim.sub', '', false);
