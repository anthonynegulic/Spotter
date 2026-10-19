# Spotter

A mobile-first PWA that turns an AI-written workout program into something you
can log within seconds of pasting it in. Works offline at the gym, syncs to
Supabase when there's signal.

- Product brief: `BRIEF.md`
- Decisions: `DECISIONS.md`
- Setup (Supabase, Vercel, iPhone): `docs/SETUP.md`

## Develop

```bash
cp .env.example .env.local   # fill in your Supabase URL and anon key
npm install
npm run dev
```

Tests: `npm test` (unit), `npm run test:db` (RLS), `npm run test:e2e` (full flow).
