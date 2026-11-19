-- =====================================================================
-- Asad's Library Portal: reservations round, covers and queue places
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

-- PART 1: a member's place in the queue
--
-- Members can only see their own reservations, so they can't count how
-- many people reserved a book before them. This function does the
-- counting with the owner's rights and returns only the member's own
-- open reservation with its place in the queue (1 = first in line).
-- Queue order is simply who asked first.

create or replace function public.my_open_reservation()
returns table (
  reservation_id bigint,
  book_id        bigint,
  status         text,
  created_at     timestamptz,
  queue_place    int
)
language sql stable security definer set search_path = ''
as $$
  select
    r.id, r.book_id, r.status, r.created_at,
    1 + (select count(*) from public.reservations o
          where o.book_id = r.book_id
            and o.status in ('pending_approval', 'active')
            and (o.created_at, o.id) < (r.created_at, r.id))::int
  from public.reservations r
  where r.member_id = (select auth.uid())
    and r.status in ('pending_approval', 'active');
$$;

revoke execute on function public.my_open_reservation() from public, anon;
grant execute on function public.my_open_reservation() to authenticated;


-- PART 2: book covers
--
-- Each book gets the number of its cover picture at Open Library
-- (openlibrary.org, a free, non-profit book database). The app builds
-- the picture's address from it, e.g.
--   https://covers.openlibrary.org/b/id/12345-M.jpg
-- Books with no cover there keep an empty value and show a plain
-- cloth-bound placeholder instead.

alter table public.books add column cover_id bigint;

-- (the cover numbers themselves are filled in at the end of this file)


-- PART 3: the "Interested" list
--
-- One row per member per book they've marked as interested. Members see
-- and change only their own list; the librarian can see everyone's.

create table public.interests (
  member_id  uuid        not null default auth.uid() references public.members (id) on delete cascade,
  book_id    bigint      not null references public.books (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, book_id)
);

alter table public.interests enable row level security;

create policy "interests: read own or librarian" on public.interests
  for select to authenticated
  using (member_id = (select auth.uid()) or public.is_librarian());
create policy "interests: add own" on public.interests
  for insert to authenticated
  with check (member_id = (select auth.uid()));
create policy "interests: remove own" on public.interests
  for delete to authenticated
  using (member_id = (select auth.uid()));

grant select, insert, delete on public.interests to authenticated;


-- PART 4: the cover numbers, matched by title and author and checked by eye
-- (175 of 188 books; the rest show the placeholder).

update public.books as b
set cover_id = v.cover_id
from (values
  (1, 14654118),
  (2, 8844867),
  (3, 6380662),
  (4, 13116801),
  (5, 7175278),
  (6, 8231751),
  (7, 11298743),
  (8, 6501256),
  (9, 9269962),
  (10, 14918086),
  (11, 9167516),
  (12, 15124196),
  (13, 13301713),
  (14, 10844230),
  (15, 824427),
  (16, 8494659),
  (17, 2560652),
  (18, 10730931),
  (19, 447454),
  (20, 805448),
  (21, 9322901),
  (22, 240973),
  (23, 7912974),
  (24, 8231823),
  (25, 4789041),
  (26, 610757),
  (27, 104119),
  (28, 12082523),
  (29, 10254876),
  (30, 15201230),
  (31, 5728115),
  (33, 6805644),
  (34, 1048892),
  (35, 14894064),
  (36, 9423947),
  (38, 6576095),
  (39, 14655761),
  (40, 8396115),
  (41, 10508840),
  (42, 9255997),
  (43, 295773),
  (44, 12216503),
  (45, 6463772),
  (46, 11481354),
  (47, 9351865),
  (48, 14653531),
  (49, 8339525),
  (50, 373090),
  (51, 8892430),
  (52, 239944),
  (53, 14234400),
  (54, 368968),
  (55, 374277),
  (56, 247709),
  (57, 13322313),
  (58, 15158664),
  (59, 15158660),
  (60, 12059372),
  (61, 10716273),
  (62, 15158666),
  (63, 15155833),
  (64, 10580435),
  (65, 8763851),
  (66, 8536326),
  (68, 14656260),
  (69, 116243),
  (70, 9322673),
  (71, 13792328),
  (72, 11658359),
  (73, 12882940),
  (74, 688817),
  (75, 3241487),
  (76, 6305612),
  (78, 10202651),
  (79, 12702407),
  (80, 14618737),
  (81, 211529),
  (82, 12724015),
  (83, 10544254),
  (84, 279981),
  (86, 4213835),
  (87, 283860),
  (88, 10657368),
  (89, 9267242),
  (90, 3233429),
  (91, 9255939),
  (92, 8580421),
  (93, 402350),
  (94, 10390065),
  (95, 6375226),
  (96, 9237058),
  (97, 8737626),
  (98, 4136740),
  (99, 7895389),
  (100, 10148215),
  (101, 13140258),
  (103, 683521),
  (104, 12848713),
  (105, 9278292),
  (106, 12722662),
  (107, 9271540),
  (108, 2394441),
  (109, 419004),
  (110, 9315123),
  (111, 7431269),
  (112, 12488337),
  (113, 12539163),
  (114, 14427814),
  (115, 12043351),
  (116, 7414780),
  (117, 14421833),
  (118, 646345),
  (119, 10102400),
  (120, 8334682),
  (121, 2379867),
  (122, 14305285),
  (123, 15267475),
  (124, 15123620),
  (125, 9255229),
  (127, 535027),
  (128, 15155257),
  (130, 678861),
  (131, 9331546),
  (132, 15226611),
  (133, 12715902),
  (134, 379932),
  (135, 7279515),
  (136, 8387264),
  (138, 12986869),
  (139, 14627509),
  (140, 12646537),
  (142, 14846827),
  (143, 12681713),
  (144, 3848185),
  (145, 7360819),
  (146, 11465134),
  (147, 14625765),
  (148, 10601402),
  (149, 9640110),
  (150, 7307756),
  (151, 4942101),
  (152, 301409),
  (153, 3352367),
  (155, 2010955),
  (156, 15264516),
  (157, 10491331),
  (158, 116484),
  (159, 10186221),
  (160, 12586592),
  (161, 8580475),
  (162, 8963642),
  (163, 9255992),
  (164, 14755918),
  (165, 10121798),
  (166, 7990164),
  (167, 431263),
  (170, 10201431),
  (171, 10873292),
  (172, 10376586),
  (173, 11972784),
  (174, 10439627),
  (175, 15162168),
  (176, 8309685),
  (177, 12968864),
  (178, 8418261),
  (179, 12641977),
  (180, 12728198),
  (181, 11735944),
  (182, 8882068),
  (183, 12621906),
  (184, 13110566),
  (185, 159096),
  (186, 9756202),
  (187, 10564838),
  (188, 14544172)
) as v (id, cover_id)
where b.id = v.id;

-- Quick check: how many books have a cover now (should be 175).
select count(*) as books_with_covers from public.books where cover_id is not null;
