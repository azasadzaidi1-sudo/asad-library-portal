# Asad's Library

A lending library for friends, built around my own bookshelves: 188 titles and 200 physical copies. Members browse the catalogue, see what's on the shelf, and (coming next) reserve books; I lend them out and get reminders when they're due back.

**Live site:** https://azasadzaidi1-sudo.github.io/asad-library-portal/ (members only: sign-in is by invitation)

## What it does so far

- Invite-only sign-in with email and password, and a first-visit form for the member's name and city.
- The full catalogue, searchable by title, author or series and filterable by genre, award and language.
- Live availability per book ("1 of 2 on the shelf", "All copies out, 2 in the queue"), without revealing who has borrowed what.
- A Restricted Section: books that need the librarian's approval, for their content or because the copy is fragile.

**Planned:** reservations with a waiting list, a librarian view (Available / Reserved / Lent out / Overdue), lending and returns, email reminders a week before a loan is due, cover images and members' reading lists.

## How it's built

| Part | Tool |
| --- | --- |
| Database and sign-in | [Supabase](https://supabase.com) (PostgreSQL with row-level security), hosted in Frankfurt |
| Website | React + Vite, published to GitHub Pages |
| Checks and deploys | GitHub Actions: tests and build on every pull request, deploy on merge |
| Tests | Vitest |

The house rules live in the database itself, not just in the website: one loan and one reservation per member, members only see their own loans, Restricted Section requests wait for approval, and a loan is due 28 days after it starts. Every choice, with the alternatives considered, is written up in [docs/decisions.md](docs/decisions.md).

## Repository layout

```
supabase/          SQL run in Supabase, in order: tables and rules, book import, availability
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
