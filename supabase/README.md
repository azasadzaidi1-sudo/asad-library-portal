# Database changes

Each file here changes the Supabase database once. They're numbered in the order they must run, which isn't the same as the pull request number: GitHub numbers every pull request, including ones with no database change (such as #7 and #9).

**How to run one:** Supabase → SQL Editor → New query → paste the whole file → Run. Run it *before* merging its pull request, because the new app code expects the database change to be there.

| File | What it changes | Pull request | Run in Supabase |
| --- | --- | --- | --- |
| `01_tables_and_rules.sql` | Tables for members, books, copies, reservations, loans and your reading tracker, and who may see or change what | #1 | Done |
| `02_import_books.sql` | Imports the 188 books and 200 copies, and the Restricted Section | #2 | Done |
| `03_book_availability.sql` | Lets members see how many copies are free, without seeing who has them | #3 | Done |
| `04_reservations_and_covers.sql` | Queue places for reservations, cover pictures, and the "Interested" list | #4 | Done |
| `05_lending.sql` | Lending a copy and closing the reservation in one step | #5 | Done |
| `06_descriptions.sql` | A short description for every book | #6 | Done |
| `07_reviews.sql` | Reviews and replies on each book | #8 | Done |
| `08_multiple_libraries.sql` | Several libraries: copy owners, first-time borrower approvals, who invited whom, limits per library | #11 | Done |
| `09_add_books.sql` | Librarians add their own books (new titles or copies of existing ones) and remove copies | #12 | Done |
| `10_invites.sql` | Invitation links: any member invites a friend; new accounts need a valid link | #13 | Done |
| `11_shelf_descriptions.sql` | Shelf descriptions: a librarian's two lines (personality, pick-ups) and each shelf's top 3 genres | #14 | Done |
| `12_cleanup.sql` | Clean-up: removes columns and functions unused since several libraries; the admin-only rules use `is_admin()` | #16 | Done |
| `13_genre_cleanup.sql` | Genres from 23 to 18: Young Adult and Sports Fiction go, and Politics & Economics + Society & Futures, Philosophy + Spirituality, Self-Help + Language Learning merge | #17 | Done |
| `14_privacy_and_accounts.sql` | House rules: who accepted which version, and when. Contact details for the privacy notice, kept out of the code. "Delete my account": past loans, reviews and replies stay without a name ("Former member") | #18 | Done |
| `15_library_passes.sql` | Library passes: pass holders reserve without asking; everyone else asks each time; Restricted books only show to pass holders; asking for a pass, the question after a return | #19 | Done |
| `16_loan_messages.sql` | Loan messages: one conversation per reservation or loan, read-only a week after the return, deleted a month later (nightly job); "Extend by two weeks". Turn on Cron first (Integrations → Cron) | #20 | Done |

| `17_push_notifications.sql` | Push notifications: devices, the queue, what causes a notification (messages, requests, passes, due dates, the question after a return), the every-minute sending job and the morning job. Then the setup below | #22 | **Not yet: run, merge #22, then the setup below** |

When a pull request adds a new file, it gets the next number and a new row here.

## Push notifications: the setup (once)

17 only queues notifications. Sending them needs a small function on Supabase and three keys. About ten minutes:

1. **Run 17** (above), then **merge #22**. The check at the end should say `notification_jobs_scheduled: true` and `keys_saved: false`. Until step 5, nothing is sent and the Account page says notifications aren't switched on yet.
2. **Make the keys:** open https://azasadzaidi1-sudo.github.io/asad-library-portal/push-keys.html and tap "Make the keys". They're made in your browser; keep the page open for steps 3 and 5.
3. **Secrets:** Supabase → Edge Functions → Secrets → add the four the page shows: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NOTIFY_SECRET`, and `VAPID_SUBJECT` (`mailto:` followed by your email address).
4. **The sending function:** Supabase → Edge Functions → Deploy a new function → Via Editor. Name it exactly `send-notifications`, replace the example code with the whole of `functions/send-notifications/index.ts`, and Deploy. Then open the function's settings and turn **off** "Verify JWT" (or "Enforce JWT verification"): the database calls it with the shared secret instead.
5. **Save the keys in the database:** Supabase → SQL Editor → New query → paste the line the keys page shows (`select public.save_push_setup(...)`) → Run.
6. **Try it:** in the app, tap your name → Notifications → Turn on notifications → Send me a test notification. It should arrive within a minute. On an iPhone, add the app to the Home Screen first and open it from there.

The private key and the shared secret are passwords: they only go into Supabase (steps 3 and 5), never into the code, a pull request or a chat. If you ever need new keys, make them again, repeat steps 3 and 5, and everyone turns notifications on again.

Checking on it later: Integrations → Cron shows the `send-notifications` job (every minute) and `morning-notifications` (08:07 UTC); Edge Functions → send-notifications → Logs shows each batch sent.

## Tests

`tests/` checks the database rules automatically. On every pull request GitHub builds a throwaway copy of the database from these numbered files, in order, then runs each `tests/test_*.sql` file against it. Every line of a test is a sentence like "only a copy's owner can lend it"; if one isn't true, the check turns red and names it.

- `supabase_stub.sql` stands in for the bits of Supabase the files rely on (sign-ups and who is signed in)
- `send-notifications.test.js` (in `functions/send-notifications`, run with the app tests) checks the sending function's encryption against the worked example in the Web Push standard (RFC 8291)
- `seed_before_08.sql` and `people.sql` are made-up members (all fictional apart from Asad's name); `seed_before_15.sql` adds a first-time request that's waiting when 15 runs, like the live library has
- `helpers.sql` has the small tools the tests use (`tests.ok`, `tests.fails`, `tests.sign_in`, `tests.join`)

When a new SQL file adds or changes a rule, its pull request adds tests for it too.

Files ending in `_PRIVATE.sql` (such as member details) are never committed; `.gitignore` keeps them out of the repository.
