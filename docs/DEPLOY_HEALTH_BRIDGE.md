# Deploying the Apple Health bridge (Phase 2, milestone D)

> **Done on 20 Oct 2026.** Migration applied, `health-ingest` deployed, and
> Ante's iPhone connected (all eight metrics and Watch workouts arriving). Kept
> for redeploys and for setting up Abrar's phone (step 5 only).
>
> `SUPABASE_PROJECT_REF` must be the bare ref (`wfawgoljpabblmrlqcfk`), not the
> project URL; the commands below build URLs from it.

Everything for milestone D is built and tested locally (`npm test`,
`npm run test:db`, `npm run test:e2e`). What's left needs access to the live
Supabase project, which a session gets from its cloud environment:

- network access to `api.supabase.com` and `<project-ref>.supabase.co`;
- a Supabase access token, as a network secret for `api.supabase.com` or as the
  environment variable `SUPABASE_ACCESS_TOKEN` (never pasted into chat);
- the environment variable `SUPABASE_PROJECT_REF`.

## 1. Check access

```bash
echo "$SUPABASE_PROJECT_REF"
curl -sS https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF \
  ${SUPABASE_ACCESS_TOKEN:+-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"} | head -c 300
```

A JSON description of the project means it works. If the token is a network
secret, the proxy adds the header and the variable is empty; that's fine.

## 2. Apply any migrations the project doesn't have yet

Ante applied migrations by hand in the SQL editor up to some point. Check which
tables exist, then run only the missing files, in order, through the Management
API's SQL endpoint:

```bash
q() { # run one SQL statement or file against the live database
  curl -sS -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
    ${SUPABASE_ACCESS_TOKEN:+-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"} \
    -H "Content-Type: application/json" \
    --data "$(jq -Rs '{query: .}')"
}
echo "select table_name from information_schema.tables where table_schema = 'public' order by 1;" | q
echo "select column_name from information_schema.columns where table_name = 'exercises' and column_name = 'merged_into';" | q
```

| File | Present when |
|---|---|
| `20261019000000_phase1.sql` | `programs`, `sets` … exist |
| `20261021000000_exercise_merge.sql` | `exercises.merged_into` exists |
| `20261022000000_goals_and_health.sql` | `daily_goals`, `health_samples` exist |
| `20261023000000_health_bridge.sql` | `ingest_tokens`, `health_workouts` exist |

Apply a missing one with `q < supabase/migrations/<file>.sql`. Afterwards,
check RLS is on everywhere:

```bash
echo "select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;" | q
```

## 3. Deploy the Edge Function

```bash
npx supabase@2 functions deploy health-ingest \
  --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt --use-api
```

- `--no-verify-jwt` (also set in `supabase/config.toml`): Health Auto Export
  can't send a Supabase session; the function checks its own ingest token.
- `--use-api` bundles on Supabase's side, so Docker isn't needed. If an older
  CLI doesn't know the flag, update the CLI rather than dropping it.
- The function uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which hosted
  Edge Functions get automatically. If the project has moved to the new API
  keys and the service role variable is empty, add a secret with
  `npx supabase@2 secrets set ...` and adjust `health-ingest/index.ts`.

## 4. Smoke test

```bash
curl -sS -X POST "https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1/health-ingest" \
  -H "Content-Type: application/json" --data '{}'
# expect: {"error":"Missing x-ingest-token header"}
```

## 5. Connect Health Auto Export (with Ante, on his iPhone)

1. Spotter → Program → Settings & Apple Health → **Create a token**. Copy it.
2. Follow **How to set up Health Auto Export** on that screen (two
   automations: Health Metrics and Workouts; REST API; JSON v2; aggregated by
   day; header `X-Ingest-Token`; routes, ECG, cycle tracking, medications,
   symptoms and state of mind off).
   Also give Health Auto Export **read access** to those metrics (Health app →
   picture → Apps → Health Auto Export). Without it iOS silently leaves them
   out: that's why the first exports had no weight, lean mass or resting HR.
3. Run each automation's manual sync. **Last received** should update.
4. Check on the server:
   ```bash
   echo "select metric, local_date, value, unit, source from health_samples where source <> 'manual' order by recorded_at desc limit 20;" | q
   echo "select name, started_at, active_kcal, avg_hr, max_hr from health_workouts order by started_at desc limit 5;" | q
   ```

Then update `docs/SETUP.md` if anything differed, and close out milestone D.
