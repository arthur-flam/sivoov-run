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
| Files | Cloudflare R2: audio packs, GPS traces, share cards | |
| Email | Cloudflare Email Sending (`send_email` binding, zone sivoov.app) | no key, no provider account |
| App | Expo SDK 57, expo-router, React Native StyleSheet, Zustand, zod | current SDK, over-the-air updates via EAS Update |
| Location | expo-location + expo-task-manager (background) | |
| Audio | expo-audio with background mode | |
| Content | TTS by the script's voice: ElevenLabs (MP3) or Google Gemini TTS (native French, WAV, through the AI Gateway), cached in R2; produced sound mixed offline with ffmpeg (`api/tools/produce`: Gemini voice, BBC Sound Effects, Lyria music); LLM calls only through Cloudflare AI Gateway "sivoov" (Claude via `@anthropic-ai/sdk` on the gateway's Anthropic route with the key held by the gateway, Workers AI Llama 3.3 on the same gateway as the stand-in) for per-runner personal lines and the studio's suggestions; Open-Meteo (no key) for the weather in those lines | pre-produced per race; personal lines rendered per runner before the start or live, always with an offline version (AUDIO.md) |
| Maps | Mapbox Static Images, rendered by the Worker at `/api/courses/:id/map.png`, for the web pages and the race home (`?base=1`: the ground alone, framed by `fitView` in `shared/`, which the app draws the course and its places on); the run screen draws the course in 3D with `@rnmapbox/maps` (Mapbox Standard), Mapbox GL JS on the web target | the run should feel like being there; the public token comes with `/api/me` (`map.token`), so it is rotated in the Worker |
| Errors | Sentry (app + worker) | crash visibility without a laptop |
| Builds | EAS Build (cloud), EAS Update (OTA), GitHub Actions | no Mac, no laptop |
| Tests | Vitest everywhere (API tests run inside workerd via vitest-pool-workers), Playwright against the web target and the Worker | |
| Tools | `tsx` to run TypeScript scripts under `api/tools/` (dev dependency) | Node cannot load the shared package unaided |

Not used, on purpose: NativeWind/Tailwind, Clerk, Next.js, TanStack Query (fetch + Zustand
is enough for this surface).

## Repo layout
```
shared/          @sivoov/shared: schemas/, domain/ (course projection, splits, pace, audio triggers), i18n/
api/             @sivoov/api: src/routes/ (api + pages), src/pages/ (Hono JSX), src/db/, src/lib/, migrations/, tools/ (seed, audio), wrangler.jsonc, test/ (workerd), e2e/ (Playwright)
app/             @sivoov/app: app/ (expo-router screens), src/{components,stores,services/location,audio}, e2e/ (Playwright, web target)
docs/
.github/workflows/  ci.yml (PR checks), preview.yml (EAS Update per PR), deploy.yml (main → prod)
.claude/         session hook + permissions for cloud sessions
```

## Domain model (v1)
```
race          id, slug, name, city, dates, window_start, window_end, theme(json), status,
              demo_of (a demo race: the race whose courses and sound it plays),
              default_locale (fr|en: the runners' language until they choose, Réglages)
course        race_id, distance_key (marathon|half|10k), distance_m, gpx (R2), landmarks(json)
entrant       race_id, bib, email, first_name, last_name, distance_key, address(json), source,
              locale (fr|en, null until the runner chooses; per entry, like the slot)
session       entrant_id, token_hash, expires_at            (magic code auth)
run           entrant_id, course_id, started_at, finished_at, status(planned|running|finished|uploaded|abandoned),
              elapsed_ms, distance_m, splits(json), source(app|upload), device(json)
run_trace     run_id → R2 object (raw GPS + audio events fired), for debugging and audit
audio_pack    course_id, version, manifest(json) → R2 objects (mp3), downloaded before the run
audio_script  course_id, locale, version, script(json: lines with their French text + voice),
              updated_at                 (the organizer studio's draft; version = next publish)
organizer     race_id, email, role(owner|editor|viewer), name, invited_by   (race team)
photo_moment  race_id, title, at (start|finish|a landmark id), ask, scene, refs(json: R2 keys of the place's photos), sort
runner_photo  entrant_id, moment_id, selfie_key (R2, private), status(rendering|done|failed), result_key, attempts (3 max), shown
web_link      code_hash, entrant_id, expires_at, used_at   (the app opens a web page signed in, once, 5 min)
admin_session email, token_hash, expires_at    (one organizer sign-in for every race; codes in admin_codes)
lead          name, email, race, message, locale, handled_at   (the /organisateurs contact form)
```
Runner `session` rows also carry `client` (web|app), `device` and `last_seen_at`, so the admin can
tell who reached the app. `run` rows carry `excluded_at/excluded_reason/excluded_by`: a time the
organizer set aside never counts, and the app never writes those columns.
Rows are validated by zod schemas in `shared/schemas/` on the way in and out of D1.

## Web surfaces (Worker, server-rendered)
- `/`: the open races. `/organisateurs` (`?lang=en`, `/organizers` redirects): the page for race
  directors, with a contact form stored in `leads`. `/media/races/<raceId>/<sha256>.<ext>`: logos and
  photos uploaded in the admin (PNG, JPEG, WebP, immutable).
- `/{race}`: landing, with « Écoutez la course » when the main course has a demo reel
  (`/api/courses/:id/reel`, `reel.mp3` with byte ranges). `/{race}/signin`: bib + email → code. `/{race}/app`: install.
- `/{race}/prepare`: course, trailer, instructions. `/{race}/results` (ranked runs only: finished
  and started inside the window), `/{race}/results/{bib}` (the certificate: prints to PDF,
  shares the card, and invites every other visitor into the race).
- Share cards: `/{race}/card` and `/{race}/results/{bib}/card?format=og|post|story|sticker` are
  fixed-size pages (a finisher's is the race report: `raceReport` in `shared/`, timing points
  every 5 km on a marathon or half, 2 on a 10 km, the place at each from the field's own splits;
  the sticker is photographed with a transparent ground); the result page shows the picture
  itself above the certificate, with the four formats to pick from; `/{race}/og.png` and `/{race}/results/{bib}/card.png` are those pages photographed by
  Cloudflare Browser Rendering (REST API, `BROWSER_RENDERING_TOKEN`) and cached in R2 under
  `cards/`. They are the `og:image` of the landing and result pages; without the token the
  preview is the Mapbox course map. `/{race}/upload`: GPX fallback behind the web session, judged by
  the app's tracker (`evaluateUpload` in `shared/`), stored as a run with `source: upload`.
- `/{race}/photos`: the runner's photo moments (behind the web session): a selfie per moment,
  shrunk and stripped of EXIF in the browser (and EXIF stripped again in the Worker), sent with
  the runner's agreement to Gemini's image model (`GEMINI_IMAGE_MODEL`, default
  `gemini-2.5-flash-image`, through the AI Gateway) with the organizer's photos of the place and a
  prompt from `remixPrompt` (shared). R2: `selfies/<race>/<entrant>/<id>.<ext>` (never served but to
  its runner), `photos/<race>/<entrant>/<id>-<try>.<ext>` served by `/{race}/photos/<id>/picture`
  to its runner, to everyone once shown. The picture is made while the request waits (20-40 s;
  `claimRender` makes a double tap one render). A local Worker with no key hands the selfie back
  as the "picture" (`standIn`), for the pages and the screenshots. `/{race}/link?c=` turns a
  one-use code from `POST /api/me/web-link` into a web session (the app's « Mes photos de course »).
  The admin's « Photos » (`/org/{race}/photos`, editing needs `edit_audio`): moments, the place's
  photos, « Essayer avec votre photo » (rendered, shown once, kept nowhere). The app gets the
  moments on its course with `/api/me` (`photoMoments`) and shows « Moment photo » on the run
  screen for 500 m after each (`momentAt`).
- `/{race}/signin?next=/…`: returns to a same-site path after the code instead of the install page.
- `/org`: organizer admin. `/org/signin` (email + code, one session for every race of that
  email), `/org` (the person's races; staff see all, `/org/new` creates one, `/org/leads` lists
  contact requests). Per race, `/org/{race}`: home (numbers, latest activities, what is left
  to do), `runners`, `runs`, `courses`, `team`, `settings`, exports. Every route is guarded by
  `requireOrganizer` + `requireCan(action)` over the pure `can()` table in `shared/`
  (`domain/access.ts`); roles are owner, editor, viewer, and `STAFF_EMAILS` lists Sivoov staff.
  The admin has its own shell and component kit (`api/src/pages/org/adminLayout.tsx`, `ui.tsx`,
  `adminStyles.ts`), styled only through `api/src/pages/tokens.ts`.
  `/org/{race}/courses`: courses, GPX upload, and per course the audio **studio**
  (`/org/{race}/courses/{courseId}`): the course on a map with every audio event placed on it,
  the script editor, voice rendering and publishing. See AUDIO.md.
  The admin's two maps (the studio, a run's trace) are Mapbox GL JS loaded from Mapbox's CDN
  (`pages/org/mapboxGl.ts`, pinned version; Leaflet dropped 2026-09-26): pinch and wheel zoom,
  north up, the studio's map follows the announcement list as it scrolls, and `?map=svg` or no
  WebGL falls back to the server-drawn SVG.
- `/api/...`: JSON for the app. Auth by bearer session token.

## App surfaces (Expo)
Sign-in (email code) → Race home (your entry, your slot, download pack) → Prepare
(checks) → Run → Finish → Results (opens web). That is the whole app.

## The run screen's map
The run screen shows the course in 3D (`app/src/components/run/`): Mapbox Standard with its 3D
buildings, lit by the sun over the course at that hour (`lightPresetAt`), the course line split
where the runner is, the places along it. By default the camera stands just behind the runner,
pitched towards the horizon, and moves along the course as the real distance grows
(`followCamera`, `glideDistance` in `shared/domain/runView.ts`); the runner can switch to the
whole course or to the numbers alone (which also spares the battery). The same camera plan
drives both maps (`mapConfig.ts`): `RunMap.tsx` (native) and `RunMap.web.tsx` (Mapbox GL JS from
Mapbox's CDN, same pinned version as the admin, for the web target and the screenshots).

The course diagram (`CourseDiagram`, SVG, no tiles) stays the fallback: no token, no network with
nothing kept, a style that does not load (an error, or nothing within 6 s: offline the SDK may
never say), the runner's choice, and **a shell built before the
SDK**, which gets this JavaScript over the air without the native half: `mapboxSdk.ts` checks for
the native module before it even loads the package. The race home keeps the course on the phone
for offline runs (`useMapDownload`: a Mapbox offline region over the course, zoom 11-16).

## A run survives the app
The phone keeps the run in progress on disk (`app/src/stores/runJournal.ts`, `journalFiles.ts`):
`run/journal.json` (who, which course, the gun, the lines fired; rewritten) and `run/samples.jsonl`
(one fix per line, appended every 10 s) in the document dir. The tracker is a pure fold, so the
run *is* its fixes: when the app opens on a journal (`useRunRecovery` on the home screen), the run
is rebuilt by replaying them (`recoveryFor` in `shared/domain/runJournal.ts`) and goes on by
itself from where the runner is now, the clock never stopped: only the runner's hold-and-confirm
ends a run. When it is over (stopped, finished, silent for 2 h, older than 8 h) it is queued for
upload without a word. The panel « Votre course continue » (resume or stop and save) shows only
when the GPS will not start again. The audio pack starts coming down from the app's root as soon
as the runner is known, and the resume waits for it (4 s at most) so the race is said from it. The journal is cleared only once the upload queue holds the trace.

On Android the location service survives the app being swiped away (`killServiceOnDestroy:
false`): if the app's JavaScript survives too, the run goes on untouched and the screens come back
to it; if it does not, the background task runs on its own and appends the fixes to the journal
(`orphanFixes`), or switches off a GPS that no run will ever read. iOS stops updates when the app
is killed; the run resumes when it is reopened. A fix that bridges more than a minute without
fixes (a tunnel, a dark phone, a resume) drops the lines that fell due in the gap, bar the finish
(`bridgedGap`, `afterPause`): a late burst of old kilometres is worse than silence.

## Battery
The screen stays on before the gun and during the run, unless the battery is low (20 % off the
charger, or power saving): then the phone's own sleep takes over and the GPS goes to its saver
pace, once (Android: a fix every 2 s; iOS: best accuracy with a 5 m filter instead of the
navigation mode). The run clock and the map's glide stop redrawing while the app is in the
background. Readings are in the logbook (`batteryLog.ts`).

## Native module list (changing this needs a new EAS build and a note here)
expo-location, expo-task-manager, expo-audio, expo-secure-store, expo-haptics,
expo-keep-awake, expo-updates, @sentry/react-native, react-native-svg,
react-native-reanimated, react-native-gesture-handler, react-native-screens,
react-native-safe-area-context, expo-battery (pre-flight battery level check before a
multi-hour run; added 2026-09-13), expo-file-system (downloads the audio pack to the
document dir so a run never needs the network, a cold start included; added 2026-09-13), @rnmapbox/maps (the run screen's 3D map
and its offline region; Mapbox Maps SDK v11, no download token needed; added 2026-09-29, needs a
new EAS build to appear, older shells keep the diagram). Nothing else without a recorded decision.

## Identity and stores
Bundle id and package `app.sivoov.run{,.preview,.dev}` (2026-09-28: nothing was ever published
under the old `com.arthur.flam.sivoov` ids, and the owner wanted no personal name in them).
Store accounts are the company's (organization, D-U-N-S). The Expo project stays (slug `sivoov`,
owner `arthur.flam`): invisible to users, and it keeps the OTA channels. Name "Sivoov". iOS
declares no non-exempt encryption and an app-level privacy manifest (`app.config.ts`); the
location prompts are French and English (`app/locales/`). Runbook: STORES.md.

## Demo races
A demo race (`races.demo_of`) is a copy of a real race for the organizers' testers and App
Review: same name, dates and look (copied when staff press « Créer / Mettre à jour la démo »),
its own address (`<slug>-demo`), runners, runs, results and admin, a window open for two years,
never listed (`db.races()`), `noindex`. Its courses are the real race's: `coursesForRace` and
`courseFor` resolve them through `demo_of` (`db/courseRace.ts`), so the pack, personal lines,
geometry and reel are always the ones last published on the real race, with nothing copied.
Everything about runners stays keyed on the entrant's race (`e.race_id`), and the results are
per race and course (`resultsForCourse(raceId, courseId)`), so a demo run never shows in the
real race. App Review's runner (`review@example.com`, bib 9999) signs in with `REVIEW_CODE`,
only on a demo race. On a demo race's home the app offers the course in ten minutes as a
simulation (release builds too), stored as a simulation, never ranked.

## Runner sign-in
The email names the entry (`whichEntry` in shared): the race is asked only when the email holds
entries in several races, the bib only when two entries of one race share it (409 `ambiguous`).
Older app builds still send race and bib and still sign in.

## Runner language
In the app, `appLocale`: the runner's choice, else the phone's language when it is French or
English (`spokenLocale`), else the race's (`races.default_locale`, the organizer's « Langue des
coureurs » card in Réglages), else French. The server keeps the runner's language
(`entrants.locale`, per entry): what they chose, or their phone's, saved at their first sign-in
in the app; emails use `runnerLocale` (that, else the race's). It covers the app's screens and
the runner emails; the audio stays the course's pack. The admin stays French.
- **The app** (`stores/language.ts`): the picker (Français | English, each in its own language) is
  on the sign-in screen and the race home. The choice is kept on the phone (the sign-in screen and
  an offline start speak it) and sent to `PUT /api/me/locale`; a choice made before sign-in, or
  while the server was out of reach, is sent at the next `/me` (`reconcileLanguage`), a choice
  made elsewhere (the web, another phone) is taken from `/me`, and a runner with none gets the
  phone's language saved. `t()` reads the language at call
  time; each screen calls `useLocale()` once so everything it draws redraws on a change.
- **The code email** is written in the language of the screen that asked for it (`CodeRequest.locale`:
  the app's language, or the web page's); older apps that do not say get `runnerLocale`.
- **The instructions email** (the organizer's « Envoyer les instructions ») uses `runnerLocale`,
  and links to the race page with `?lang=en` for an English reader.
- **The web** keeps its own rule (`?lang=`, its cookie, Accept-Language); a runner who switched the
  site's language (the `lang` cookie) and then signs in there gets it saved as their choice.

## Environments
| | API | App |
|---|---|---|
| local | `wrangler dev --env local`, local D1/R2, port 8788 | `expo start`, web target in the container, `EXPO_PUBLIC_API_URL=http://localhost:8788` |
| preview | `preview.run.sivoov.app` (Worker `sivoov-run-preview`, D1 `sivoov-run-preview`, R2 `sivoov-run-files-preview`) | dev client build, EAS Update channel `preview` + one branch per PR |
| production | `run.sivoov.app` (Worker `sivoov-run`, D1 `sivoov-run`, R2 `sivoov-run-files`) | store build, EAS Update channel `production` |

`wrangler.jsonc`: the top level is production, `env.preview` and `env.local` override. Local
D1 and R2 live under `api/.wrangler/`. Seed any target with `npm run seed -w api -- <target>`.
Cloudflare account: arthur.flam@gmail.com's (id 6bd098851f5995454ecdbad6744c567c).

## Simulation is a first-class mode
`shared/domain/simulate.ts` produces location updates from a course and a pace profile.
The app's location service is an interface with three implementations: device, simulation,
and trace replay (a recorded GPS trace from R2). Tests and Playwright runs use the last two.
