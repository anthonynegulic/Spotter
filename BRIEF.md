# Build Brief: Spotter (Workout & Health PWA)

> Name: **Spotter** (working name for a private app; several App Store apps already use it, so revisit before any public release). Drop this file in the repo root (or reference it from `CLAUDE.md`).
> Items marked **[DECISION]** are product decisions the owner (Ante) makes. Do not resolve them yourself; ask, or build so either answer can be slotted in later.

---

## 1. What we're building

A mobile-first Progressive Web App that turns an AI-written workout program into something you can track within seconds of pasting it in. It also tracks daily health goals and shows progress over time.

**The problem it solves:** we both train from programs written by Claude or ChatGPT. In Hevy, recreating those programs by hand was slow and clunky. Everything else in Hevy was fine. So the core value is **zero-effort program setup**, with logging and progress tracking at least as good as Hevy's.

**Users:** Ante and his wife Abrar from day one, each on separate programs with similar goals. Possibly Abrar's brother and a few friends later. Multi-user from the start; no public sign-up for now.

**Devices:** iPhone + Apple Watch for both users. The app is installed to the home screen via Safari.

**Timeline:** Ante is starting a ~60-day training block. Phase 1 needs to be usable as early as possible in that block. Keep it lean: charts and insights can come later, because they read from data that's been logged from day one. **Logging is what can't wait.**

---

## 2. Stack

- **Frontend:** Next.js (App Router) + React + TypeScript, Tailwind
- **Backend:** Supabase (Postgres, Auth, Row Level Security, Edge Functions, Storage), free tier
- **Hosting:** Vercel, free tier
- **Validation:** Zod (schemas shared between client and edge functions)
- **Charts:** Recharts
- **Offline:** service worker (e.g. Serwist) + IndexedDB (Dexie) as a local cache and write queue
- **LLM:** Anthropic API, called **only** from a Supabase Edge Function. The key is stored as a Supabase secret and never reaches the client. Model name read from an env var.

Note: Supabase free-tier projects can be paused after a period of inactivity (check current Supabase docs). Daily use prevents this. If it pauses during travel, it can be restored from the dashboard. No need to build a Firebase fallback.

---

## 3. Guiding principles

1. **Program setup should take under a minute:** paste JSON, preview, save.
2. **Logging a set should take under 3 seconds**, and the workout flow must work offline. Writes go to IndexedDB immediately and sync to Supabase. The server is the source of truth.
3. **Clean, uncluttered and easy to read at arm's length:** big touch targets, one-handed use, high contrast.
4. **Encouraging, never judgemental.** A weaker session is framed around showing up (sessions completed, consistency), never "you lifted less than last time".
5. **Health data is private.** RLS on every table; no user can read another user's rows. No analytics or third-party trackers.
6. **kg only.** Store everything in kg so lb can be added later as a display setting.

---

## 4. Phasing

| Phase | Scope | Target |
|---|---|---|
| **1. Core logging (MVP)** | Auth, JSON import + prompt snippet, today's workout, wheel pickers with last-time pre-fill, per-session swaps/skips, rest timer, cardio quick-log, offline sync | As early as possible in the training block |
| **2. Health & progress** | Health Auto Export bridge, daily goals (auto from Watch + manual protein), progress charts, PRs, plan editing, plan re-import as new version | Within the training block |
| **3. Coaching & polish** | In-app chat with history and goals, exercise library with muscle maps and form images, plate calculator, data export | After |

Build and ship each phase before starting the next. Phasing confirmed: full plan editing stays in Phase 2.

---

## 5. Features

### 5.1 Program import (P0, Phase 1)

Programs usually arrive as chat text from Claude or ChatGPT. The import flow is built around that.

**Requirements**
- The import screen shows a **copyable prompt snippet** that the user pastes into Claude/ChatGPT along with their program. The model replies with JSON in exactly our schema. This is the key to imports "just working".
- Import by **pasting into a textarea** (primary) or by file picker (secondary).
- Before parsing, strip code fences and any text around the JSON, since chat apps often wrap JSON in ```json blocks or add a sentence before it.
- Validate with Zod. On failure, show readable errors ("Day 2, exercise 3: `sets` must be a number"), not a stack trace.
- Be lenient where it's safe: `reps` can be a number or a range string like `"8-10"`; trim whitespace; ignore unknown fields.
- Preview the parsed program before saving.
- Each user can hold multiple programs, with one active.
- Exercises are normalised into an `exercises` table so history and charts follow an exercise across programs and versions.
- **Exercise matching runs silently at import. Don't add a confirmation step; import speed wins.** Match in this order:
  1. exact name (case-insensitive);
  2. a known alias;
  3. a high-confidence fuzzy match (e.g. "DB RDL" → Dumbbell Romanian Deadlift).
  Anything below the confidence threshold becomes a new exercise rather than risking a wrong merge. Every imported name that maps to an exercise is stored as an alias, so the next import matches exactly.
- The prompt snippet asks the AI to use standard, full exercise names. This keeps silent matching accurate.

**Program JSON schema (v1)**

```json
{
  "schemaVersion": 1,
  "name": "Pre-Penang Upper/Lower",
  "author": "Claude",
  "weeks": 8,
  "progressionNotes": "Add 2.5 kg when all sets hit the top of the rep range.",
  "days": [
    {
      "id": "upper-a",
      "name": "Upper A",
      "dayOfWeek": "Mon",
      "items": [
        {
          "type": "strength",
          "name": "Barbell Bench Press",
          "equipment": "barbell",
          "sets": 4,
          "reps": "6-8",
          "restSeconds": 150,
          "supersetGroup": null,
          "notes": "Pause first rep"
        },
        {
          "type": "cardio",
          "name": "Incline Treadmill Walk",
          "durationMinutes": 20,
          "notes": "Incline 10-12, speed 5-5.5 km/h"
        }
      ]
    }
  ]
}
```

- `type`: `strength | cardio`.
- `equipment` (strength only): `barbell | dumbbell | machine | cable | kettlebell | bodyweight | other`. Drives the weight-wheel increments.
- `supersetGroup`: exercises sharing a letter are performed as a superset.
- `dayOfWeek` is optional; programs can also run as a rotation.
- Programs mostly repeat week to week, so v1 has no per-week variations. `progressionNotes` is shown as guidance. Per-week overrides are a P2 schema extension; keep the schema versioned so this can be added later.

### 5.2 Program versions & editing (P1, Phase 2)

- **Re-import = new version.** When the AI revises a program, pasting the new JSON creates a new version of that program. Logged history is attached to exercises, not program versions, so nothing is lost. Show a simple diff before saving ("Bench Press: 4×6-8 → 5×5; Cable Fly added").
- **Full in-app editing:** add, remove and reorder days and exercises; edit sets, reps, rest and notes; swap an exercise. Editing must stay optional: the main path is import, and editing is for tweaks.
- **Merge exercises (P1):** from an exercise's detail screen, choose "Merge with…" to combine two exercises that are really the same. Their histories, PRs and aliases are combined. This is the safety net for silent matching.
- **Per-session changes (Phase 1):** swap, skip or reorder exercises for today's session only, without touching the program.

### 5.3 Today's workout screen (P0, Phase 1)

- Opens straight into today's session from the active program, or the next day in the rotation.
- Each exercise is a card showing target sets × reps, "Last time: 80 kg × 8, 8, 7", and set rows with tap-to-log.
- Supersets are visually grouped.
- Cardio items get a simple log: duration (pre-filled from the program), plus optional incline, speed and distance.
- **Working sets only.** Warm-ups are not logged.
- "Finish workout" summary: duration, total volume, sets completed, any PRs. The tone is encouraging whatever the numbers.

### 5.4 Weight & rep selection via scroll wheel (P0, Phase 1)

- An iOS-style vertical wheel picker (snap scrolling, momentum) for weight and reps, side by side in a bottom sheet.
- Weight increments depend on equipment and can be edited per exercise: barbell 2.5 kg, dumbbell 2 kg, machine/cable 5 kg, kettlebell 4 kg; bodyweight shows added weight from 0.
- **Pre-fill from the same exercise and set number last session.** Logging an unchanged set is one tap.
- +/− nudge buttons for single-increment changes.
- Optional free-text note per set. No RPE/RIR in the UI.
- Build with CSS scroll-snap rather than a heavy library. It must be smooth on iPhone.

### 5.5 Rest timer (P0, Phase 1)

- Auto-starts when a set is logged, using the exercise's `restSeconds`.
- **Timestamp-based:** store the end time and compute what's left on each render, so the timer stays correct after the phone locks.
- A compact bar that stays visible while scrolling; +15s / −15s / skip.
- Notification on finish where supported (installed iOS PWAs, iOS 16.4+). This is a progressive enhancement; test on a real device.

### 5.6 Health data bridge (P1, Phase 2)

**Constraint:** a PWA cannot access HealthKit, and Renpho has no public API. Apple Watch and Renpho both write to Apple Health, so Apple Health is the single source.

**Chosen route: Health Auto Export** (third-party iOS app). Each user installs it on their own iPhone and sets up a REST API automation that posts to our endpoint. Confirm the purchased tier includes REST API automations. Each user needs Renpho's Apple Health sync turned on.

**Build**
- Supabase Edge Function `health-ingest`, authenticated with a **per-user ingest token**: generated in settings, shown once, revocable. Never the user's session token.
- Upsert into `health_samples`, keyed by `(user_id, metric, recorded_at, source)`, so re-sends don't create duplicates.
- Metrics: steps, active energy (calories burnt), exercise minutes, body weight, body fat %, BMI, lean/muscle mass, resting heart rate, and workouts (type, duration, calories, average and max HR).
- **Aggregate heart rate:** daily resting HR, plus average and max per workout. Don't store the raw HR stream, which is very high-volume.
- Settings page with setup instructions and a "last received" timestamp so a stalled sync is obvious.
- Watch workouts can optionally attach to the matching logged session by time overlap, adding calories and HR to the session summary.

Future escape hatch: if real-time HealthKit becomes essential, the app can be wrapped with Capacitor and a HealthKit plugin. Keep data access behind a small `healthSource` interface.

### 5.7 Daily goals (P1, Phase 2)

Each user starts with an editable default set:

| Goal | Source |
|---|---|
| Steps | Auto from health bridge, manual fallback |
| Active calories | Auto from health bridge, manual fallback |
| Exercise minutes | Auto from health bridge, manual fallback |
| Protein (g) | Manual quick-add (e.g. +20 g, +30 g, custom) |
| Water (ml) | Manual quick-add, optional |

- Users can edit targets, hide goals and add simple custom yes/no goals.
- Protein is rough by design: quick-add amounts, no food database.
- Goals reset at local midnight (timezone stored per user, so travel is handled).
- Streak/consistency view per goal.

### 5.8 Progress charts (P1, Phase 2)

Per exercise:
- **Estimated 1RM** over time (Epley: `weight × (1 + reps / 30)`, using the best set per session). This is the headline chart.
- Top-set weight over time.
- Session volume (sets × reps × weight).
- Ranges: 4 weeks / 3 months / 6 months / all.

Overall:
- Sessions per week and weekly volume. Consistency is front and centre.
- PR list, with a small celebration moment when a PR is logged mid-session.
- Body weight and body composition trends from Renpho via Apple Health.
- Daily activity trends: steps, calories, exercise minutes.

### 5.9 Coaching chat (P1, Phase 3)

Used mid-set ("what can I swap for this?") and when reviewing progress ("why am I stalling on bench?").

- Reachable from the home and today's workout screens, collapsed by default so it never covers logging controls.
- Client → Supabase Edge Function → Anthropic API, with streamed responses.
- **Context injected automatically:**
  - the user's goals (a free-text profile field, plus optional target weight and date);
  - the active program;
  - the exercise in focus, if any;
  - a summary of the last ~4 weeks of training, current PRs, and body weight trend.
  The user shouldn't have to explain their situation.
- Quick-prompt chips mid-session: "Swap this exercise", "Form cues", "Too heavy today?".
- System prompt: practical, encouraging coaching. For pain or injury, advise stopping the movement and seeing a professional rather than diagnosing.
- Per-user daily message cap: 30 messages per user per day.
- Chat history is saved, linked to the session where relevant.
- Needs a connection; show a clear offline state.

### 5.10 Exercise library: muscle maps & form images (P1, Phase 3)

These are the Hevy features Ante liked: visuals of the muscles each exercise targets, and form demonstrations.

- Seed an exercise reference library from an open dataset that includes primary/secondary muscles and form images (e.g. `free-exercise-db` on GitHub). **Verify the licence** before relying on it, especially if the app is ever shared beyond friends.
- Show a highlighted body map of the primary and secondary muscles (an SVG body-map component such as `react-body-highlighter`, licence to be verified).
- Form images: start/end position images, optionally cross-faded as a simple animation. Licensed animated GIF libraries are a possible later upgrade.
- Imported exercise names are fuzzy-matched to library entries. Unmatched exercises still work fully, and the user can link them manually. The prompt snippet can ask the AI to use standard exercise names to improve matching.

---

## 6. Smaller additions

- **Plate calculator** (P2): tap a barbell weight to see plates per side; bar weight configurable.
- **Data export** (P2): full JSON/CSV export.
- **Workout notes** (P0): free text per session.
- **Haptics:** iOS Safari doesn't support the Vibration API, so all feedback is visual. Logging a set needs a clear, satisfying visual confirmation.
- **Progressive overload hint** (P2): "You hit the top of your rep range on every set last time; try +2.5 kg." This can draw on `progressionNotes`.
- **Plan sharing between users** (P2).

---

## 7. Non-goals (v1)

- **Food database / full macro tracking.** Protein only, entered roughly.
- **Direct HealthKit or Renpho integration.** Not possible from a PWA; handled via Health Auto Export.
- **Public sign-up, social features, leaderboards.** Accounts are invited.
- **AI-generated programs inside the app.** Programs come in via import; the chat is for questions and coaching.
- **RPE/RIR tracking and warm-up logging.**
- **Native app store release.**

---

## 8. Data model (starting point)

- `profiles` (id, display_name, timezone, goals_text, target_weight_kg, target_date)
- `programs` (id, user_id, name, is_active, created_at)
- `program_versions` (id, program_id, version, author, raw_json, created_at)
- `program_days` / `program_items` (normalised from each version)
- `exercises` (id, user_id, name, equipment, increment_kg, library_ref)
- `exercise_aliases` (id, exercise_id, alias)
- `exercise_library` (id, name, aliases, primary_muscles, secondary_muscles, image_urls)
- `sessions` (id, user_id, program_day_id, started_at, finished_at, notes)
- `sets` (id, session_id, exercise_id, set_number, weight_kg, reps, note, logged_at)
- `cardio_entries` (id, session_id, name, duration_min, incline, speed_kmh, distance_km)
- `daily_goals` (id, user_id, type, label, target, unit, source, sort, hidden)
- `daily_entries` (id, user_id, goal_id, date, value)
- `health_samples` (id, user_id, metric, value, unit, recorded_at, source)
- `chat_messages` (id, user_id, session_id, role, content, created_at)
- `ingest_tokens` (id, user_id, token_hash, created_at, revoked_at)

RLS on every table: rows filtered on `user_id = auth.uid()`, joining through parent tables where needed. Row IDs are UUIDs generated on the device, so rows created offline sync without conflicts.

---

## 9. Phase 1 acceptance checks

- [ ] Installing via Safari "Add to Home Screen" launches full-screen with the correct icon.
- [ ] Pasting a chat reply containing JSON (with code fences and surrounding text) imports correctly. Invalid JSON shows specific, readable errors.
- [ ] Today's workout loads with airplane mode on.
- [ ] A set logged offline syncs without duplicates once the phone reconnects.
- [ ] The wheel pre-fills from the previous session, and logging an unchanged set takes one tap.
- [ ] The rest timer shows the correct remaining time after locking and unlocking the phone.
- [ ] Cardio can be logged in two taps when the program's duration is accepted as is.
- [ ] A second user cannot see the first user's programs or sets (tested with two accounts).

---

## 10. Design direction: "Balanced" (chosen)

Reference: direction B on the mockup canvas (today's workout screen). Treat it as the starting point, not a pixel spec.

- **Light mode primary.** A soft grey app background (`#F4F5F8`) with white cards on top. Clean and uncluttered.
- **Typeface:** Plus Jakarta Sans (400–800), with tabular figures for every number.
- **Colour roles:**
  - Primary accent, blue `#2A5FF0`: actions (Log set), logged-set checks, progress and data. White text on it.
  - Warm accent, orange `#FF7A1A`: the rest timer and PR badges. **Dark text on it** (white fails contrast).
  - Tinted chips for status and muscle groups (blue tint `#E6ECFF` / `#1E46C2`, orange tint `#FFEBDC` / `#8F3A00`).
  - Text `#15171C`, secondary text `#555C6B`.
  - Chart series: distinct, saturated colours, with blue and orange as the first two.
- **Shape:** rounded corners throughout. Cards 20px, inner panels 16px, buttons and inputs 12–14px, chips fully rounded.
- **Set logging pattern:**
  - Logged sets collapse into compact grey pills showing the weight × reps, a check, and a PR badge if it was one.
  - The current set sits in a tinted panel with "Last time" shown, weight and reps each with −/+ nudge buttons, and a full-width "Log set" button.
  - **Tapping the weight or reps value opens the scroll-wheel picker in a bottom sheet.**
- **Patterns:** familiar iOS conventions: a bottom tab bar (Today, Program, Progress, Goals) with a tinted pill marking the active tab, bottom sheets, and a floating "Ask coach" button.
- **Tone:** encouraging. Celebrate PRs. After weaker sessions, highlight consistency instead.
- **Process:** put the design tokens (colours, type scale, spacing, radius) in one place. Build wireframe-level UI in this style; Ante refines it from there.

---

## 11. Open decisions for Ante

1. Portfolio or not (decide at the end). Keep a lightweight `DECISIONS.md` as you go, so the option stays open at no real cost.

---

## 12. Working agreement for Claude Code

- Start with the Zod schema, the prompt snippet and the Supabase migrations, before any UI.
- Work phase by phase. Propose a task list for the current phase and confirm it before building.
- Raise **[DECISION]** items as questions rather than picking an answer.
- Log notable product or technical decisions in `DECISIONS.md`, with a sentence on why.
- Test anything involving install, offline, timers or notifications on a real iPhone. Desktop Chrome doesn't reliably reproduce iOS PWA behaviour.
