#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres (with a stub of
# Supabase's auth schema) and runs the RLS tests. Needs Postgres 15+ binaries.
set -euo pipefail
cd "$(dirname "$0")/.."

PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PG_BIN:$PATH"
DATA="$(mktemp -d)"
PORT="${PGPORT:-54329}"

RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$DATA"
  RUN_AS=(runuser -u postgres --)
fi
trap '"${RUN_AS[@]}" pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT

"${RUN_AS[@]}" initdb -D "$DATA" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" pg_ctl -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=''" -w start >/dev/null

PSQL=(psql -h /tmp -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -c "create database spotter_test"
"${PSQL[@]}" -d spotter_test -f supabase/tests/auth_stub.sql
for f in supabase/migrations/*.sql; do
  "${PSQL[@]}" -d spotter_test -f "$f"
done
"${PSQL[@]}" -d spotter_test -f supabase/tests/rls_test.sql
