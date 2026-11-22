#!/usr/bin/env bash
# Builds a throwaway copy of the database from the numbered SQL files, then
# runs every test_*.sql file against it. Stops at the first failure.
#
# Needs a PostgreSQL server; connection details come from the usual
# PGHOST / PGPORT / PGUSER / PGPASSWORD settings. GitHub runs this on every
# pull request (.github/workflows/database.yml).
#
#   bash supabase/tests/run.sh

set -euo pipefail
cd "$(dirname "$0")/.."        # the supabase folder

DB="${TEST_DB:-common_shelf_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null

run() {
  echo "  $1"
  "${PSQL[@]}" -d "$DB" -f "$1" >/dev/null
}

echo "Building the database:"
run tests/supabase_stub.sql
for file in [0-9][0-9]_*.sql; do
  case "$file" in *_PRIVATE.sql) continue ;; esac
  # 08 expects the library's first members to exist already.
  if [ "$file" = "08_multiple_libraries.sql" ]; then run tests/seed_before_08.sql; fi
  run "$file"
done
run tests/helpers.sql

for test in tests/test_*.sql; do
  echo
  echo "$test"
  "${PSQL[@]}" -d "$DB" -At -f "$test"
done

echo
echo "All database tests passed."
