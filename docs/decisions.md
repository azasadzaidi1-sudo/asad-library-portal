# Decision log

Every notable choice in this project, with the options considered and the reason for the pick. Newest decisions are added at the bottom.

## 1. Build a real web app instead of extending the catalogue page

**Context.** The book catalogue started life as a page with its own small database inside Claude (claude.ai).

**Options.** (a) Turn that page into the lending app. (b) Build a standalone web app with its own database.

**Decision.** (b) Standalone web app.

**Why.** The page's database only works inside the page, for people signed in to a claude.ai account, so every friend would need one. It also can't send emails or run anything on a schedule, which rules out due-date reminders. A standalone app lets members log in with just an email address and is a project I fully own.

## 2. Supabase for the database and logins

**Options.** Supabase, Firebase (Google), Appwrite.

**Decision.** Supabase, free plan, region Central EU (Frankfurt).

**Why.**
- It's a real PostgreSQL database, so everything is plain SQL, a skill that transfers to data and analytics work. Firebase stores documents and doesn't use SQL.
- Invite-only sign-up is built in: public sign-ups can be switched off.
- Row Level Security lets the database itself decide who may see or change each row.
- Largest community of the three, so tutorials and AI coding tools know it best.
- Frankfurt keeps members' data inside the EU and close to Berlin.

**Trade-off.** Free projects pause after a week of low activity. The daily reminder job (decision 5) keeps it active.

**Data access settings at project creation.** Data API on (the website needs it); "grant API access to new tables automatically" off; "enable RLS on new tables automatically" on. Every table starts closed and locked, and is opened deliberately.

## 3. GitHub Pages for hosting the website

**Options.** GitHub Pages, Vercel, Netlify, Cloudflare Pages.

**Decision.** GitHub Pages.

**Why.** The site is plain front-end code (Supabase does the server work), so the extras of the other hosts aren't needed. Code and live site sit in one place with no extra account. Vercel's free plan is non-commercial only; Netlify's free plan pauses sites when its monthly credits run out; Cloudflare Pages is a strong alternative but means more setup.

**Consequence.** On a free GitHub account, Pages needs a public repository, so this repo is public. No secrets or member data are ever committed.

## 4. Gmail for sending email (for now)

**Context.** Supabase's built-in email only delivers to the project's own team, so invitations also need a proper email sender.

**Options.** Resend or Brevo with my own domain (about €10–15 a year), or my Gmail account.

**Decision.** Gmail for now.

**Why.** Dedicated services need a domain I own to send to anyone else. Gmail delivers reliably for free because Google sends the mail. At a handful of emails a week, a domain would mainly buy a more professional look. Switching later only means changing a few settings.

## 5. A daily GitHub Action for reminders

**Decision.** A scheduled GitHub Actions job runs once a day, finds loans due in 7 days, and emails the borrower.

**Why.** Free for public repositories, lives in the same repo as the code, and its daily database query also stops the free Supabase project from pausing.

## 6. Database design

| Table | One row per | Notes |
|---|---|---|
| `members` | person | name, city, role (member or librarian); linked to their login |
| `books` | title | includes prizes and a `restricted` flag |
| `copies` | physical book | lets two copies of the same title be lent at once |
| `reservations` | request for a title | pending_approval, active, fulfilled, cancelled, declined |
| `loans` | copy handed to a member | due date is always lent date + 28 days |
| `reading_status` | title | the librarian's personal reading tracker, private |

**Key choices.**
- Each physical copy is tracked separately.
- Members reserve a title, not a specific copy; the librarian picks the copy when lending.
- The librarian's four views (Available, Reserved, Lent out, Overdue) are calculated from loans and reservations, never stored, so they can't contradict each other.

## 7. Library rules

- Invite-only. The librarian enters the email; the member adds their name and city on first login.
- Loan period: 4 weeks. Email reminder 1 week before the due date.
- Restricted Section: visible to members and marked as restricted; reservations need the librarian's approval. Starts with *Mein Kampf* and *The Communist Manifesto*.
- Ordinary reservations are confirmed automatically.
- Waiting list: a title whose copies are all out can still be reserved; first in line gets the next returned copy.
- Each member can have 1 book borrowed and 1 open reservation at a time.

These rules are enforced inside the database (unique indexes, a trigger and Row Level Security policies in `supabase/01_tables_and_rules.sql`), not just in the website, so they hold even if someone bypasses the site.

## 8. Importing the catalogue, and keeping reading statuses private

**Decision.** The 188 titles and 200 copies were copied from the old catalogue page into `supabase/02_import_books.sql`, which is in this repo. The librarian's personal reading statuses were imported with a separate file that is deliberately not in the repo.

**Why.** The book list is fine to show publicly. Reading statuses are only meant for the librarian (that's what the `reading_status` table's rules enforce), so publishing them in a public repo would undo that. Book ids are set explicitly in the import so the copies can refer to them, and the id counter is moved on afterwards so new books continue from 189.

## 9. The Restricted Section also protects fragile copies

**Decision.** Besides the two books restricted for their content, 15 titles whose copies are too worn to lend freely also need the librarian's approval: Harry Potter 1–7, The Lord of the Rings, A Tale of Two Cities, Life and Character of Dickens, The Early Asimov Volume 1, Dr Jekyll and Mr Hyde, The Adventures of Tom Sawyer, A Century of Science Fiction and The Long Dark Tea-Time of the Soul. A new `restricted_reason` field ('Sensitive content' or 'Fragile copy') tells members why a book is restricted.

**Why per title, not per copy.** Harry Potter 1 and 7 each have one worn copy and one in better shape. Marking individual copies would keep the better copy auto-confirmed, but it needs a per-copy flag and makes availability harder to work out. Restricting the whole title reuses the existing approval rule with no new logic. Since the librarian picks the copy at hand-over anyway, nothing is lost. This can move to per-copy later if it becomes a nuisance.

**Why show a reason.** One "Restricted" label for both Mein Kampf and Harry Potter would confuse members; a short reason explains the wait.

## 10. React + Vite for the website

**Decision.** The site is built with React (JavaScript) and Vite, and published to GitHub Pages by a GitHub Actions workflow.

**Why.** React is the most widely used way to build web interfaces, so it's the most transferable skill, and AI coding tools know it well. Vite gives a fast local preview and turns the code into a small static site that GitHub Pages can serve. *Considered:* plain HTML and JavaScript (no build step, but gets messy as screens and state grow, and is weaker on a CV); React with TypeScript (stronger still, but more to learn at once, so it can come later); Next.js (needs a server for its main features, which GitHub Pages doesn't offer).

## 11. Email and password sign-in, invite-only

**Decision.** Members sign in with email and password. Public sign-ups are switched off in Supabase, so the only way in is an invitation from the librarian.

**Why.** Passwords are familiar, and each sign-in works without waiting for an email. *Considered:* magic links (no passwords, but every sign-in would depend on the librarian's Gmail sending a message, and Gmail limits how many it sends).

## 12. Members see counts, never borrowers

**Decision.** `supabase/03_book_availability.sql` adds `book_availability()`, which returns for every book the number of copies, how many are lent out and how many people are waiting. The app turns that into "1 of 2 on the shelf", "Reserved, 1 in the queue" or "All copies out, 2 in the queue".

**Why.** Row-level security keeps each member's loans and reservations private, so a member's own query can't count other people's. The function runs with the owner's rights but returns only totals, so members can decide whether to join a queue without learning who has a book or since when. Only signed-in members can call it.

## 13. A cosy old library, with fonts served from this site

**Decision.** Cream card stock, deep green cloth and brass, with each book shown as a card from a library card catalogue. The one loud element is an oxblood rubber stamp on Restricted Section books. Titles are set in IM Fell English, a revival of 17th-century Oxford types; everything else is in Alegreya Sans. Books are filed the way libraries shelve them, ignoring a leading "The", "A" or German "Die".

**Why the fonts are bundled.** Loading fonts from Google's servers sends every visitor's IP address to Google; a German court (LG München I, January 2022) ruled that a GDPR breach. Bundling the font files with the site avoids that.

## 14. Tests and automatic checks

**Decision.** The catalogue logic (filters, availability wording, filing order) lives in plain functions in `src/lib/catalogue.js` with unit tests (Vitest). A GitHub Actions check runs the tests and a build on every pull request, and the deploy workflow runs them again before publishing.

**Why.** Keeping logic out of the screens makes it easy to test, and the automatic check means a mistake shows up as a red cross on the pull request rather than on the live site.

## 15. Reservations, approvals and the Interested list

**Decision.** Members reserve from a book's pop-up, one book at a time, and can cancel. Restricted Section requests appear in a "Waiting for your approval" box above the librarian's catalogue. A declined request shows on the member's "My books" page for a week. Members can also mark books as interested; that list is visible to the member and the librarian, and to nobody else.

**How the queue works.** The queue is first come, first served. Members can't see other people's reservations, so `my_open_reservation()` (in `supabase/04_reservations_and_covers.sql`) counts with the owner's rights and returns only the member's own reservation and its place, e.g. "You're 2nd in the queue". The one-reservation rule was already enforced by the database (decision 7), so the app only turns that error into a plain sentence.

**Why the Interested list is shared with the librarian.** It shows which books friends want, which helps decide what to lend next or buy a second copy of. *Considered:* private (simpler, but less useful to the librarian) and visible to all members (more social, but needs more privacy rules).

## 16. A pop-up per book and a "My books" page

**Decision.** Clicking a card opens the book in a pop-up over the list, so search, filters and scroll position stay put. "My books" is a separate page, reached from the top bar, with three shelves: Borrowed, Reserved and Interested. The two pages are switched with the address bar's `#my-books`, so the back button works without adding a routing library.

**Why a pop-up without its own link.** It's the lightest option and keeps people in the catalogue. *Considered:* a pop-up that also changes the address (shareable link to one book) and a separate page per book (filters would need extra work to survive going back).

## 17. Covers from Open Library, linked rather than copied

**Decision.** Each book stores the number of its cover at Open Library, a free non-profit book database, and the app loads the picture from Open Library's cover service. Books without a good match show a cloth-bound placeholder with their first letter.

**How the covers were matched.** A one-off script ran on GitHub Actions (the development workspace can't reach Open Library): it searched by title and author, then drew contact sheets of all 188 matches so every cover could be checked by eye. A second pass collected alternative covers for wrong or foreign-language matches (for example a Spanish *Shock Doctrine*) and the right ones were picked by hand.

**Why link instead of copying the images.** Cover art is copyrighted, and copying it into a public repository would mean redistributing it. *Trade-off:* each visitor's browser contacts Open Library (run by the Internet Archive) to load covers, unlike the fonts, which are bundled (decision 13). For an invite-only library among friends that's acceptable; the alternative would be storing copies in private Supabase Storage.

## 18. The lending desk

**Decision.** The librarian gets a "Lending desk" page with four tabs, each with a count: Overdue, Reserved, Lent out and Available. It opens on the first tab that needs attention. Handing over a reserved book is one click ("Lend to Lena"); any free copy can also be lent straight to a member without a reservation, for a friend picking a book at the librarian's place. The same Lend and Mark returned buttons appear in each book's pop-up. Returns ask for a second click to confirm. A ready reservation is held until the librarian cancels it; the desk shows how many days it has waited.

**Why computed, not stored.** The four groups are worked out in `src/lib/desk.js` from copies, open loans and open reservations each time the page loads, so there's no status column that could drift out of step. Each book's queue is walked in order: earlier reservations claim the copies on the shelf, and only unclaimed copies count as available. This is the same rule members see in "You're 2nd in the queue".

**Why lending is a database function.** Lending writes a loan *and* closes the member's reservation. `lend_copy()` (in `supabase/05_lending.sql`) does both in one transaction, refuses with a plain message when the copy is already out or the member already has a book, and finds the member's reservation by itself if the desk didn't name one. It runs with the caller's rights, so the existing rules still allow only the librarian to lend. The app passes the date, because the database clock runs on UTC and a loan made after midnight in Berlin would otherwise be dated the day before.

**Left for later.** Extending a loan and back-dating loans weren't needed yet; extending would need the due date to stop being a fixed "lent on + 28 days" column.

## 19. Book descriptions written for this library

**Decision.** Every book has a short, spoiler-free description of two or three sentences in English, shown in its pop-up. They were written for this library, not copied from the back covers, and the facts for lesser-known books (an Urdu classic, German novels, a cricket novel, cookbooks) were checked online first. They live in a `description` column added by `supabase/06_descriptions.sql`.

**Why not the publishers' blurbs.** Back-cover blurbs are copyrighted, and copying 188 of them into a public repository would be redistributing them. *Considered:* loading Open Library's descriptions live (like the covers), but many books have none there and others are long or not in English. Writing them fresh gives every book, including the German textbooks and the Urdu novel, a description in one consistent voice.

## 20. Reviews with replies, and a badge for library readers

**Decision.** Any member can write one review per book (they can edit it later) and reply to any review in a single conversation under it. A "Borrowed from the library" badge marks reviews from members who have had a loan of that book. Reviewers can flag spoilers, which hides the review until a reader chooses to see it. Members can edit and delete their own posts; the librarian can delete anything.

**Why the badge instead of borrowers only.** Limiting reviews to borrowers would have kept them about this library's copies, but with a brand-new library nobody could have reviewed anything for weeks. Letting everyone post while badging borrowers gets conversations going straight away and still shows whose review comes from a library copy. *Considered:* borrowers only; any member with no badge.

**Why one level of replies.** Nested threads get cramped inside a pop-up, especially on phones.

**Privacy.** Members still can't read each other's profiles. `book_discussion_people()` (in `supabase/07_reviews.sql`) returns only the names of people who posted about that book and whether each borrowed it, never cities or anything else. The first-visit screen now says so. The badge does reveal that a reviewer once borrowed the book, which they opt into by writing the review.

**Rules in the database.** Row-level security lets members post only as themselves and edit only their own posts; column grants mean only the text and spoiler flag can change after posting; a trigger stamps `edited_at`; deleting a review removes its replies.

## 21. Installable on phones, with a shelf icon

**Decision.** The app can now be installed from Chrome ("Install app") and gets its own icon on the home screen, labelled "Common Shelf", and opens in its own window without the browser bar. The icon is three book spines on a brass shelf, in the library's green, paper, brass and oxblood; the browser tab icon uses it too.

**How.** Chrome only offers to install a site that has a web app manifest (`public/manifest.webmanifest`): a small file with the app's name, a 192px and a 512px icon, the start page, and `display: standalone`. The icon is drawn once in `scripts/icons/shelf.svg.tmpl`, and `make_icons.sh` turns it into every size needed: rounded icons, "maskable" icons with the shelf shrunk into the middle so Android can crop them to a circle without cutting off a book, and a square 180px icon for iPhones, which round the corners themselves. Paths in the manifest are relative, so they work under the `/asad-library-portal/` address.

**Why no offline mode.** A service worker could cache the app so it opens without internet, but Chrome no longer requires one to install, and every page needs live data from the database anyway. Offline, the app would only be able to show an error. *Left for later* if members ask for it.

**Name ahead of the rename.** The home-screen name and the install prompt already say The Common Shelf, the planned name for the multi-library version; the page title still says Asad's Library until the full rename.

## 22. The Common Shelf inside the app too

**Decision.** The header, the sign-in page and the browser tab now say The Common Shelf instead of Asad's Library, matching the installed app's name. The catalogue page shows no single library's name, because the next build adds friends' shelves and a page to choose a library. Lines that refer to Asad as the lender ("Needs Asad's approval to borrow", "Get in touch with Asad") stay as they are for now, since he is still the only librarian; they'll name each book's own librarian once there are several.

## 23. Several libraries, and trust between friends

**Decision.** The Common Shelf now holds more than one library. Every copy has an owner, and anyone with a copy on their shelf is a librarian of that shelf. Members browse all shelves in one catalogue (with a Libraries page and a library filter), and a title owned by several friends keeps one card, with its description and reviews shared, showing "2 libraries, 1 copy on the shelf". In the pop-up, each library's copies get their own row, and members reserve from the library they choose.

**Trust circles.** The first time someone asks to borrow from a librarian, the request waits for that librarian. The request card shows what helps decide: the person's note (prompted with "Remind Mira how you know each other"), who invited them, which librarians already lend to them, when they joined and how their past loans went. After one approval they reserve from that shelf freely. If the librarian declines, the borrower sees "The Kite Runner won't be coming from Mira's shelf this time. Have a look at the other copies." The wording is deliberately warm, without "you" or "your request", and the same note is used for declined Restricted requests. A librarian can stop lending to someone later: their reservation on that shelf is cancelled, and a book they already have comes back as normal. Asad's existing members count as already approved for his shelf.

**Rules per library, enforced in the database** (`supabase/08_multiple_libraries.sql`):
- one book borrowed and one open reservation per member per library
- only a copy's owner can lend it
- each librarian has their own Restricted Section, with a reason shown to members
- a first-time borrower asking for a Restricted book needs two approvals: first as a borrower, then for the book
- lending a book in person counts as approving that borrower

**Privacy.** Members still can't read each other's profiles. Librarians get names only (never cities or emails) for the people connected to their shelf, through functions that return just that. Librarians' own name and city are public on the Libraries page, so members can pick a copy nearby. The Interested list is visible to the member and to librarians who own that title.

**Admin.** Asad becomes the admin. He removes inappropriate reviews, which librarians can't do; he keeps his private reading tracker, which isn't extended to other librarians for now; and he records who invited each new member until in-app invites exist.

**Kept working during the switch.** The file keeps the old functions and columns, so the live site keeps working between running the SQL and the new website going live. A later clean-up can remove them.

*Considered:* making members pick a library before seeing any books (it hides most of the catalogue), and one approval covering both a new borrower and a Restricted book (two separate approvals were preferred).

## 24. Librarians add their own books

**Decision.** An Add book page lets any member put books on their own shelf, so new librarians don't need Asad (or a round of shelf photos) to get started. It's reached from the Libraries page: "Start your shelf" for someone without books yet, and "Add a book" on your own library card. It's deliberately not on the lending desk: the desk is for day-to-day lending, and looking after your shelf (adding, removing, the Restricted Section) is separate work, so the two stay apart. Librarians find a book by typing a title, author or ISBN, or by scanning the barcode on the back with their phone camera. Chrome on Android reads barcodes natively (the BarcodeDetector API), so there's no extra library; on devices without it, only search shows.

**One card per title.** If the book is already in the catalogue (same Open Library work, or the same title and author however they're written), the librarian's copy joins that card, and the shared description and reviews stay as they are. Only a genuinely new title creates a new card. The database checks this too, so the same book can't be added twice.

**Keeping the catalogue consistent:**
- **Basics:** Open Library fills in title, author, year, cover and a guess at the language.
- **Genre:** the librarian picks one from the existing list (required), so filters keep working.
- **Description:** optional, in their own words. Publisher blurbs aren't copied, as with the original catalogue.
- **Prizes:** filled in automatically from Wikidata, which links books to their Open Library ID. Only prizes with a year are kept, which leaves out "best of" lists, and names are shortened to match the catalogue ("Hugo Award 2002").
- **Goodreads ratings:** Goodreads closed its API in 2020, and Wikidata only stores the Goodreads ID, not the rating. So ratings for new titles are looked up by hand in occasional batches. (A "See it on Goodreads" link was considered and not chosen.)

**Removing a copy** marks it as removed rather than deleting it, so past loans and the "Borrowed from the library" badge on reviews stay true. A lent-out copy can't be removed. If it was the librarian's last copy of a title, anyone waiting for it on their shelf has their reservation cancelled, and a title with no copies left disappears from the catalogue.

*Considered:* a free-text genre (it would split the genre filter), requiring a description (slower for librarians, and an empty one is better than a copied blurb), and a barcode library such as ZXing (heavier; the built-in detector covers the phones that matter here).

## 25. "My books" becomes "Borrowing lists"

**Decision.** The page with what a member has borrowed, reserved and marked as interested is now called **Borrowing lists** (Asad's wording). Once members could have shelves of their own, "My books" read just as naturally as "the books I own", and that page is about books from other people's shelves. Old links to `#my-books` still open it.

## 26. Invitation links, from any member

**Decision.** New members join through an invitation link instead of Asad creating each account in Supabase. Any member can create one on the Libraries page (Asad changed the earlier plan of "only people who lend books can invite"). They send it however they like: WhatsApp, a text, an email. The friend opens it, sees who invited them, and enters their name, city, email and a password of their own. They're signed in straight away, and "Invited by" on first-time request cards fills itself in.

**Why trust still holds.** Inviting someone only lets them in the door. Every librarian still approves each first-time borrower, seeing who invited them, so letting borrowers invite widens the circle without anyone lending to a stranger.

**Rules, enforced in the database** (`supabase/10_invites.sql`):
- a link works for one person and expires after 14 days
- links are 32 random characters, so they can't be guessed
- a member can have up to 20 open links at a time
- the account trigger refuses any new account without a valid, unused, unexpired invitation, so switching Supabase's public sign-ups on doesn't let strangers in

**Who joined, for 14 days.** Under "Invite a friend", a member sees their open links (to copy again or cancel) and anyone who joined with one of their links in the last 14 days ("Tom joined on 21 Nov 2026"), under a "Joined in the last 14 days" label so nobody wonders why a friend from a month ago is missing. That answers "did my friend make it in?" and then disappears, so the list never turns into a running count of people someone has brought in, which would read like a follower count (Asad's call). Expired links aren't shown.

**No email needed, for now.** Supabase's built-in email only reaches the project owner's own address, so email confirmation is switched off. The invitation itself is the proof that someone belongs here. "Forgot password" needs real email (Gmail connected to Supabase) and comes later.

*Considered:* emailed invitations (needs Gmail and a small server function first), one reusable link per member (easier, but it can travel further than intended), and links without an expiry date.

## 27. Shelf descriptions on the Libraries page

**Decision.** Each shelf card on the Libraries page describes the shelf, not the person:
- **Top genres**, worked out automatically: the 3 genres with the most titles on that shelf ("Top genres: Fantasy, Science Fiction, Classics"). Every shelf has this from its first book, with no effort.
- **Two lines the librarian writes**, in their own voice:
  - "Your shelf personality in one line", for example "I bringeth the classics!"
  - "Pick-ups: Usually preferred time and place?", for example "Weekday evenings, near Hermannplatz"

A new librarian is asked for the two lines right after adding their first book (with a "Later" option), and their own card keeps asking until they've saved a description. After that it has an "Edit description" button.

**Why both.** Asad first weighed an automatic line against a librarian's note, which overlap (both tell you what a shelf is like before you open it), and chose to mix them. The genres line is always there and always accurate; the personality line gives the shelf a voice, so people meet each other through their books without anyone having a profile (decision 23). The pick-ups line carries what data can't: where and when books change hands.

**Pick-ups only for approved borrowers.** Only the librarian and borrowers they've approved see it (Asad's call). Others see the personality and genres lines. This is enforced in the database (`supabase/11_shelf_descriptions.sql`), not just hidden in the app. The admin gets no exception.

**Libraries page only**, not in a book's pop-up (Asad's call).

*Considered:* only the automatic line (reliable, but every fiction shelf looks alike), only the librarian's note (personal, but blank for anyone who skips it), and a free "about me" text (rejected: that's a profile).

## 28. Database tests in the repository, and clearing out leftovers

**Context.** By decision 27 the database had grown through twelve SQL files, each written, tested and run by hand. The tests behind them lived only in a temporary workspace, and GitHub's checks covered the app's logic but not the database rules, which are where the real house rules live (decision 2). A review of technical debt also found leftovers from the single-library days.

**Decision.**
- **Automatic database tests.** `supabase/tests` rebuilds a throwaway copy of the database from the numbered files, in order, and runs plain-language checks against it: invitations, adding and removing books, shelf descriptions, first-time approvals, Restricted books, limits per library, lending, and who can see or change what. GitHub runs them on every pull request as a second check next to the app's ("Database tests"). A test that fails names the rule that broke, e.g. "FAILED: a librarian can't delete someone else's review".
- **A clean-up file (12).** It removes three columns and two functions nothing has used since several libraries (decision 23), and renames the admin check: `is_librarian()` had meant "is admin" since then, while "librarian" in the app means anyone with books on a shelf. Asad chose to drop the old columns rather than keep them unused, and to rename the check rather than leave an alias.

**Why.** The rules are enforced in the database, so a mistake there would reach members regardless of the app. Tests that run on every pull request catch it before a file is run in Supabase, and they describe the rules in one readable place. The clean-up keeps the database matching how the app actually works, so the next change doesn't trip over a column that looks meaningful but isn't. The tests ran against the clean-up too: the renamed rules behave exactly as before.

*Considered:* keeping the tests outside the repository (no record, nothing runs them), Supabase's own command-line tooling and its test framework (more setup than this project needs for now; possible later), and keeping the old columns "just in case" (their contents were already replaced by per-librarian lists).


## 29. Fewer, theme-based genres

**Context.** The genres came from cataloguing Asad's own shelf: 23 of them, from Fantasy (30 titles) down to genres with one or two books. Since librarians add their own books (decision 24), every librarian picks from that list, so it now shapes how friends file their books and how everyone browses, not just how one shelf was sorted.

**Decision.** From 23 genres to 18 (`supabase/13_genre_cleanup.sql`):
- **Young Adult goes.** Asad's principle: a genre should say what a book is about, not who it's written for. Its five books moved one by one: The Hunger Games and The Ballad of Songbirds & Snakes to Science Fiction (a dystopian future, no magic), Thirteen Reasons Why and Tschick to Literary Fiction, Twilight to Romance.
- **Sports Fiction goes.** It didn't need a genre of its own (Asad); its one book, a cricket novel, moves to Literary Fiction.
- **Three merges:** Politics & Economics + Society & Futures → **Politics, Economics & Society**; Philosophy + Spirituality → **Philosophy & Spirituality**; Self-Help + Language Learning → **Self-Help & Learning**. Combined names use "&", like the existing ones (Asad's call).

The merges apply on every shelf, so a book a friend filed under an old name moves with the rest. Young Adult can't be merged by name, because its books go to different places; if a librarian added a Young Adult book that the file doesn't know about, it stops before changing anything and names the book, rather than guessing.

**Left for later (Asad's call):** renaming Literary Fiction to "Fiction" (it's really the general-fiction shelf), and whether Classics, a reputation label rather than a theme, should stay.

**Why a SQL file.** Genres are just a field on each book; the genre filter, the Add book list and each shelf's "Top genres" line are worked out from the books, so they change by themselves and the app needs no new code. Tests check where each moved book ends up, that Add book only offers the new names, and that the file stops on a book it doesn't know.

*Considered:* Fantasy for the two Hunger Games books (Asad's first thought; they went to Science Fiction because the story is a dystopian future with no magic), and Romance for Thirteen Reasons Why (it's a drama about a teenager's death more than a love story).


## 30. Privacy notice, house rules and deleting your account

**Context.** Before inviting a local book club, the app needed what any service holding other people's data needs: a privacy notice, terms people agree to, and a way to leave. A review of the rules that apply concluded that the GDPR should be treated as applying even to a free, invite-only app among friends, because invitations spread beyond the people Asad knows. An Impressum and a cookie banner aren't needed while the app stays private and free: it stores nothing in the browser except the sign-in session.

**Decision.**
- **Privacy notice and house rules** are pages inside the app, linked from a footer on every page and from a new Account page (tap your name at the top). On the Join page they open in a pop-up, and joining needs a tick: "I'm 18 or older and accept the house rules." Members who joined earlier see the rules once, at their next visit, and accept them to carry on (Asad's choice). The database records which version each member accepted, and when; raising the version number in the code asks everyone again.
- **Contact details stay out of the code.** The notice has to say who runs the app and how to reach him, but the repository is public. So the postal address and email live in a database table that only members, and people holding a valid invitation link, can read (Asad's choice). For the same reason the notice isn't linked from the public sign-in page.
- **Delete my account**, on the Account page, once no books are out in either direction. Typing DELETE confirms it (Asad's choice). The sign-in, name, city, notes, Interested list and invitations are deleted. Past loans, reviews and replies stay, without a name: the app shows "Former member" (Asad's choice). A librarian's books leave the catalogue, and requests waiting for them are cancelled. The admin account can't be deleted from the app.

**Why most of this is in the database.** Until now, a member with any loan couldn't be deleted at all: the links from loans, reservations and copies to the member blocked it, while their reviews would have disappeared with them. `supabase/14_privacy_and_accounts.sql` changes those links to clear themselves instead. Deleting then works the same from the app and from the Supabase dashboard, librarians keep a correct history of their books, and replies under a departed member's review still make sense. Tests check what goes, what stays, and that nothing is deleted while a book is out.

*Considered:* writing the address into the code (simpler, but public on GitHub), a notice current members could close without accepting (no record that they agreed), and deleting reviews with the account (it would leave other people's replies hanging).


## 31. Library passes instead of one-time approval

**Context.** Since decision 23, a librarian approved someone once and they could reserve freely from then on. That approval came before the librarian knew how the person treated a book. While planning loan messages (decision 32), Asad wanted trust to be earned by a loan that went well, and wanted a measure of trust between members that's separate from how many books are lent.

**Decision (Asad's idea).** A librarian's trust is now a **library pass** (Asad chose the name over "membership", which already means anyone with an account, and over "library card").
- **Pass holders** reserve from that shelf without asking. Restricted books still need the librarian's OK each time.
- **Everyone else asks each time.** Every request waits for the librarian, with the same request card as before: the person's note, who invited them, which librarians have given them a pass, and how their loans have gone, plus how often they've borrowed from this shelf. The note is optional on every request; the first request to a librarian keeps "Remind Mira how you know each other", later ones ask "Anything Mira should know?".
- **Only pass holders see a librarian's Restricted Section.** To everyone else those books aren't on that shelf. The Libraries page says how many there are ("35 books, plus 5 for library pass holders"), so a shelf that's all Restricted doesn't look empty.
- **Two ways to a pass.** In the week after a book comes back (the week its message thread stays open), the lending desk asks "Give Sara a library pass?" ("Not now" only dismisses the question). Or the person asks for one on the Libraries page, which also covers a shelf that's all Restricted: without asking, nobody could ever borrow from it, so never earn a pass. After a "Not now" they can ask again after 3 months, or sooner once they've borrowed from that shelf. The note they see is warm and never says "you" (Asad's wording rule): "A library pass from Mira's shelf isn't on its way just yet."
- **Taking a pass back is final for the borrower** (Asad): there must be a good reason, and someone who suddenly had to ask each time would know anyway. So the shelf's card says plainly "Mira has taken back the library pass for this shelf", with no date, and the pass can't be asked for again. Only the librarian can give it again, from the Borrowers tab, and the question after a return isn't asked about them. "Stop lending" stays as the stronger option.
- **Lending in person gives no pass**, as it used to give approval. The "Lend to" list shows pass holders and anyone who has borrowed from you before.
- **Pick-up times and place** show to pass holders and to anyone with an approved request or a book out from that shelf, who needs to know where to go.
- **Nobody loses access:** everyone approved before now holds a pass. Requests waiting for a first-time approval became ordinary requests, keeping their notes.

**KPI.** Library passes measure depth of trust; loans measure activity. The sharper count is passes given to someone the librarian didn't invite: connections made through books.

**Why in the database.** `supabase/15_library_passes.sql` hides Restricted books in the database's own read rules (books, copies, the Restricted Section list and availability), so a member without a pass can't find them by any route, not just in the app. Tests check each rule, and that requests waiting when the file runs keep their notes.

*Considered:* offering "Ask for a library pass" only on shelves that are all Restricted (one rule everywhere is simpler, and lets old friends skip asking each time); telling someone their pass was taken back (Asad: quietly); counting only the books a non-holder can see on the Libraries page (an all-Restricted shelf would look empty); and taking a pass back quietly, with the person free to ask again straight away (Asad: it puts the librarian back in the same position, and the person would notice anyway).


## 32. Loan messages, and extending a loan

**Context.** The app told borrowers to "get in touch with Mira" without any way to do it, and pick-ups, questions about a reserved book and late returns all happened outside the app. Asad looked at three kinds of chat (messages about one loan, direct messages between any members, group rooms) and chose the smallest: a conversation about one specific loan. It covers what lending needs, keeps moderation close to zero, and keeps the app a library rather than a social network.

**Decision (Asad's choices).**
- **One conversation per reservation or loan**, between the borrower and the librarian, and nobody else. It opens when the reservation is confirmed: straight away for a pass holder, after the librarian's OK for everyone else. Lending a book in person opens one too.
- **Open until a week after the return**, so the two can talk about the book and, if it clicks, swap numbers: meeting people through books, while the friendship carries on outside the app. Then it's read-only; if the reservation is cancelled or declined before any lending, straight away.
- **Deleted a month after it turns read-only.** Both people see the whole timeline at the top of the conversation.
- **Text only, up to 1,000 characters.** No photos, read receipts or typing indicator. No editing; you can delete your own messages ("Message deleted"). No report button for now: the house rules say to email Asad if something's wrong.
- **Where it lives:** a Messages button on each reservation and loan (Borrowing lists and the lending desk), and a Messages page with an unread count in the menu. The page also keeps the conversation reachable in the week after a return, when the loan has left both lists.
- **Asad reads messages only if one of the two asks him to help** (privacy notice). When someone deletes their account, their messages stay in the other person's conversation as "Former member" until it's deleted.
- **"Extend by two weeks"** on the lending desk, for late returns agreed in a conversation, so the due date and the Overdue list stay right. The conversation notes the new date.
- **Notifications by push, not email** (Asad: people are wary of inbox noise), in a later pull request. Until then, the unread count in the menu, and new messages appear live in an open conversation.

**Why in the database.** `supabase/16_loan_messages.sql` opens and closes conversations from the reservations and loans themselves, so no screen can forget to; only the two people can read a conversation, and only through functions that check it's still open. Read-only is a date the database compares, and a nightly job (Supabase Cron) deletes conversations a month later, so the promise in the privacy notice doesn't depend on anyone remembering. The due date was fixed at four weeks after lending; it's now four weeks plus any extensions, still worked out by the database. Tests check every step of a conversation's life.

*Considered:* direct messages between any two members (needs requests from strangers, blocking and reporting, and a message from someone with no profile is just a name), group rooms per shelf or for the book club (turns the app into social media), email notifications (inbox noise, plus a domain and a sending service), and end-to-end encryption (a large build, and it would make helping with a problem impossible).


## 33. The Libraries page leads with the libraries

**Decision (Asad).** The first thing anyone sees on the Libraries page is the list of shelves. "Invite a friend" moves to the Account page (tap your name at the top), between your details and the house rules, with one line at the bottom of the Libraries page pointing there ("Want to bring a friend? Invite them from your account."). "Start your shelf", shown to members without a shelf, moves below the list too.

*Why.* The page is for finding shelves to borrow from; inviting and starting a shelf are occasional actions. The pointer keeps invitations easy to find, since the app grows by members inviting friends (decision 26).


## 34. Push notifications

**Context.** Loan messages, requests and due dates only help if people notice them. Asad chose push over email (decision 32): people are wary of inbox noise, and email needs a domain and a sending service.

**Decision.**
- **Per device, by choice:** "Turn on notifications" on the Account page, separately on each phone or computer; turning it off deletes that device's address. On an iPhone, push only works once the app is on the Home Screen, so the page says how.
- **What's sent** (Asad: every notification works the same way): a new message (only the first unread one, so a busy conversation doesn't buzz every minute), a new due date, a request to borrow or for a library pass (librarians), a request approved or a pass given (borrowers), a book due back in a week (borrowers, in the morning), and the question after a return (librarians, the morning after, if still unanswered: the librarian has just marked the return in the app, so asking again straight away would add nothing). Declines and passes taken back aren't pushed: the app already says so in its warm wording.
- **Never the message itself:** "New message about The Kite Runner. From Mira." Notifications show on lock screens.

**How it works.** The database decides who gets what (`supabase/17_push_notifications.sql`) and queues it; every minute a Supabase Cron job hands the queue to a small Edge Function (`supabase/functions/send-notifications`), which encrypts each notification so only that device can read it and sends it through the browser maker's push service (Google, Apple or Mozilla). The function never reads the database; devices the push service reports gone are forgotten. Anything that waited over an hour is dropped rather than sent late. Web Push is written by hand with the browser-standard Web Crypto API, so there's nothing to install on Supabase, and a test checks it byte for byte against the worked example in the standard (RFC 8291).

**Keys stay out of reach.** The push keys and the secret the database shares with the function are made on a small page in the owner's own browser (`push-keys.html`) and go straight into Supabase: never into the code, a pull request or a chat.

*Considered:* a push library on Supabase (more to trust and keep updated), email (inbox noise), notifying on every message (noisy), and sending from GitHub Actions on a timer (GitHub's timers can run late, which is fine for reminders but not for messages).


## 35. Book club meet-ups

**Context.** The app exists to connect people through books, and lending alone only connects two people at a time. Asad wanted a book club meet-up for the app's members, as a side feature with as little screen as possible: not an events section like Facebook or Meetup, just a way to announce the next meet-up and let people say they're coming. There's no set book: everyone brings what they're reading and presents it, which gives others books they then want to borrow.

**Decision (Asad's choices).**
- **One meet-up at a time, posted by Asad** from his Account page (date, start time in Berlin time, place, optional note). He can edit or cancel it before it starts, and post the next one as soon as the current one has started.
- **A card at the top of the Catalogue**, the page everyone lands on, until the end of the meet-up's day: "Next book club meet-up", the date and time, the place (opens Google Maps when tapped), the standing line "Bring the book you can't put down and tell everyone why it's got you hooked.", Asad's note, and **"Count me in"** ("You're in" and "Can't make it after all" once tapped).
- **Members see a number, not names** ("6 coming"); only Asad sees who. RSVPs reach him as a list on his Account page, without a notification each time.
- **Notifications:** one announcement to everyone with notifications on when a meet-up is posted, and a reminder the morning before to those coming. *Small calls (Claude; Asad may overrule):* those coming are also told if Asad moves the date, time or place, or cancels it, since they'd otherwise turn up to nothing; editing only the note sends nothing.
- **After the meet-up:** for a week, those who said they'd come see a nudge with a link to Add book. The app can't know which book someone presented, so librarians are asked only about one that's new to their shelf: "Presented a book that isn't on your shelf yet? Add it for the possibility to share with others." Members without a shelf see "Presented a book at the meet-up? Add it to your shelf for the possibility to share with others." with "Start your shelf with it". It goes once they add a book or tap "Hide this". This is how the presented books become borrowable, and how some members become librarians.
- **No limit on numbers.**
- **Names are deleted a week after the meet-up** (straight away if it's cancelled); only the total is kept, so Asad can see how many came to each meet-up without keeping who.

**KPI.** People who said they'd come per meet-up (kept after the names go), and books added by attendees in the week after: meet-ups turning into shelves.

**Why in the database.** `supabase/18_book_club_meetups.sql` keeps the meet-ups and the "Count me in" list out of members' reach entirely: members get the card from one function that returns a count, never names, and only the admin's functions return names. The one-at-a-time rule, the end of "Count me in" at midnight after the meet-up, the notifications and the deletion of names (a scheduled job every morning) live there too, so no screen can forget them. Times are stored as moments and always shown in Berlin time, so a meet-up posted from abroad still says 19:00. Tests check each rule.

*Considered:* a set book per meet-up, linked to the catalogue (the club has no set book); names for everyone, or only for those coming (more personal data on show, and a step towards the social features the app keeps out); a notification to Asad for every "Count me in" (he chose the list only); a place shown only to those coming (meet-ups are in public places); an events page with past and future meet-ups (more screen than the feature needs); a list of the presented books in the app (the nudge to shelve them does the job with less); and, for a librarian whose presented book is already on their shelf, an "It's already on my shelf" button, the nudge only for members without a shelf, or asking which book they presented (Asad: rewording for librarians is enough).


## 36. The Restricted Section on Add book, and Add book on the Account page

**Context.** Putting a book in the Restricted Section took two visits: add it, then open it and tick the box in "Your shelf: only you see this". In between, the book was on the shelf for everyone, including people without the librarian's library pass, who aren't meant to see it at all. And Add book was only reachable from the Libraries page, which leads with everyone's shelves rather than your own.

**Decision (Asad's choices).**
- **A checkbox on both Add book forms**, for a new title and for "Add my copy": "Restricted Section: I approve each request". Unticked by default.
- **No reason on the form.** The stamp says "Ask the librarian" (the existing default) until the librarian picks one (Fragile copy, Sensitive content, Special copy) from the book's own page.
- **Saved in one step** in the database, so a Restricted book is never visible to people without a pass, not even for a moment, and can't end up on the shelf without its restriction.
- **"Your shelf" on the Account page**, right under Your details, for everyone: librarians see how many books are on their shelf and how many are Restricted, with "Add a book"; members without a shelf see "Add your first book", with the same words as "Start your shelf" on the Libraries page.
- *Small calls (Claude; Asad may overrule):* the Restricted Section stays per title, as it already was, so ticking it for a second copy covers all of that librarian's copies of the book, and the form says so. If the title is already Restricted on their shelf, the form shows "This title is in your Restricted Section, so this copy will be too" instead of the box. An unticked copy never lifts an existing restriction; that's done from the book's page. After adding, the confirmation says "…is on your shelf, in your Restricted Section".

**Why in the database.** `supabase/19_restricted_when_adding.sql` gives `add_book()` a last setting, `p_restricted`, and adds `add_copy()` for a copy of a title already in the catalogue (the app used to write that copy straight into the table). Each saves the restriction and the copy together or not at all. The setting is optional, so the app keeps working between running the file and merging. Tests check who sees a book added this way (the librarian, pass holders and the admin; nobody else) and that nothing is left half-saved.

*Considered:* a reason menu on the form, with no default or with "Fragile copy" preselected; saving the restriction from the app right after the book, without a SQL file (a moment in which everyone sees the book, and a book left unrestricted if the second step fails); a button at the top of the Account page instead of a section; and "Your shelf" for librarians only.

