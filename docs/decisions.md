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
