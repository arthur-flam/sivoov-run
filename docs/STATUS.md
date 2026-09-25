# Status

Updated: 2026-09-25 (session 9: the finish line, results, certificate, share cards, upload
fallback, start ceremony; session 8: pre-field-test review fixes; session 7: audio experience brief + organizer studio; session 6: the no-laptop loop; session 5: the screenshot rig; session 4: phone testing on Android over USB; session 3: trace storage;
session 2: email, access, map, audio, device, admin; production deployed). Race week: 14-15 November 2026.
See PRD section 8 for milestones.

## Where we are: M1 done bar the moving tracker
Live: https://run.sivoov.app/deauville-2026 (production) and https://preview.run.sivoov.app
(preview). How to sign in as a test runner or organizer on local/preview: `docs/ACCESS.md`.
Production has the race and courses, no entrants yet.

| Slice | State |
|---|---|
| 1. `shared/` schemas + domain | Done. 51 tests. Tracker holds ~1% distance error at 8 m simulated noise. |
| 2. `api/` Worker, D1, auth, pages | Done and deployed. Sign-in codes go out through Cloudflare Email Sending (`EMAIL` binding, zone sivoov.app); local/preview also accept the fixed test code for @example.com accounts. Landing page shows the real course on a Mapbox static map (`/api/courses/:id/map.png`). |
| 3. `app/` sign-in, home, run (simulation) | Done on the web target: Playwright signs in and runs a simulated half at ×60. Home shows the course map (Mapbox PNG via the Worker). |
| 4. Native shell on Android | Built locally, no EAS: the laptop has the Android SDK and JDK 17, so `npm run device:build` prebuilds and installs `Sivoov (Dev)` (`com.arthur.flam.sivoov.dev`, pointed at preview) over a USB cable. Runbook: `docs/DEVICE.md`, wrapper: `scripts/device.sh`. `eas.json` still stands for iOS, shareable links and the store builds. |
| 5. Audio pack v0 | Done, and **heard on a phone** 2026-09-13. `api/tools/audio/` (typed French script → ElevenLabs → R2 → `audio_packs`), `npm run audio:build -w api -- <env>`. Pack `deauville-2026-marathon/1/fr` (13 events, 12 MP3, 1.85 MB) is in preview and production R2 + D1. `GET /api/courses/:id/pack` and `/api/packs/...` serve it; the app downloads it (expo-file-system) and plays it with expo-audio (background, ducking, mix/priority queue). Km splits are caption-only. |
| 6. Device slice | Done on the web target. Background location (expo-task-manager task, Android foreground service, "always" flow), `/prepare` pre-flight (GPS lock, permission, battery, headphones), finish uploads `PUT /api/runs/:id` + trace to R2, offline queue persisted and retried on foreground. Exercised on a Galaxy S23 on 2026-09-13: foreground service, audio, finish and upload all real; the tracker has still never seen a moving runner. |
| 7. Organizer admin | Done and on preview: `/org/deauville-2026` (email code sign-in, counts, entrant list with search, CSV import idempotent on bib with a rejection report, entrants/results CSV exports), CLI `npm run import:entrants -w api -- <env> <file.csv>`. 6 workerd tests, Playwright screenshots. |
| 9. The no-laptop loop | Done, and **proven on the phone** 2026-09-13. `Sivoov (Preview)` is a standalone release shell (`npm run device:preview`) that needs no metro: the bundle is in the APK and `expo-updates` is live on the `preview` channel, so a cloud session ships JS with `gh workflow run deploy.yml -f action=publish-preview`. The app keeps a device logbook (`app/src/diag.ts`) replacing `adb logcat`: read it on the phone (finish screen → Diagnostic, with Share), or from a session — it rides to R2 in the run's trace and `npm run trace:pull` prints it. CI typecheck and a too-tight workerd timeout fixed: CI and Deploy are **green for the first time since the repo began**, and Arthur created the three Actions secrets, so main now deploys the preview Worker and publishes the update by itself. |
| 10. Organizer studio (courses, GPX, audio script on a map) | Done, on preview (migration + seed + secret applied 2026-09-13; the Worker deploys from main). `/org/{race}/courses` (cards per course: trace, repères, brouillon, pack; GPX upload) and `/org/{race}/courses/{courseId}` — the studio: Leaflet + Mapbox tiles, one marker per audio event at its projected distance, click the course to add one there, target pace turning `elapsed`/`split` into positions, distance frise, per-event editor with autosave, `Écouter` (MP3 or browser voice), `Générer la voix` (ElevenLabs from the Worker, R2 cache at `tts/<hash>.mp3`), `Publier la version N` (pack + manifest + `audio_packs`, draft bumped). Migration `0005_audio_scripts`. 13 workerd tests, two new screenshots. The CLI (`npm run audio:build`) still works on the same shared schema. |
| 8. Screenshot rig | Done. `npm run shots` photographs 9 app screens and 8 web pages headlessly in ~70 s into `docs/shots/` with a contact sheet; `npm run shots:store` writes exact App Store (1290x2796) and Play (1080x1920) files with the dev chrome hidden. Presets include an English pass. Runbook: `docs/SHOTS.md`. |

## Session 8: review fixes before the field test
A code review of everything so far found ways a real run could be lost or corrupted. Fixed, each
with a test that fails on the old code:
- a run stopped early was uploaded as `finished`; the server now also refuses to rank simulated
  runs or finishes short of the distance, and a run id owned by another runner cannot be overwritten;
- the published audio pack landing after Start reset the run; Android's back button dropped it;
  leaving during the countdown left background GPS on; a refused permission left the store stuck;
- a cached pre-gun fix counted as distance; iOS fractional timestamps broke the upload schema;
- one unloadable audio file silenced the rest of the race;
- no network at a cold start meant no run (the last `/me` is now cached on disk); a hung
  request blocked the upload queue until restart (timeouts), and a run queued mid-flush waited
  for the next foreground;
- hard-coded French strings moved into the i18n dictionaries.
Not done: `tick()` still mixes the wall clock into `elapsedMs` between fixes (small split skew),
and the persisted upload entry still carries the splits in SecureStore.

## Session 9 — the finish line and the share (the payoff and the only viral loop)
Before this session a finish ended on a wall of splits, and nothing a runner could show anyone
existed. Now, end to end (screens: `npm run shots`, scenes `run-finished`, `home`, `result`,
`result-pending` (the bib page), `card-og`, `card-story`, `card-bib`, `card-race`, `results`):
- **App finish screen** (`app/src/components/Finish.tsx`): the time, pace, bib, a haptic,
  **Partager mon arrivée** (RN `Share`: a sentence plus the certificate link, whose preview is
  the finisher card) and **Mon certificat** (opens the web page). A rehearsal, a late run and a
  stop each say what they count for. Diagnostic and the GPS counts stay on it for the walk test.
  Deliberately plain: see DESIGN.md "Until the identity is decided".
- **Home** knows where the runner stands: the finisher card with the best official time as soon
  as the run is queued (`useMyResult` merges `/me` and the upload queue through
  `bestRankedRun`), days until the race opens, **Faire une répétition** before the window,
  **Courir à nouveau · seul votre meilleur temps compte** during it, results after it. The
  course map falls back to the diagram when the Mapbox PNG cannot load.
- **Race window enforced** (`shared/domain/raceWindow.ts`, SQL twin `api/src/db/ranked.ts`): a run
  started outside 9-15 Nov is stored, never ranked — in the public results, the organizer's
  counts and the results CSV (reported `not_ranked`: that file decides who gets a medal). A run
  on another distance than the entrant's own (after a re-import) never ranks either, and the API
  refuses one. Equal times share a rank.
- **Web**: `/{race}/results/{bib}` is the certificate (name, official time, rank, pace, bib, date,
  "mesuré par l'app" or "importé"), prints to one A4 landscape page, **Partager** (Web Share
  with the card image when the browser can share files, else the link, else copy), and a
  "Courez Deauville, vous aussi" block for every visitor who is not the runner. A bib not yet
  finished gets a "pas encore" page. Results rows link to it. Landing and result pages carry
  Open Graph tags; the landing gets "Pas encore de dossard ?" (organizer link) and a results
  link once the window opens.
- **Share cards** (`api/src/lib/cards.ts`, `pages/card.tsx`): one Hono JSX page per format
  (`og` 1200x630 for link previews, `story` 1080x1350 for posts), photographed into PNG by
  **Cloudflare Browser Rendering's REST API** and cached in R2 (`cards/<runId>-<locale>-<format>.png`);
  a ranked upload (app or GPX) takes its cards right away. No package added. **Needs a secret to
  switch on** (below); without it previews fall back to the Mapbox course map.
- **Night accent**: `readableOn` lifts the race colour to 3:1 on black; Deauville's navy progress
  line and runner dot were invisible on the run screen.
- **Pre-race share** (entries sell before race week, so this is the share that can sell one):
  until the window closes, a runner's page without a time is their **bib page** ("Léa court
  Marathon International de Deauville.", a bib plate, Share, "Courez avec Léa"), with a bib card
  as its link preview; the app's bib card has **Partager mon dossard** until the finish.
- **Upload tolerance decided**: a watch stopped on the line measures ~0.24 % short through the
  tracker; within 0.5 % an upload is credited the distance and timed to its last point.

To switch the share cards on (one-time, laptop or dashboard): create a Cloudflare API token with
**Browser Rendering - Edit** on account `6bd098851f5995454ecdbad6744c567c`, then
`npx wrangler secret put BROWSER_RENDERING_TOKEN` for production and `--env preview`.
`CF_ACCOUNT_ID` is already a var in `wrangler.jsonc`. Then open
`https://preview.run.sivoov.app/deauville-2026/og.png` once: a PNG means it works.

## Session 9 — upload fallback
`/{race}/upload` exists (PRD M2): a signed-in runner sends the GPX from a watch or another app
and gets a time marked "import" in the results. Local only so far; nothing deployed.
- `shared/`: `readGpxPoints` reads each point's position and `<time>` (course GPX unchanged);
  `evaluateUpload` replays the points through the app's own tracker, from the first point to
  the crossing of the course distance, pauses included. Refusals, each with a French and
  English message: no track, treadmill (no positions, sent to the organizer), drawn route (no
  times), started outside the window, short of the distance (says how far, and by how much),
  an average faster than the world record for the distance (records floored to the minute), a
  kilometre under 2:10 (a vehicle; the 1000 m record is 2:11.83). 17 new tests.
- `api/`: `GET`/`POST /{race}/upload` (`routes/upload.tsx`, `pages/upload.tsx`) behind the
  `sivoov_session` cookie; no session → `/{race}/signin?next=…`, and sign-in now honours a
  same-site `next`. Accepted: `source: 'upload'`, status through `officialStatus`, every point
  in R2 as the trace, run id `upload-<entrant>-<start ms>` so a re-upload replaces itself,
  then a 303 to `/{race}/results/{bib}` (built in parallel by another session). Files over
  10 MB refused before the body is read. The install page links to it. 6 workerd tests.
- Screens: `npm run shots -- --web upload` (empty page, a 48 m-short refusal, a treadmill).
- Decided in review: a 0.5 % tolerance for a watch stopped on the line (see above). Still open
  for the owner: treadmill runs are refused, where the PRD says the fallback "covers
  treadmills" (options: an organizer-reviewed declaration with a photo of the treadmill, or
  trusting TCX `DistanceMeters`); TCX (most watches) is not read — about half a day for files
  with GPS. Judging a marathon GPX costs 60-110 ms of CPU: fine on Workers Paid, over the Free
  plan's 10 ms — check the account's plan before race week.

## Session 9: the start ceremony, in sync
Pipe item 4 (a), (b) and the first half of (c); `AUDIO_EXPERIENCE.md` §2.6 rows 1, 3, 4.
- **`cue` trigger** (`at: 'armed' | 'countdown' | 'gun'`, `order`). `ceremonySequence()` in
  `shared/` orders the lines; `nextEvents` never fires one. The studio edits cues ("Avant le
  départ") and draws them at the start; the Deauville seed moved its intro, countdown and gun to cues.
- **The clock starts when the gun file starts.** Pressing Start plays the ceremony back to back
  (`playSequence` in `app/src/audio/player.ts`, which the event player now uses too): a plain
  "Sur la ligne" screen during the `armed` lines, then digits read from the countdown file
  (`ceil(duration - currentTime)`), then `startRun()` dated from the gun file's own position.
- **Fallbacks:** a pack with no cue (every pack published so far), a missing file or a line that
  fails before the gun → the silent 5 s countdown; a failing gun file → the race starts at once.
  Simulation skips the ceremony, so the rig and e2e stay fast.
- **The pack downloads from the race home and the pre-flight**, whose fifth line reads "Pack audio
  prêt · N Mo", downloading, no pack yet, or not downloaded (retried by "Relancer les
  vérifications"). It never blocks the start. `/prepare` no longer announces a count of checks.
- **Verified on the web target** (Playwright, silent WAVs through `page.route`): digits 4-3-2-1 for
  a 4 s countdown file, the clock at 0:00 when the gun plays, the fallback on a broken file.
  **Not verified on a phone:** expo-audio's `playing`/`currentTime` status timing on Android, the
  gap between files, the ceremony through headphones with music ducked.
- **Before the next publish:** preview's draft still has the old `start` / `elapsed: 0` triggers
  (the seed never overwrites a draft): switch the three lines to cues in the studio. Re-render the
  intro (it now ends with « Coureurs, à vos marques ») and the numbers-only countdown, and check the
  countdown file lasts about ten seconds. Publish only once this app update is on the phones: an
  older build plays no cue at all.
- Not done from §2.5: checking `sha256` of downloaded files, deleting older pack versions.

## Start here (next session)
1. Read this file, `docs/WORKFLOW.md` (loop 2b), `docs/MEMORY.md`.
2. **No laptop?** That is now the supported case. `Sivoov (Preview)` on the phone is standalone;
   ship JS with `gh workflow run deploy.yml -f action=publish-preview` and pull it on the phone
   with Diagnostic → *Chercher une mise à jour*. Read what happened with
   `npm run trace:pull -w api -- preview <run-id>`, which prints the device logbook.
   Verified end to end on 2026-09-13: a push to main published update `01a09c31` to the
   `preview` channel, and the Galaxy S23 downloaded it over 4G (`NEW_UPDATE_LOADED`) and ran
   it on the next launch, with the cable used for nothing.
3. **Laptop at hand?** `npm run device:doctor`, then `npm run device` is still the fastest loop,
   but `android/` now holds the preview package: the dev client costs one `npm run device:build`.
4. First task, either way: **the walk test** in item 1. Five minutes, and it unblocks M2.
   Since session 9 the finish screen still shows "N GPS · N rejetés" and the Diagnostic button;
   a walk before 9 Nov is a *rehearsal*, so expect "Répétition terminée", not "Arrivée !".

Note for the next session: Metro's file watcher did not fire during session 4, so edits only
landed after `adb shell am force-stop com.arthur.flam.sivoov.dev` and a relaunch. Check whether
that reproduces before assuming an edit had no effect.

## Next, in order (the pipe)
Anchored to PRD section 8. Today is 2026-09-13: **M1 is due 26 Sep, M2 10 Oct, M3 17 Oct**, and
PRD says App Store review is the critical path.

M1 is effectively done — the last clause of it, "the app shell runs a race end to end in the
dev client", happened on 2026-09-13 on a real Galaxy S23 (see below), minus the moving tracker.

### M2 (10 Oct): a real run on a device, results, upload fallback
1. **The walk test — the one thing blocking everything else.** Two indoor runs recorded
   **0 GPS · 0 rejected**: nothing reached the tracker, while the native side logged location
   batches every few seconds. Arthur has confirmed the phone was stationary throughout, and
   Android logged `FusedLocation: stationary throttling engaged`, so empty batches are the
   likely and innocent explanation — but it is still *unverified*, and the alternative is that
   the JS task never receives the fixes (the dev client warns `No task registered for key
   expo-task-manager` on every start, which would do exactly that).
   Settle it by moving: start a run, walk 200 m, read the finish screen's "N GPS · N rejected".
   Non-zero ⇒ innocent, go to item 2. Zero ⇒ the background task never reaches JS, and that is
   the bug to fix before anything else in this list matters.
   The device logbook now tells the two apart without a cable (WORKFLOW.md, loop 2b):
   `task.batches` counts every call Android made into the JS task, `task.empty` the batches that
   carried no fix (stationary throttling, innocent), `task.dropped` fixes that arrived with no
   run listening (the bug), `task.fixes` the ones that got through. `task.batches = 0` means the
   task never reached JS at all.
2. **The acceptance run.** Once item 1 is non-zero: 1-2 km around the block, headphones in,
   **screen locked and phone in a pocket** — that is the part no test can reach. Then
   `npm run trace:pull -w api -- preview <run-id>` and replay the trace in a `shared/` test, so
   the tracker is finally tuned against real GPS instead of simulated noise. Watch: drift while
   stopped at a light, whether audio ducked music or stopped it, gaps while the screen was off,
   battery drop (PRD section 7 budgets half a phone for a marathon, and nothing has measured it).
3. **Results, certificate, share cards and the upload fallback are built** (session 9). Left:
   set `BROWSER_RENDERING_TOKEN` (session 9 notes) and check one real card render on preview;
   send a real Strava and a real Garmin Connect export through `/{race}/upload`; share a
   result link into WhatsApp and iMessage and look at the preview.
4. **Audio v1**: (a) cue trigger, (b) pack download with a visible state and (c, first half)
   sequence playback are **done** (session 9, start ceremony). Left, in order: switch preview's
   draft ceremony lines to cues in the studio, re-render and publish (only once the app update
   is on the phones); number fragments for splits and name files per entrant; (d) `interval`
   trigger and file upload per line; (e) "moins de voix". The rewritten Deauville script
   (double loop, ~38 events) is content work in the studio.
5. **Merge this branch and ship it.** Session 9's work is on `claude/running-app-launch-xopyvv`,
   not on main, so nothing of it is deployed or published. Merging deploys the preview Worker
   and publishes the JS update; production still needs `npm run db:migrate:production -w api`
   (0005) before the studio opens there. No new migration in session 9.

### M3 (17 Oct): stores — and the real schedule risk
5. **iOS does not exist yet.** Everything on this page is Android. There is no iOS build, no
   Apple Developer Program step done, no `eas credentials` run, and the PRD calls App Store
   review the critical path with a submission due mid-October. iOS cannot be built the cheap
   local way this repo now uses for Android — it needs EAS and an Apple account. Start it early
   and submit something even if features are missing; features ship over the air afterwards.
   Treat this as the highest-risk item on the page, ahead of anything cosmetic.
6. **Production entrants**: import the organizer's CSV through `/org/deauville-2026/import`.
7. **Native Mapbox in the app** (wanted, recorded as the next native decision): replace the
   static PNG on the race home with `@rnmapbox/maps` (course line, landmarks, the runner's dot
   live on the run screen as an option next to the diagram). Needs a new build, so bundle it
   with the next one, and add it to the native module list in ARCHITECTURE.md when it lands.
   Token: `EXPO_PUBLIC_PUBLIC_MAPBOX_TOKEN` (pk.) in the app, the sk. token only for the SDK
   download in the build.
8. **Web polish**: hero photo and real theme from the organizer, English copy review, OG image,
   English variant of the admin. `npm run shots -- --presets phone-en` already renders the English
   app screens, and the first pass found `/prepare` announcing "Three checks" above four checks.

Done earlier and kept here for the record: trace storage (session 3) — the trace body lives in
expo-file-system (`traces/<runId>.json`, `app/src/stores/traceFiles.ts`), SecureStore keeps run
plus file path only, web uses localStorage. Verified on the phone on 2026-09-13: a run stranded
by a crash was persisted and uploaded on the next foreground.

## What the first phone session proved (2026-09-13, Galaxy S23, Android 16)
Working on real hardware: sign-in against preview, the race home with the Mapbox course
render, the pre-flight (19-20 m GPS lock, background permission, battery warning), the run
screen and its ceremony, **audio actually playing** (three events, audio focus taken and
released per clip), the Android **foreground service** (`isForeground=true`, type location)
with its notification, the finish screen, the **upload** ("Result sent"), the persisted
upload queue flushing a run left over from a crash, and `npm run trace:pull` pulling that
trace back out of R2. Distance stayed at 0.00 km while the phone sat still, which is the
honesty filter behaving.

Two bugs found in the first twenty minutes, both invisible to the web target and to all 111
tests: the missing `RECEIVE_BOOT_COMPLETED` (every run crashed seconds after the gun) and
the near-black ghost labels on the night screens.

## Decisions taken 2026-09-25 (session 9)
- **The race window is enforced** for ranking, not for running: a run outside it is stored and
  shown to the runner as a rehearsal (before) or a closed-window run (after). One rule in
  `shared` (`isRanked`, `finishOutcome`, `bestRankedRun`) and its SQL twin (`db/ranked.ts`).
- **Re-running is allowed during the window; the best time counts.** The home says so.
- **Share cards are HTML photographed by Cloudflare Browser Rendering** (REST, no package, a
  token), not satori/resvg in the Worker (packages outside the stack, a heavy bundle) nor a
  canvas in the browser (a second copy of the design, no link previews). One design feeds the
  link previews and the posted image. Cached in R2 per run and language; a better run is a new card.
- **The app shares a link, not an image**: RN `Share` is core, an image would need
  expo-sharing/view-shot (native modules). The link's preview is the card, so the picture
  travels anyway; the web page shares the image file itself where the browser allows.
- **The certificate is the web page**, printed to PDF by the browser (print CSS). No PDF library.
- **Upload tolerance 0.5 %** of the course distance for a watch stopped on the line.
- **No opinionated design until the identity is decided** (owner): new surfaces use the existing
  tokens and components only; the surfaces waiting for a look are listed in DESIGN.md. A first
  pass with a gold medal, framed certificate and coloured cards was taken back out.

## Decisions taken 2026-09-13 (studio slice)
- The **script is a shared schema** (`shared/schemas/audioScript.ts` + `domain/audioScript.ts`).
  The studio and the CLI derive events, manifests and the TTS cache key from the same code; the
  Deauville fixture moved to `api/src/seed/deauvilleScript.ts` so the Worker can seed it.
- **Storage**: one draft row per `(course, locale)` in `audio_scripts`, whose `version` is what
  the next publish produces. Publishing writes the immutable pack at that version and bumps the
  draft. Seeding uses `ON CONFLICT DO NOTHING`: a re-seed never overwrites an organizer's work.
- **Projection is authoring-time.** A click on the map is turned into meters along the course by
  the Worker (`nearestOnTrack` in shared) and stored as `{kind:'distance', meters}`. No new
  trigger kind, nothing for the app to learn. On a course that loops back on itself a click
  between two branches snaps to the nearer one, so the popup states the distance it found.
- **The browser does no domain arithmetic.** Every position drawn comes from the server, which
  runs the shared `estimateFirings`; changing the pace or saving refetches the estimates. That
  is why saving returns `{script, estimates}`.
- **Autosave**, debounced 800 ms, with a localStorage copy written before the request and
  cleared after it: a refresh mid-save offers to restore. No explicit save button.
- **The client script is one real `.js` file** bundled as a wrangler `Text` rule
  (`api/src/pages/org/studio.client.js`, inlined by `studioClient.ts`): no framework, no build
  step, no second request, and it is linted with browser globals.
- **The studio degrades to the SVG course diagram** (`courseDiagram.tsx`, now taking markers)
  with the same event dots when there is no Mapbox token, no network, or `?map=svg` — which is
  the knob `npm run shots` uses, so the screenshot is deterministic and offline.
- **ElevenLabs runs in the Worker** behind the optional `ELEVENLABS_API_TOKEN`, one line per
  request, cached in R2 by `sha256(text|voice|model)` exactly like the CLI. Absent token = 503
  with a French message; the studio stays usable with the browser voice.
- Rendered audio is served to the organizer only, from `/org/.../audio/<hash>` with
  `Cache-Control: private`. The public pack still carries no script text.
- The screenshot rig's organizer sign-in now posts `TEST_CODE` directly instead of asking for a
  code: four organizer scenes across two presets would have tripped the five-codes-per-hour cap.

## Decisions taken 2026-09-13
- Android dev builds are compiled on the laptop over USB, not on EAS: the toolchain is already
  installed, the loop is minutes instead of a queue, and no `EXPO_TOKEN` is needed. EAS Build
  remains for iOS, shareable installs and the stores.
- `/prepare` shows "Ouvrir les réglages" when the location permission is not "always", because
  Android only grants it from the system settings page.
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
- See PRD section 10 and DESIGN.md open decisions.

## Known gaps
- Share cards have never been rendered by the real Browser Rendering API: the request shape
  follows Cloudflare's REST docs and is pinned by a stubbed workerd test, but the first real PNG
  waits on `BROWSER_RENDERING_TOKEN` (session 9). The container cannot load Google Fonts, so the
  local screenshots of cards and pages show fallback fonts; the real ones use Fraunces and
  Barlow Condensed.
- Nobody has pasted a result link into WhatsApp, iMessage or LinkedIn yet to see the preview.
- Uploads are trust-based: a GPX's timestamps are believed (a file dated in the future, or
  edited, is judged like any other). The results mark them "import" and the organizer sees them;
  a stricter check needs a product decision, not code.
- Share cards: a runner's PNG URL carries the card's id (`v=`), so a new result never hides behind
  a cached picture; a failed render is not retried for ten minutes; a failed link-preview card
  falls back to the course map. Bib cards are taken only when their URL is asked for.
- No production entrants: import the organizer's CSV (admin slice) or seed by hand.
- The tracker has never recorded a moving runner. Indoor runs record zero samples; Arthur has
  confirmed the phone was stationary, so Android's stationary throttling is the likely cause,
  but it stays unverified until someone walks with it (pipe, item 1).
- **No iOS at all**, while PRD section 8 makes App Store review the critical path with a
  mid-October submission. See pipe item 5. Biggest schedule risk on this page.
- Battery over a long run is unmeasured, against a PRD budget of half a phone for a marathon.
  The dev client is a debug build and will flatter nothing — measure on a `preview` build.
- `WARN No task registered for key expo-task-manager` on every dev-client start. Benign in
  dev as far as anyone knows; suspicious given the above. Check whether it also appears in a
  `preview` profile build before trusting it.
- Metro's file watcher did not pick up edits during the 2026-09-13 session: Fast Refresh
  never fired and changes only landed after a force-stop and relaunch. Worth a look, because
  loop 2a's whole value is the 10-second edit cycle.
- The admin is French-only (the studio too).
- The studio is live on preview (migration 0005 applied, seeded with the Deauville draft,
  `ELEVENLABS_API_TOKEN` set). Production has the secret but **not migration 0005 yet**: run
  `npm run db:migrate:production -w api` before opening `/org/deauville-2026/courses` there.
- Voice rendering in the studio has only ever run against a stubbed ElevenLabs (the workerd
  test). The first real render from the Worker is untested.
- The `preview` and `production` profiles have never been built on Android either; only the
  local debug dev client has run. Anything that behaves differently without the dev launcher
  (the task-manager warning above, updates, battery) is untested.
