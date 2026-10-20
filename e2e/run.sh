#!/usr/bin/env bash
# End-to-end test of the Phase 1 flow:
#   real Postgres + PostgREST (so RLS is real), a small stand-in for Supabase
#   auth (e2e/gateway.mjs), the production static build with its service
#   worker, and headless Chromium emulating an iPhone.
# Needs: Postgres 15+ binaries, psql, Chromium (set CHROMIUM_PATH if Playwright
# can't find one). Downloads PostgREST on first run.
set -euo pipefail
cd "$(dirname "$0")/.."

WORK="${E2E_WORK:-$(mktemp -d)}"
mkdir -p "$WORK"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PG_BIN:$PATH"
export E2E_PG_PORT="${E2E_PG_PORT:-54330}"
PGRST_VERSION=12.2.8
PIDS=()

RUN_AS=()
[ "$(id -u)" = "0" ] && RUN_AS=(runuser -u postgres --)

cleanup() {
  for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done
  "${RUN_AS[@]}" pg_ctl -D "$WORK/pg" -m immediate stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [ ! -x "$WORK/postgrest" ]; then
  curl -sSL "https://github.com/PostgREST/postgrest/releases/download/v$PGRST_VERSION/postgrest-v$PGRST_VERSION-linux-static-x86-64.tar.xz" | tar xJ -C "$WORK"
fi

# Postgres with the Supabase auth stub and our migrations.
mkdir -p "$WORK/pg"
[ "$(id -u)" = "0" ] && chown -R postgres "$WORK" && chmod 755 "$WORK"
"${RUN_AS[@]}" initdb -D "$WORK/pg" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" pg_ctl -D "$WORK/pg" -o "-p $E2E_PG_PORT -k $WORK -c listen_addresses=127.0.0.1" -l "$WORK/pg.log" -w start >/dev/null
PSQL=(psql -h 127.0.0.1 -p "$E2E_PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -c "create database app"
"${PSQL[@]}" -d app -f supabase/tests/auth_stub.sql
"${PSQL[@]}" -d app -c "create role authenticator login noinherit; grant anon, authenticated, service_role to authenticator;"
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -d app -f "$f"; done
"${PSQL[@]}" -d app -c "insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a','ante@example.com'), ('00000000-0000-0000-0000-00000000000b','abrar@example.com')"

export E2E_JWT_SECRET="e2e-secret-e2e-secret-e2e-secret-0123"
cat > "$WORK/postgrest.conf" <<CONF
db-uri = "postgres://authenticator@127.0.0.1:$E2E_PG_PORT/app"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$E2E_JWT_SECRET"
server-port = 3001
server-host = "127.0.0.1"
CONF
"$WORK/postgrest" "$WORK/postgrest.conf" >"$WORK/postgrest.log" 2>&1 & PIDS+=($!)
node --experimental-strip-types --no-warnings e2e/gateway.mjs >"$WORK/gateway.log" 2>&1 & PIDS+=($!)

NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$(node e2e/gateway.mjs anon-key)" \
  npm run build >"$WORK/build.log" 2>&1
sleep 1
node_modules/.bin/serve out -l 3000 >"$WORK/serve.log" 2>&1 & PIDS+=($!)
sleep 3

node e2e/workout.e2e.mjs
node e2e/program.e2e.mjs
node e2e/goals.e2e.mjs
node e2e/progress.e2e.mjs
node e2e/health.e2e.mjs
