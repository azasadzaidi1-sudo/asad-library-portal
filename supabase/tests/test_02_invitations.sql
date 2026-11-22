-- Invitation links (10): nobody joins without one, each works once, for 14 days.
\ir people.sql
\set FIRST  '00000000-0000-0000-0000-0000000000e1'
\set SECOND '00000000-0000-0000-0000-0000000000e2'

-- Signing up
select tests.fails($$insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000999', 'x@example.com')$$,
  'valid invitation', 'nobody joins without an invitation link');
select tests.fails($$insert into auth.users (id, email, raw_user_meta_data)
                     values ('00000000-0000-0000-0000-000000000999', 'x@example.com', '{"invite_code": "made-up"}')$$,
  'valid invitation', 'a made-up code is refused');

-- The people the other tests use: Asad invites Mira and Jonas, Jonas invites
-- Lena, and Mira (who has no books yet) invites Tom.
call tests.join(:'ASAD', :'MIRA', 'Mira', 'Hamburg');
call tests.join(:'ASAD', :'JONAS', 'Jonas', 'Berlin');
call tests.join(:'JONAS', :'LENA', 'Lena', 'Potsdam');
call tests.join(:'MIRA', :'TOM', 'Tom', 'Berlin');
select tests.ok((select invited_by from public.members where id = :'LENA') = :'JONAS',
  '"Invited by" fills itself in');
select tests.ok((select invited_by from public.members where id = :'TOM') = :'MIRA',
  'a borrower with no books can invite too');
select tests.ok((select name || ', ' || city from public.members where id = :'LENA') = 'Lena, Potsdam',
  'name and city from the Join page are saved');

-- Each link works once
set role authenticated;
call tests.sign_in(:'SAM');
select public.create_invite() as used_code \gset
reset role;
insert into auth.users (id, email, raw_user_meta_data)
values (:'FIRST', 'first@example.com', jsonb_build_object('invite_code', :'used_code', 'name', 'First'));
select tests.fails(format($$insert into auth.users (id, email, raw_user_meta_data) values (%L, 'second@example.com', %L)$$,
                          :'SECOND', jsonb_build_object('invite_code', :'used_code')),
  'valid invitation', 'a used link can''t be used again');

-- ... and not after 14 days
set role authenticated;
call tests.sign_in(:'SAM');
select public.create_invite() as old_code \gset
reset role;
update public.invites set expires_at = now() - interval '1 minute' where code = :'old_code';
select tests.fails(format($$insert into auth.users (id, email, raw_user_meta_data) values (%L, 'second@example.com', %L)$$,
                          :'SECOND', jsonb_build_object('invite_code', :'old_code')),
  'valid invitation', 'an expired link is refused');
select tests.ok((select expires_at - created_at from public.invites where code = :'used_code') = interval '14 days',
  'links last 14 days');

-- What a signed-out visitor on the Join page can see
set role authenticated;
call tests.sign_in(:'SAM');
select public.create_invite() as open_code \gset
set role anon;
call tests.sign_in(null);
select tests.ok((select inviter_name || ': ' || status from public.check_invite(:'open_code')) = 'Sam: valid',
  'the Join page shows who sent a valid link');
select tests.ok((select status from public.check_invite(:'used_code')) = 'used', '... says when a link was used');
select tests.ok((select status from public.check_invite(:'old_code')) = 'expired', '... or has expired');
select tests.ok((select status from public.check_invite('nonsense')) = 'unknown', '... or doesn''t exist');
select tests.fails($$select * from public.invites$$, 'permission denied', 'signed-out visitors can''t list invitations');
select tests.fails($$select public.create_invite()$$, 'permission denied', 'or create one');

-- The "Invite a friend" list
set role authenticated;
call tests.sign_in(:'SAM');
select tests.ok((select count(*) from public.my_invites() where used_at is null) = 1,
  'Sam''s list shows his open link, not the expired one');
select tests.ok(exists (select 1 from public.my_invites() where joined_name = 'First'),
  'and who joined with his links recently');
reset role;
update public.invites set used_at = now() - interval '15 days' where code = :'used_code';
set role authenticated;
call tests.sign_in(:'SAM');
select tests.ok(not exists (select 1 from public.my_invites() where joined_name = 'First'),
  'joins older than 14 days drop off the list');
call tests.sign_in(:'LENA');
select tests.ok((select count(*) from public.invites where invited_by = :'SAM') = 0,
  'members only see their own invitations');
select tests.fails(format('select public.cancel_invite(%L)', :'open_code'),
  'can''t be cancelled', 'Lena can''t cancel Sam''s link');
call tests.sign_in(:'SAM');
select public.cancel_invite(:'open_code') \g /dev/null
select tests.ok(not exists (select 1 from public.invites where code = :'open_code'),
  'Sam can cancel his own');

-- At most 20 open links each
do $$ begin for i in 1..20 loop perform public.create_invite(); end loop; end $$;
select tests.fails($$select public.create_invite()$$, '20', 'at most 20 open links at a time');
reset role;
delete from public.invites where invited_by = :'SAM' and used_at is null;

-- Deleting a member who joined doesn't reopen their link
delete from public.members where id = :'FIRST';
select tests.fails(format($$insert into auth.users (id, email, raw_user_meta_data) values (%L, 'second@example.com', %L)$$,
                          :'SECOND', jsonb_build_object('invite_code', :'used_code')),
  'valid invitation', 'a used link stays used even if that member is deleted');
