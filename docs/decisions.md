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
