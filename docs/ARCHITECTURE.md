# Architecture

## Principles
- Everything that can be a web page is a web page, served by the Worker. The app exists
  for one reason: the run needs background GPS and background audio with the screen locked.
- One domain model in `shared/`, used by the API, the DB layer and the app.
- The native shell changes rarely; JavaScript ships over the air. See the native module list.
- The run works offline. The API is for identity, content download and results sync.
- Every piece must be validatable from a cloud session: unit tests, a local Worker, the
  app's web target under Playwright, and a simulated race.

## Stack
| Layer | Choice | Why |
|---|---|---|
| Domain | TypeScript, zod 4 | types inferred from schemas, shared by all workspaces |
| API + web | Cloudflare Worker, Hono, Hono JSX for server-rendered pages | cheap, fast, no build step for pages, local dev with wrangler |
| DB | Cloudflare D1 (SQLite), plain SQL with typed row schemas | small data, one region is fine |
| Files | Cloudflare R2: audio packs, GPS traces, certificates | |
| Email | Resend (magic codes, receipts) | one API call |
| App | Expo SDK 57, expo-router, React Native StyleSheet, Zustand, zod | current SDK, over-the-air updates via EAS Update |
| Location | expo-location + expo-task-manager (background) | |
| Audio | expo-audio with background mode | |
| Content | Claude (script writing, one-off), ElevenLabs TTS (French), cached MP3 in R2 | pre-produced per race |
| Errors | Sentry (app + worker) | crash visibility without a laptop |
| Builds | EAS Build (cloud), EAS Update (OTA), GitHub Actions | no Mac, no laptop |
| Tests | Vitest everywhere, Playwright against the web target and the Worker | |

Not used, on purpose: NativeWind/Tailwind, Clerk, Next.js, TanStack Query (fetch + Zustand
is enough for this surface), Mapbox in the app (see "Course diagram").

## Repo layout
```
shared/          @sivoov/shared: schemas/, domain/ (course projection, splits, pace, audio triggers), i18n/
api/             @sivoov/api: src/routes/ (api + pages), src/db/, migrations/, wrangler.toml, tests
app/             @sivoov/app: app/ (expo-router screens), src/{components,stores,services,audio}, tests
docs/
.github/workflows/  ci.yml (PR checks), preview.yml (EAS Update per PR), deploy.yml (main → prod)
.claude/         session hook + permissions for cloud sessions
```

## Domain model (v1)
```
race          id, slug, name, city, dates, window_start, window_end, theme(json), status
course        race_id, distance_key (marathon|half|10k), distance_m, gpx (R2), landmarks(json)
entrant       race_id, bib, email, first_name, last_name, distance_key, address(json), source
session       entrant_id, token_hash, expires_at            (magic code auth)
run           entrant_id, course_id, started_at, finished_at, status(planned|running|finished|uploaded|abandoned),
              elapsed_ms, distance_m, splits(json), source(app|upload), device(json)
run_trace     run_id → R2 object (raw GPS + audio events fired), for debugging and audit
audio_pack    course_id, version, manifest(json) → R2 objects (mp3), downloaded before the run
organizer     race_id, email                                (admin magic link)
```
Rows are validated by zod schemas in `shared/schemas/` on the way in and out of D1.

## Web surfaces (Worker, server-rendered)
- `/{race}`: landing. `/{race}/signin`: bib + email → code. `/{race}/app`: install.
- `/{race}/prepare`: course, trailer, instructions. `/{race}/results`, `/{race}/results/{bib}`
  (certificate, share image). `/{race}/upload`: GPX fallback.
- `/org/{race}`: organizer admin (entrants, runs, exports, imports).
- `/api/...`: JSON for the app. Auth by bearer session token.

## App surfaces (Expo)
Sign-in (email code) → Race home (your entry, your slot, download pack) → Prepare
(checks) → Run → Finish → Results (opens web). That is the whole app.

## Course diagram, not a map
The run screen shows the course as a stylized SVG polyline with landmarks, and the runner's
dot moving along it. No map tiles, no Mapbox native module, works on web, looks designed,
and reads better in the sun. Real maps appear only on web pages (static or MapLibre). If a
real map in the app turns out to matter, it is a recorded native-module decision.

## Native module list (changing this needs a new EAS build and a note here)
expo-location, expo-task-manager, expo-audio, expo-secure-store, expo-haptics,
expo-keep-awake, expo-updates, @sentry/react-native, react-native-svg,
react-native-reanimated, react-native-gesture-handler, react-native-screens,
react-native-safe-area-context. Nothing else without a recorded decision.

## Identity and stores
Reuse the existing Expo project (slug `sivoov`, owner `arthur.flam`) and bundle ids
`com.arthur.flam.sivoov{,.preview,.dev}` so the App Store record and credentials carry
over. The app name in stores stays "Sivoov".

## Environments
| | API | App |
|---|---|---|
| local | `wrangler dev`, local D1/R2, port 8788 | `expo start`, web target in the container |
| preview | `preview.run.sivoov.app` (Worker env `preview`) | dev client build, EAS Update channel `preview` + one branch per PR |
| production | `run.sivoov.app` | store build, EAS Update channel `production` |

## Simulation is a first-class mode
`shared/domain/simulate.ts` produces location updates from a course and a pace profile.
The app's location service is an interface with three implementations: device, simulation,
and trace replay (a recorded GPS trace from R2). Tests and Playwright runs use the last two.
