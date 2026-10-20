# Spotter

Workout and health PWA for a few invited users. The full product brief is in
`BRIEF.md`; product and technical decisions so far are in `DECISIONS.md`.
Setup steps for Supabase, Vercel and the phones are in `docs/SETUP.md`.

@AGENTS.md

## Working agreement

- Work phase by phase (BRIEF.md §4). Propose a task list for a phase and get it confirmed before building.
- Items marked [DECISION] in the brief are Ante's to make: ask, don't pick.
- Log notable decisions in `DECISIONS.md` with a sentence on why.
- Anything involving install, offline, timers or notifications needs testing on a real iPhone.
- Production (Vercel) deploys from `main`. Build on a `claude/...` branch and open a pull request into `main` per milestone; merging it is what ships to the phones.

## Shape of the code

- `src/lib/program/` – program JSON schema (Zod), extraction from chat replies, readable errors, the prompt snippet.
- `src/lib/exercises/match.ts` – silent exercise matching at import.
- `src/lib/db/` – Dexie cache + outbox (`local.ts`, `write.ts`), sync engine (`sync.ts`), operations (`repo.ts`), queries.
- `src/lib/workout/` – pure logic: pre-fill, PRs, schedule ("which day is today"), summary, rest timer.
- `src/components/workout/` – Today screen pieces. `src/app/` – routes (static export, client-rendered).
- `supabase/migrations/` – schema and RLS. Run in order.
- Design tokens live in `src/app/globals.css` (`@theme`). Use them, not raw colours.

## Commands

- `npm run dev` – local dev server (needs `.env.local`, see `.env.example`).
- `npm test` – unit tests (Vitest).
- `npm run test:db` – migrations + two-account RLS test on a throwaway local Postgres.
- `npm run test:e2e` – full flow in headless Chromium against real Postgres/PostgREST (see `e2e/run.sh`).
- `npm run build` – static export to `out/` plus the service worker.
- `npm run lint`, `npm run typecheck`.
