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
- **Phase 2 order:** progress and PRs → program versions and editing → daily goals → Apple Health bridge.
- **Drops are shown, not hidden (overrides BRIEF.md §3.4 for charts).** Ante: a negative number can be motivating and is worth drawing attention to. Change chips show both directions; drops use the warm tint with a down arrow so they're noticed without reading as an error. The finish-workout summary still never compares sessions.
- **Re-import:** when a pasted program's name matches an existing one, the review screen offers "Update" (a new version, the default) or "Save as a new program". In-app edits also save as a new version.
- **The week counter carries on** across new versions ("Week 4 of 8" stays week 4), with a "Restart at week 1" option on the review screen.
- **Daily targets:** 10,000 steps; protein 2 g per kg of body weight, following the latest weigh-in from Apple Health (entered once by hand until that's flowing). All editable.

## Pre-fill and logging

- **Weight pre-fill** comes from today's previous set when there is one (so bumping the weight on set 1 carries through), else the same set number last time, else the equipment default. **Reps** come from the same set number last time, else today's previous set. If last time had fewer sets, an extra set copies last time's final set. This matches the "Set 3 · 82.5 kg / Last time 80 × 7" mockup.
- **Sessions start on the first action** (a logged set, swap, skip or note), not with a Start button, so logging an unchanged first set is still one tap.
- **Per-session changes live in the session's `plan`** (a JSON list of today's exercises). Swaps, skips, reordering, added exercises and extra sets change only today; the program is untouched.
- **Sets carry the plan item they were logged against (`item_key`)**, so the same exercise appearing twice in a day doesn't mix its sets.
- **Supersets alternate:** after logging A1 the focus moves to A2; the rest timer starts only when a full round is done.
- **Exercise increments are edited from the wheel sheet** ("Step" chips) and saved per exercise.
- **"Ask coach" and muscle chips from the mockups are left out until Phase 3**, rather than shipping buttons that do nothing.

## Progress

- **Charts:** Recharts for trend lines (estimated 1RM, top set, session volume); the weekly columns are plain HTML, which keeps their rounded tops crisp. One series per chart, the latest point marked in orange, tap for a tooltip.
- **Estimated 1RM per session** is the best set's Epley estimate; **top set** is the heaviest weight lifted that session.
- **Bodyweight lifts have no estimated 1RM.** It would be calculated from added weight only, which means nothing, so their detail screen starts on top set (added weight) and PR rows skip the 1RM.
- **Sessions per week** counts finished sessions; the average uses full weeks only, since the current week isn't over. For calendar programs the current week shows its target as a pale track ("This week 2 of 4").
- **PR history uses the same rules as the live badges** (`allPrs` is tested against `prsForSets`).
- **The PR celebration sits at the top of the screen** for 3.5 seconds, over the just-started rest timer, so it never covers Log set.

## Program versions, editing and merging

- **Every change is a new version.** Re-imports and in-app edits both save the next `program_versions` row, so the diff, history and the "Version 3, 21 Oct" label behave the same either way. Older versions are kept, not overwritten.
- **Diffs match days by id, then name, and exercises by name** (ignoring case, word order and plurals). A swapped exercise shows as one removed and one added, which is what it is.
- **The editor is a draft until "Review changes"**, which shows the same diff as a re-import and validates with the import schema before saving. Leaving with unsaved changes asks first.
- **Workouts already in progress keep their plan** when a new version lands; the next session uses the new one. Today's day is chosen by day id, so it survives versions.
- **Merging is one-way and can't be undone.** The picked exercise keeps its name; the other's sets, program items, in-progress plans and aliases move across, its name becomes an alias, and it's retired with `merged_into` pointing at the survivor. Aliases already on the survivor aren't duplicated (the server enforces one per exercise).
- **Merges repair themselves across phones.** After every pull, any set still pointing at a retired exercise (logged offline on another phone during the merge) is moved to where it went.

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
