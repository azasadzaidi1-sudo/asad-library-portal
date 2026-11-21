# The Common Shelf

A lending library for friends, started from my own bookshelves (188 titles, 200 physical copies) and opening up so friends can share theirs in one catalogue. Members browse every shelf, reserve books and borrow them in person; each librarian decides who borrows from them and keeps track of their own copies.

**Live site:** https://azasadzaidi1-sudo.github.io/asad-library-portal/ (members only: sign-in is by invitation)

## What it does so far

- Invite-only sign-in with email and password, and a first-visit form for the member's name and city.
- Several libraries in one catalogue: each copy belongs to a librarian, a "Libraries" page lists every shelf, and titles owned by several friends share one card ("2 libraries, 1 copy on the shelf").
- Trust between friends: the first time someone borrows from a librarian, the librarian sees a request card with the person's note, who invited them, which librarians already lend to them, and how their past loans went, and approves or declines. Librarians can stop lending to someone later.
- The full catalogue, searchable by title, author or series and filterable by library, genre, award and language.
- Live availability per book ("1 of 2 on the shelf", "All copies out, 2 in the queue"), without revealing who has borrowed what.
- A Restricted Section per librarian: titles that need that librarian's approval, with a reason such as a fragile copy.
- Cover images, a short spoiler-free description of every book, and a pop-up per book showing each library's copies, with the option to reserve from a chosen library (one book and one reservation per library, first come, first served) or mark it as interested.
- A "Borrowing lists" page with what a member has borrowed, reserved and marked as interested, from every library.
- Reviews with replies in each book's pop-up, spoiler warnings, and a "Borrowed from the library" badge for reviewers who read the library's copy.
- For each librarian, on their own shelf: requests to approve or decline, who has each copy and when it's due, the queue, who's interested, and their Restricted Section.
- A lending desk per librarian (Overdue / Reserved / Lent out / Available / Borrowers), with one-click lending of reserved books, lending without a reservation, returns, and stopping or restarting lending to someone.
- Add book: librarians search by title, author or ISBN, or scan the barcode with their phone camera. A title that's already in the catalogue gets their copy; a new one comes from Open Library with its cover, and its prizes are filled in automatically from Wikidata. Librarians can also remove copies; past loans are kept.

**Planned:** in-app invitations (only people who lend books can invite) with their own passwords, and reminders a week before a loan is due.

## How it's built

| Part | Tool |
| --- | --- |
| Database and sign-in | [Supabase](https://supabase.com) (PostgreSQL with row-level security), hosted in Frankfurt |
| Website | React + Vite, published to GitHub Pages |
| Checks and deploys | GitHub Actions: tests and build on every pull request, deploy on merge |
| Tests | Vitest |
| Book data | [Open Library](https://openlibrary.org/developers/api) (search, covers) and [Wikidata](https://www.wikidata.org) (prizes), called from the browser |

The house rules live in the database itself, not just in the website: one loan and one reservation per member per library, only a copy's owner can lend it, first-time borrowers and Restricted Section requests wait for the librarian's approval, members only see their own loans, borrowers' cities stay private, and a loan is due 28 days after it starts. Every choice, with the alternatives considered, is written up in [docs/decisions.md](docs/decisions.md).

## Repository layout

```
supabase/          SQL run in Supabase, in order (checklist in supabase/README.md): tables and rules,
                   book import, availability, reservations and covers, lending, descriptions,
                   reviews, several libraries, adding books
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

The app talks to the live Supabase project using its publishable key, which is safe to share; all data is protected by row-level security.

---

A hands-on project in AI-assisted ("vibe coding") app development, built with Claude as a pair programmer.
