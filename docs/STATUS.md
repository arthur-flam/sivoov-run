# Status

Updated: 2026-09-12 (end of the bootstrap session). Race week: 14-15 November 2026.
See PRD section 8 for milestones.

## Where we are: M1 mostly done
Live: https://run.sivoov.app/deauville-2026 (production) and https://preview.run.sivoov.app
(preview, with test entrants: bib 1001 marc@example.com, 1002 lea@example.com,
1003 arthur.flam@gmail.com). Production has the race and courses, no entrants yet.

| Slice | State |
|---|---|
| 1. `shared/` schemas + domain | Done. 51 tests. Tracker holds ~1% distance error at 8 m simulated noise. |
| 2. `api/` Worker, D1, auth, pages | Done and deployed. 14 workerd tests, 3 Playwright screenshots. Codes print to the Worker log until `RESEND_API_KEY` is set (`wrangler secret put`). |
| 3. `app/` sign-in, home, run (simulation) | Done on the web target: Playwright signs in and runs a simulated half at ×60. Device GPS is foreground-only. |
| 4. EAS | `eas.json` written (development / preview / production, channels, `EXPO_PUBLIC_API_URL`). No build yet: needs the laptop session (WORKFLOW.md). |
| 5. Audio pack v0 | Event list exists in the app (`src/audio/pack.ts`) and fires in the trace; the screen shows a caption. No files, no TTS pipeline yet. |

## Next, in order
1. Resend: create the API key, `wrangler secret put RESEND_API_KEY` for both envs (and
   `EMAIL_FROM`), verify the domain. Until then nobody can sign in on production.
2. Audio pipeline (`api/tools/audio/`): brief → script (Claude) → ElevenLabs → R2 → `audio_packs`
   row; `GET /api/courses/:id/pack`; download + playback in the app with expo-audio
   (background mode), the caption becomes real sound. Ceremony placeholders + landmarks.
3. Device slice: background location with expo-task-manager, permission flow ("always"),
   pre-flight checks (GPS lock, battery, headphones), run upload with the trace at the finish
   (`PUT /api/runs/:id`), offline queue.
4. First EAS development build from the laptop session, then everything over the air.
5. Organizer admin (`/org/:slug`): CSV import (idempotent on bib), exports; certificate page;
   GPX upload fallback.
6. Web polish: hero photo and real theme from the organizer, English copy review, OG image.

## Decisions taken this session
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
- Resend vs Cloudflare Email Service for the codes (the account has Email Sending enabled).
- See PRD section 10 and DESIGN.md open decisions.

## Known gaps
- No production entrants: import the organizer's CSV (admin slice) or seed by hand.
- The app's `Link` to the simulation on the home screen is a dev affordance; hide it behind
  `__DEV__` before the store build.
- `run.tsx` uploads nothing yet; the finish screen shows the numbers only.
