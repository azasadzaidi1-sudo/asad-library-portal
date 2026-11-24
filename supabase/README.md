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

When a pull request adds a new file, it gets the next number and a new row here.

## Tests

`tests/` checks the database rules automatically. On every pull request GitHub builds a throwaway copy of the database from these numbered files, in order, then runs each `tests/test_*.sql` file against it. Every line of a test is a sentence like "only a copy's owner can lend it"; if one isn't true, the check turns red and names it.

- `supabase_stub.sql` stands in for the bits of Supabase the files rely on (sign-ups and who is signed in)
- `seed_before_08.sql` and `people.sql` are made-up members (all fictional apart from Asad's name)
- `helpers.sql` has the small tools the tests use (`tests.ok`, `tests.fails`, `tests.sign_in`, `tests.join`)

When a new SQL file adds or changes a rule, its pull request adds tests for it too.

Files ending in `_PRIVATE.sql` (such as member details) are never committed; `.gitignore` keeps them out of the repository.
