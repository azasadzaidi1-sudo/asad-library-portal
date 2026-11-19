# Cover lookup

How the 188 books were matched to Open Library covers (decision 17 in `docs/decisions.md`).

1. `find_covers.py` searched Open Library by title and author for every book in `books.json` and drew contact sheets of the matches. 176 of 188 matched; checking the sheets by eye showed about 20 wrong or foreign-language covers.
2. `cover_candidates.py` collected up to nine alternative covers for those books (`second_pass_targets.json`), preferring editions in the book's language, and drew them in rows so the right one could be picked.
3. The chosen cover numbers went into `supabase/04_reservations_and_covers.sql`: 175 books have a cover, 13 show a placeholder.

The development workspace can't reach Open Library, so both scripts ran once on GitHub Actions from a temporary branch (Python 3.12 with `requests` and `pillow`). They send about one request a second and identify themselves with a User-Agent, as Open Library asks.
