# Decisions

Notable product and technical decisions, with a line on why. Newest at the bottom of each section.

## Product (confirmed with Ante)

- **Sign-in is email and password; accounts are created in the Supabase dashboard; public sign-up is off.** Magic links open in Safari, not the installed home-screen app (separate storage), and Supabase's built-in email is heavily rate-limited.
- **No lock-screen rest notification in Phase 1.** iOS suspends a web app when the screen locks and has no way to schedule a local notification, so it would need server-sent web push (and signal at the time the set is logged). Phase 1 shows a clear on-screen alert; push can come later if it's missed.
- **Today, calendar programs:** today's scheduled day, otherwise a rest day with "Train anyway". Missed days earlier this week are listed first, so a missed Monday is offered before Tuesday's session.
- **Today, rotations:** the day after the last one completed, wrapping around.
- **"Last time"** is the most recent session of that exercise on the same program day, falling back to the most recent session anywhere.
- **Dumbbell weights are per dumbbell.** Volume = per-dumbbell weight × reps, not doubled. Bodyweight exercises record added weight, so their volume counts added weight only.
- **Unfinished sessions:** if a session from a previous day is still open when Today loads, Spotter asks to finish or discard it. Finishing stamps the time of the last thing logged, not "now".
- **No history:** the weight starts at 20 kg for barbell, 10 kg dumbbell, 20 kg machine, 15 kg cable, 12 kg kettlebell, 0 kg added for bodyweight. Reps start at the bottom of the range.
- **PRs** use the progress-chart definitions: heaviest weight and best estimated 1RM (Epley, `w × (1 + r/30)`). Equalling a record isn't a PR, and an exercise's first session has none (working up to a weight on day one isn't a record).
- **Portfolio or not:** open, decide at the end (BRIEF.md §11).

## Pre-fill and logging

- **Weight pre-fill** comes from today's previous set when there is one (so bumping the weight on set 1 carries through), else the same set number last time, else the equipment default. **Reps** come from the same set number last time, else today's previous set. If last time had fewer sets, an extra set copies last time's final set. This matches the "Set 3 · 82.5 kg / Last time 80 × 7" mockup.
- **Sessions start on the first action** (a logged set, swap, skip or note), not with a Start button, so logging an unchanged first set is still one tap.
- **Per-session changes live in the session's `plan`** (a JSON list of today's exercises). Swaps, skips, reordering, added exercises and extra sets change only today; the program is untouched.
- **Sets carry the plan item they were logged against (`item_key`)**, so the same exercise appearing twice in a day doesn't mix its sets.
- **Supersets alternate:** after logging A1 the focus moves to A2; the rest timer starts only when a full round is done.
- **Exercise increments are edited from the wheel sheet** ("Step" chips) and saved per exercise.
- **"Ask coach" and muscle chips from the mockups are left out until Phase 3**, rather than shipping buttons that do nothing.

## Import

- **Silent matching is conservative.** Exact name, then alias, then a fuzzy match only when every word lines up after expanding abbreviations (DB, BB, RDL, OHP…), ignoring word order and plurals, and allowing a one-letter typo in longer words. Different equipment never fuzzy-matches. Anything less certain becomes a new exercise; a duplicate can be merged in Phase 2, but a wrong merge silently corrupts history.
- **Lenient parsing:** numeric strings are accepted for numbers, `reps` accepts `8`, `"8-10"`, `"8–10"`, `"8 to 10"`, `"12 each side"` (the text goes to notes) and `"AMRAP"`; enum casing is ignored; unknown equipment becomes `other`; trailing commas and smart quotes are tolerated; a missing `type` is inferred; missing day ids are generated.
- **Timed holds** (planks) are logged as reps = seconds, with "seconds" in notes. A proper duration field for strength items is a schema v2 candidate.
- **One program can't be made "the only active one" by a database constraint.** Two phones activating different programs offline would make the second sync fail forever. Instead the most recently activated program wins.

## Offline and sync

- **Static export, hand-written service worker.** Next's static export gives every screen as plain files; `scripts/build-sw.mjs` precaches all of them under their clean URLs. That's about 100 lines we fully understand, versus a plugin layer on a very new Next.js version. The brief suggested Serwist as an example; this does the same job with fewer moving parts.
- **All data access is client-side.** Screens read from IndexedDB (Dexie) and never wait on the network, which is what makes Today open in airplane mode.
- **Writes go to IndexedDB and an outbox in one transaction.** The sync engine pushes the outbox in order, batching consecutive writes to a table into one upsert keyed on the device-generated UUID, so a retry after a dropped connection can't create duplicates. It then pulls rows changed since the last pull (by the server-set `updated_at`, with a 5-second overlap). Rows with unsynced local changes aren't overwritten by a pull.
- **A write that keeps failing (8 attempts) is parked** so it can't block everything behind it, and the Program → Account panel shows it.
- **Offline launches stay signed in** using the cached user id when the session can't be refreshed. Sync resumes when a fresh session is available.
- **Signing in as a different person on the same phone wipes the local cache first.**

## Database

- **Every table has `user_id`, checked directly by RLS** (`user_id = auth.uid()`), rather than joining through parents. Simpler policies, and each synced row stands alone.
- **Children reference parents by `(id, user_id)`**, so a row can never point at another user's parent, even with a guessed id.
- **Soft deletes (`deleted_at`) for workout data**, so deleting a set on one phone syncs to the other.
- **`anon` has no table access at all**; `authenticated` gets explicit grants. This doesn't rely on Supabase's default grants, which have changed over time.
- **Only Phase 1 tables exist so far.** Goals, health samples, chat and ingest tokens arrive with their phases.
- **Tested against plain Postgres** (`scripts/test-db.sh`) with a stub of Supabase's `auth` schema, plus an end-to-end run through PostgREST (`e2e/run.sh`), so RLS is exercised for real.
