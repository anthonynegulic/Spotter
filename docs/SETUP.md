# Setting up Spotter

One-off setup for Supabase, Vercel and the two iPhones. Dashboard labels move
around occasionally; if a menu name below doesn't match exactly, the setting
is nearby.

## 1. Supabase: create the tables

The schema is in `supabase/migrations/`. Either:

- **SQL editor (simplest):** open your project → **SQL Editor** → New query,
  paste the whole of `supabase/migrations/20261019000000_phase1.sql`, and run it.
  It should finish with "Success. No rows returned".
- **Supabase CLI:** `npx supabase link --project-ref <your-ref>` then
  `npx supabase db push`.

Run each new migration file once, in filename order, as later phases add them.

| File | Added in | What it does |
|---|---|---|
| `20261019000000_phase1.sql` | Phase 1 | All tables, privacy rules |
| `20261021000000_exercise_merge.sql` | Phase 2, milestone B | Lets exercises be merged ("Merge with…") |
| `20261022000000_goals_and_health.sql` | Phase 2, milestone C | Daily goals, their entries, body weight and Apple Health samples |
| `20261023000000_health_bridge.sql` | Phase 2, milestone D | Ingest tokens and Watch workouts for the Apple Health bridge |

The Apple Health bridge also needs the `health-ingest` Edge Function deployed;
see `docs/DEPLOY_HEALTH_BRIDGE.md`.

Supabase's SQL editor may warn that a query creates tables without RLS. The
Phase 1 file turns RLS on in a loop the checker can't see, so choosing "Run
with RLS" is fine.

## 2. Supabase: lock down sign-up

**Authentication → Sign In / Providers**:

- Keep **Email** enabled.
- Turn **off** "Allow new users to sign up". Accounts are invite-only.

Nothing needs email delivery: accounts are created in the dashboard and
confirmed there, so Supabase's built-in email limits don't matter.

## 3. Create the accounts (yours and Abrar's)

For each person: **Authentication → Users → Add user → Create new user**.

1. Enter their email and a password.
2. Tick **Auto Confirm User**.
3. Create.

A profile row is created automatically. To add someone later (Abrar's brother,
friends), repeat these steps. Each account only ever sees its own data.

To reset a forgotten password, open the user in the same list and set a new one.

## 4. Vercel

1. **Add New → Project**, import `anthonynegulic/Spotter`.
2. Leave the build settings alone: `vercel.json` sets them (static build into
   `out/`, clean URLs, no caching of the service worker).
3. **Settings → Environment Variables**, for Production and Preview:
   - `NEXT_PUBLIC_SUPABASE_URL`: Supabase → Project Settings → API (or
     Data API) → Project URL.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the **anon** key, or the newer
     **publishable** key (`sb_publishable_…`). Either works. Never use the
     service-role or secret key here.
4. Redeploy after adding the variables (they're baked in at build time).

**Which URL to use on the phone.** Preview deployments sit behind Vercel's
login by default, which gets in the way of a home-screen app. Use the
production URL (`<project>.vercel.app`).

**Check which branch production follows** under **Settings → Git → Production
Branch**. Vercel's default is `main`; if that branch doesn't exist, every push
becomes a Preview and the phone quietly stays on the old version (this is what
kept Phase 2 off the phone until 20 Oct 2026). To ship a specific build by
hand: **Deployments** → **⋯** on its row → **Promote to Production**.

After a new production build, open the home-screen app, wait about 10 seconds,
close it fully and reopen it to pick up the new version.

## 5. Install on iPhone

1. Open the production URL in **Safari** (not Chrome), with a connection.
2. Sign in once.
3. Share → **Add to Home Screen** → Add.
4. Open Spotter from the home screen. It launches full screen.

After the first launch it works with no signal: the app is cached on the phone
and anything you log is saved locally, then synced when you're back online.

Home-screen apps keep their own storage, separate from Safari. Signing in
inside Safari doesn't sign in the home-screen app, so sign in from the
installed app.

## 6. Phase 1 checks on a real phone

Desktop browsers don't reliably reproduce iOS home-screen behaviour, so these
need your iPhone:

- [ ] Add to Home Screen launches full screen with the blue Spotter icon.
- [ ] Paste a real chat reply (with the ```json fence and chat text) → imports.
- [ ] Airplane mode on, open Spotter from the home screen → Today loads.
- [ ] Log a set in airplane mode, turn it off → Program → Account shows
      "Everything's synced", and the set appears once (Supabase → Table Editor → sets).
- [ ] The second workout pre-fills from the first; logging an unchanged set is one tap.
- [ ] Start a rest timer, lock the phone for a minute, unlock → time is right.
- [ ] Cardio logs in two taps at the program's duration.
- [ ] Sign in as Abrar on her phone → she sees none of your programs or sets.

## 7. Apple Health (Health Auto Export)

Once the `health-ingest` function is deployed (`docs/DEPLOY_HEALTH_BRIDGE.md`),
each person sets this up on their own iPhone:

1. Spotter → Program → **Settings & Apple Health** → **Create a token**, and
   copy it (it's only shown once).
2. In Health Auto Export, follow **How to set up Health Auto Export** on that
   screen: one automation for Health Metrics and one for Workouts.
3. **Give Health Auto Export read access** to every metric it exports: Health
   app → your picture → **Apps** → **Health Auto Export**. iOS doesn't report a
   missing permission, it just leaves that metric out. This is why weight,
   lean mass and resting heart rate were missing from the first exports.
4. In each automation, **Manual Upload** → **Begin Export**. The response shows
   how many samples or workouts were saved, plus an `ignored` list of metric
   names Spotter doesn't keep (normally empty). Then check **Last received**
   updates in Spotter.

If "Last received" goes stale, open Health Auto Export: iOS only runs
background automations when it decides to. Tokens can be revoked from the same
screen.
