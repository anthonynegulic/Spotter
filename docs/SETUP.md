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
production URL (`<project>.vercel.app`). Production deploys from the repo's
default branch; while Phase 1 is in progress that's the working branch
`claude/laughing-dirac-6lgztw`. You can check or change it under
**Settings → Git → Production Branch**.

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
