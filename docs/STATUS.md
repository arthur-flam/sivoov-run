# Status

Updated: 2026-09-13 (session 2: email, access, map, audio, device, admin). Race week: 14-15 November 2026.
See PRD section 8 for milestones.

## Where we are: M1 mostly done
Live: https://run.sivoov.app/deauville-2026 (production) and https://preview.run.sivoov.app
(preview). How to sign in as a test runner or organizer on local/preview: `docs/ACCESS.md`.
Production has the race and courses, no entrants yet.

| Slice | State |
|---|---|
| 1. `shared/` schemas + domain | Done. 51 tests. Tracker holds ~1% distance error at 8 m simulated noise. |
| 2. `api/` Worker, D1, auth, pages | Done and deployed. Sign-in codes go out through Cloudflare Email Sending (`EMAIL` binding, zone sivoov.app); local/preview also accept the fixed test code for @example.com accounts. Landing page shows the real course on a Mapbox static map (`/api/courses/:id/map.png`). |
| 3. `app/` sign-in, home, run (simulation) | Done on the web target: Playwright signs in and runs a simulated half at ×60. Home shows the course map (Mapbox PNG via the Worker). |
| 4. EAS | `eas.json` written (development / preview / production, channels, `EXPO_PUBLIC_API_URL`). No build yet: needs the laptop session (WORKFLOW.md). Native modules added this session (all need that first build): expo-file-system, expo-battery. |
| 5. Audio pack v0 | Done. `api/tools/audio/` (typed French script → ElevenLabs → R2 → `audio_packs`), `npm run audio:build -w api -- <env>`. Pack `deauville-2026-marathon/1/fr` (13 events, 12 MP3, 1.85 MB) is in preview and production R2 + D1. `GET /api/courses/:id/pack` and `/api/packs/...` serve it; the app downloads it (expo-file-system) and plays it with expo-audio (background, ducking, mix/priority queue). Km splits are caption-only. Not yet heard on a device. |
| 6. Device slice | Done on the web target. Background location (expo-task-manager task, Android foreground service, "always" flow), `/prepare` pre-flight (GPS lock, permission, battery, headphones), finish uploads `PUT /api/runs/:id` + trace to R2, offline queue persisted and retried on foreground. Not tested on a device. |
| 7. Organizer admin | Done and on preview: `/org/deauville-2026` (email code sign-in, counts, entrant list with search, CSV import idempotent on bib with a rejection report, entrants/results CSV exports), CLI `npm run import:entrants -w api -- <env> <file.csv>`. 6 workerd tests, Playwright screenshots. |

## Next, in order
1. Production catch-up (blocked from this session by the permission classifier, run from a laptop
   or an interactive session):
   `npm run db:migrate:production -w api && npm run seed -w api -- production && npm run deploy -w api`.
   Until then production has the old Worker (no pack route, no map, no admin) and sign-in still
   logs codes instead of emailing them. Preview is fully deployed.
2. First EAS development build from the laptop session (WORKFLOW.md): the native list grew
   (expo-file-system, expo-battery) and background location/audio need a real device. Then listen
   to the pack on a real run, fix the intro/countdown/gun sequencing against the visual countdown.
3. Move the pending-upload trace body from SecureStore to expo-file-system (a marathon trace is
   ~1 MB; SecureStore is not made for that). Keep only run + file path in SecureStore.
4. Import the organizer's real CSV into production through `/org/deauville-2026/import`.
5. Certificate page, GPX upload fallback, split audio (numbers as pre-rendered fragments).
6. Web polish: hero photo and real theme from the organizer, English copy review, OG image;
   English variant of the admin.

## Decisions taken 2026-09-13
- Email: Cloudflare Email Sending (`EMAIL` binding), Resend dropped. No provider key to manage.
- Test sign-in: `TEST_CODE=000000` on local and preview, accepted only for `@example.com`
  accounts (docs/ACCESS.md). Never on production.
- Maps: Mapbox Static Images rendered by the Worker (`/api/courses/:id/map.png`, token as a
  Worker secret) on the landing page and the app's race home. The run screen keeps the diagram;
  no Mapbox native module.
- Native modules added: expo-file-system (pack download, offline audio), expo-battery (pre-flight).
- ElevenLabs voice "George", `eleven_multilingual_v2`, French only for v0.
- Organizer sessions are a separate cookie (`org_session`, 30 days) and separate tables.

## Decisions taken 2026-09-12
- Progress on the virtual course is proportional: the runner covers the official distance
  (42 195 m) while the GPX measures 42.4 km; the finish line is the finish line.
- Distance honesty: filtered fixes (accuracy ≤ 30 m, ≤ 10 m/s, ≥ 8 m steps), step bounded by
  Doppler speed ±15%, constant-velocity Kalman on cumulative distance. Simulated noise is
  autocorrelated, like a receiver, not white.
- Sign-in on the web is plain form posts with a cookie session; the app uses the same code
  flow over JSON with a bearer token (180 days). Codes: 6 digits, 15 minutes, 5 attempts,
  5 per hour.
- The app is scoped to `deauville-2026` (`RACE_SLUG` in the session store) until a second
  race exists.
- `wrangler.jsonc` with top level = production, `env.preview`, `env.local`. New D1 databases
  and R2 buckets; the previous app's resources are untouched.
- Fonts in the app: Fraunces, DM Sans, Barlow Condensed via `@expo-google-fonts` (JS-only).
- Run screen is dark. Stop is a long press. Course diagram, no map.
- Native module list unchanged; nothing added. `expo-dev-client` is in the app for the
  development profile (it was in the previous app too).

## Decisions pending
- Whether preview keeps `preview.run.sivoov.app` (two-level subdomain, certificate took a
  few minutes) or moves to a one-level name.
- See PRD section 10 and DESIGN.md open decisions.

## Known gaps
- No production entrants: import the organizer's CSV (admin slice) or seed by hand.
- The app's `Link` to the simulation on the home screen is a dev affordance; hide it behind
  `__DEV__` before the store build.
- Nothing has run on a real phone yet: background location, background audio and the upload
  queue are validated on the web target and by tests only.
- The admin is French-only.
