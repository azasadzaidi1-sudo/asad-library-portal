# The Common Shelf

A lending library for friends, started from my own bookshelves (188 titles, 200 physical copies) and opening up so friends can share theirs in one catalogue. Members browse every shelf, reserve books and borrow them in person; each librarian decides who borrows from them and keeps track of their own copies.

**Live site:** https://azasadzaidi1-sudo.github.io/asad-library-portal/ (members only: sign-in is by invitation)

## What it does so far

- Invite-only: any member can create an invitation link (one person, 14 days) and send it however they like. The friend picks their own email and password on a Join page, and the database refuses any new account without a valid invitation.
- Several libraries in one catalogue: each copy belongs to a librarian, a "Libraries" page lists every shelf, and titles owned by several friends share one card ("2 libraries, 1 copy on the shelf").
- Shelf descriptions on the Libraries page: each shelf's top 3 genres, worked out from its books, plus two lines its librarian writes: the shelf's personality, and usual pick-up times and place (shown to their library pass holders and anyone whose request they've approved).
- Trust between friends, with library passes: a librarian OKs each request from someone without their pass, on a request card with the person's note, who invited them, which librarians have given them a pass, and how their past loans went. Pass holders reserve without asking and see that librarian's Restricted Section. A librarian can offer a pass in the week after a book comes back, or answer someone who asks for one; they can also take a pass back (it can't be asked for again), or stop lending to someone.
- The full catalogue, searchable by title, author or series and filterable by library, genre, award and language.
- Live availability per book ("1 of 2 on the shelf", "All copies out, 2 in the queue"), without revealing who has borrowed what.
- A Restricted Section per librarian: titles only their pass holders see, which need the librarian's approval each time, with a reason such as a fragile copy.
- Cover images, a short spoiler-free description of every book, and a pop-up per book showing each library's copies, with the option to reserve from a chosen library (one book and one reservation per library, first come, first served) or mark it as interested.
- Loan messages: a conversation between the borrower and the librarian about each reservation or loan, for the pick-up, questions and late returns. It stays open a week after the return, then turns read-only, and is deleted a month later. Librarians can extend a loan by two weeks.
- A "Borrowing lists" page with what a member has borrowed, reserved and marked as interested, from every library.
- Reviews with replies in each book's pop-up, spoiler warnings, and a "Borrowed from the library" badge for reviewers who read the library's copy.
- For each librarian, on their own shelf: requests to approve or decline, who has each copy and when it's due, the queue, who's interested, and their Restricted Section.
- A lending desk per librarian (Overdue / Reserved / Lent out / Available / Borrowers), with one-click lending of reserved books, lending without a reservation, returns, and stopping or restarting lending to someone.
- Add book: librarians search by title, author or ISBN, or scan the barcode with their phone camera. A title that's already in the catalogue gets their copy; a new one comes from Open Library with its cover, and its prizes are filled in automatically from Wikidata. Librarians can also remove copies; past loans are kept.

- A privacy notice and house rules: new members accept the rules on the Join page, current members once at their next visit, and the database records which version each person accepted. Members can delete their own account; past loans, reviews and replies stay without a name ("Former member").

- Push notifications, turned on per device in your account: new messages (the first unread one), requests and library passes, books due back in a week, and for librarians, the question after a return. They never show what a message says.

- Book club meet-ups: Asad posts the next one from his account, and a card at the top of the Catalogue shows when and where, with "Count me in". Members see how many are coming; only Asad sees who. Everyone brings the book they can't put down, and for a week afterwards those who came are nudged to add it to their shelf so others can borrow it. Names are deleted a week after each meet-up; the total stays.

**Planned:** changing and resetting passwords.

## How it's built

| Part | Tool |
| --- | --- |
| Database and sign-in | [Supabase](https://supabase.com) (PostgreSQL with row-level security), hosted in Frankfurt |
| Website | React + Vite, published to GitHub Pages |
| Checks and deploys | GitHub Actions: app tests, build and database tests on every pull request, deploy on merge |
| Tests | Vitest for the app's logic; SQL tests that rebuild the database from scratch and check its rules |
| Book data | [Open Library](https://openlibrary.org/developers/api) (search, covers) and [Wikidata](https://www.wikidata.org) (prizes), called from the browser |

The house rules live in the database itself, not just in the website: one loan and one reservation per member per library, only a copy's owner can lend it, requests from people without a library pass and Restricted Section requests wait for the librarian's approval, Restricted books are hidden from people without a pass, members only see their own loans, borrowers' cities stay private, and a loan is due 28 days after it starts. Every choice, with the alternatives considered, is written up in [docs/decisions.md](docs/decisions.md).

## Repository layout

```
supabase/          SQL run in Supabase, in order (checklist in supabase/README.md): tables and rules,
                   book import, availability, reservations and covers, lending, descriptions,
                   reviews, several libraries, adding books, invitations, shelf descriptions, clean-up,
                   genres, privacy and accounts, library passes, loan messages, push notifications,
                   book club meet-ups
  tests/           database tests: rebuild the database from those files and check its rules
  functions/       the Supabase Edge Function that sends push notifications
public/sw.js       the service worker: shows push notifications
public/push-keys.html  makes the notification keys, in the browser (setup only)
src/               the React app
  components/      screens and pieces of the page
  lib/             plain logic (filters, availability wording) and its tests
docs/decisions.md  the decision log
.github/workflows/ automatic checks and deployment
```

## Running it locally

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev     # opens a local preview
npm test        # runs the unit tests
```

The database tests need a PostgreSQL server (GitHub provides one for each pull request). With one running and the usual `PGHOST` / `PGUSER` / `PGPASSWORD` settings:

```bash
bash supabase/tests/run.sh
```

The app talks to the live Supabase project using its publishable key, which is safe to share; all data is protected by row-level security.

---

A hands-on project in AI-assisted ("vibe coding") app development, built with Claude as a pair programmer.
