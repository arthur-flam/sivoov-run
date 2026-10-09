# Status

Updated: 2026-10-09. Race week: 14-15 November 2026 (Marathon International de Deauville).
Second race: 10 km des Champs-Élysées, 7 February 2027 (docs/CHAMPS_ELYSEES.md).
**Content target (owner, 2026-10-09): the Paris 10K and a 5K demo, ready to pitch around
January 2027; Deauville is no longer a content target.** Brief: docs/PRODUCTION.md.
Milestones: PRD.md section 8 (M1 26 Sep, M2 10 Oct, M3 17 Oct, M4 31 Oct, freeze 7 Nov).

## Where we are

### The Champs-Élysées produced: a 10 km rewritten, a 5 km demo, a new audio engine (2026-10-09, same branch)
The brief below, carried out in one laptop session (PRODUCTION.md's kickoff, without the owner's
ears: every listening decision is provisional and listed under Owner actions).
- **Casting** (`npm run casting -w api`): nine Gemini voices × two directions, a blind page for
  the owner. A Gemini listener on the blind codes put **Sadachbia directed « vétéran »** first
  (heard as about fifty, the most sports energy): the voice stays, the direction changes.
- **The script** (`api/src/seed/champsElyseesScript.ts`, rundown in CHAMPS_ELYSEES.md): one
  speaker in registers (PA, ear, close, calm, finish: a line's own `voice` with its scene), two
  regulars in the crowd (Martine, Gacrux; the club, Puck); the name 14 times placed in the 10 km
  plus the crowd's; places described where they are seen (directions, the Obélisque, the Eiffel
  Tower checked against the GPX's bearings); the Obélisque planted at 80 m, paid off at 9.7 km;
  every km read against the runner's own opening pace; the countdown ~25 s after Start (~15 s
  on the 5 km), the crowd counting the last three along; no gender agreement anywhere (tested).
- **The 5 km demo**: the 10 km's second half (`champsElysees5kGeometry`, cut at the official
  5th km on boulevard Haussmann), a course marked `demo` (migration 0011) that only the race's
  demo shows; the seed adds the demo race `10km-champs-elysees-2027-demo` if the race has none,
  and the owner's entries on it everywhere (bib 7001 the 10 km, 7002 the 5 km).
- **The engine** (AUDIO.md, "Takes, conditions and the rhythm director"): takes (pools, no
  repeat, conditions read from the run: steady / faster / slower, a round time in reach, a
  restart after a stop), filler lines and a rhythm director (never quiet past `maxGapS`: 150 s
  on the 10 km, 120 s on the 5 km; never within 40 s of a placed line), name cheers rendered per
  runner and cached per first name, new live placeholders `{objectif}`, `{allure_depart}`,
  `{meilleur_km}`, a km call kept quiet right after a big moment, the pack's file lengths, and a
  lenient pack reader in the app (an event it cannot read is left out, never the whole pack).
  Wired through publishing, the studio (takes shown with their condition tags, kept on save),
  the runner's own lines (`event/take`) and the app's run store and player.
- **Sound** (`api/tools/produce/`): a French crowd made of Gemini voices (the archive's French
  crowd was three people indoors, its other "crowds" a room and a theatre), the stadium roars
  only as a low layer, a heartbeat before the Arc; the tool writes through the target's own
  bindings and publishes with the Worker's own code; whole runs at 4:30, 5:30 (a stop and a walk)
  and 7:00 through the app's engine, tracker and queue, each with a timeline of its silences;
  every render's origin in `origins.json`.
- **Reviewed** by four subagents (engine simplicity, the app's run, the Worker and data, the tool
  and the script); their findings are fixed in `aa63aef` and `521af82` (what was left: Known gaps).
- **Checked**: typecheck, lint, tests (shared 476, api 261 + 56, app 166), the density check on
  both courses at 4:00-8:00/km with a stop and a walk on the real tracker; preview: migration
  0011, the Worker, the seed, the real race listing only its 10 km and its demo both.

### The production brief (2026-10-09, branch `claude/api-credits-10k-strategy-ssyque`)
The owner ran the 10K draft and listened: too many long silences, trivia instead of
description, too little of the runner in it, archive sounds that did not fit. Decisions and the
plan are in `docs/PRODUCTION.md` (rhythm, narrative devices, the engine's pools, run-read
conditions, rhythm director and name cheers, full-run renders, the 10K and 5K plans, a kickoff
prompt for a long laptop session) and `docs/SOUND_LIBRARY.md` (every sound kept with its origin
and human scores, a listening page). Gemini is the voice provider (billing enabled). No
questions to the runner. Docs only: nothing built yet.
Second round with the owner: one voice (recast older and sportier if Gemini allows), the name
often, the countdown kept and reached faster, content first. PRODUCTION.md now opens with the
tone on one page, a casting test, a starting beat sheet, and a kickoff prompt in that order.
Notebook of ideas (artifact): https://claude.ai/artifact/5DA98GBSKiqDnWJX9hX7e6

Live: https://run.sivoov.app/deauville-2026 (production), https://preview.run.sivoov.app
(preview). Test sign-in and roles: docs/ACCESS.md. M1 is done. The first real run happened
on 2026-09-27 (below); M2 still needs a real finish. Production has the race and its courses;
no real entrants yet.

### In-depth review, eight angles (2026-09-29, branch `ccr-89069fdb-wkvxeu`)
Eight reviewer subagents read the app in parallel: simplicity (shared, api, app), run-lifecycle
edge cases, server security, UI from `npm run shots`, the PRD's gaps, tests/CI/deps. Each fix
below has a test that fails without it. JS, Worker and one migration (`0010_render_budget.sql`,
applied by deploy.yml before the Worker); no native change.
- **A stop added distance** (`judgeSample`): standing still between two running fixes (a red
  light, a water station) was credited as running speed × the stop: 3 min gave +427 m, and an
  earlier official time. The Doppler lift now spans steps of 10 s at most. The first real run
  replays the same (9 224.9 m): it had no stop.
- **The server believed the app's time**: `PUT /api/runs/:id` made a 1-minute half with no trace
  an official finish. `officialStatus` now also refuses a time under the world record, a
  kilometre under 2:10, and more running time than passed from start to finish; the JSON API
  refuses `source: 'upload'`. A file replayed to within 0.5 % of the line keeps its last split.
- **Paid renders anyone could spend**: deleting a photo reset its three tries (9 renders shown
  for one moment). Now five pictures a day per runner (`PHOTOS_PER_DAY`, counted on the entry:
  `photo_day`, `photo_renders`), deletions included; past them the photo is kept, waiting, and
  made the next day. The owner wants App Review and test accounts on the real model (2026-10-01):
  they get it, within the same five a day.
- **Data left behind**: an admin-deleted runner's selfies stayed in R2; an entry whose email
  was corrected kept the old holder's sessions. Both fixed. Indexes on `entrants(email)` and
  `sessions(entrant_id)`; the course map is cached by its parsed parameters.
- **The app**: a finish reached while Android had dropped the screens was queued only at the next
  cold start (`watchFinish` in `_layout` now); the journal was cleared even when queuing failed;
  a run alive in memory was never shown again (`useRunRecovery`); two readings of the upload
  queue at start could drop a run; one refused photo blocked every later one; offline with no
  kept geometry every course showed Deauville; the upload retry loop ran twice.
- **Copy and UI**: no « classé / classement » left anywhere (landing, stop sheet, finish, admin
  « Non officiel »); French non-breaking spaces once in `t()`; « Léa prend le départ. »; date spans
  « du 9 au 15 novembre »; « 21,1 km » on the certificate; the GPS counters and Diagnostic only
  for test builds and accounts; the stop hint no longer covers the pace; plurals; « Les annonces ».
- **Android location in two steps** (2026-10-01, the owner's call): the pre-flight asks « while
  using » first (the system dialog), then, only on Android and only on the runner's tap, « Toujours »
  behind a card that says why (`AlwaysLocation`): the run is measured with the screen locked or the
  app closed, and only during the run. That card is also the in-app disclosure Play requires before a
  background location request. Back from Android's page the permission is read again. The gun no
  longer asks anything (it used to repeat the request). Seen in `npm run shots` with the card forced
  on (the web target cannot show it); on a phone it needs the OTA, no new build.
- **Sprawl removed**: 23 i18n keys, 8 shared functions with only their own tests, 3 API queries,
  4 app members. CI: one deploy at a time, production only from main, a read-only token.

**Found, not done** (decisions or larger work; see also Known gaps):
- **Battery**: the screen is kept awake the whole run and the 3D map is the default view: 27 %/h
  measured, more than a phone for a 4 h marathon. Proposal: numbers view by default for the half
  and the marathon, the screen allowed to sleep, then a 60-min locked-phone measurement.
- **Runners whose app failed**: no organizer-declared finish, no TCX, treadmills refused, and
  `medals.csv` lists only official finishers: a paying runner can miss their medal.
- **App runs are judged on the app's numbers**: the new checks catch the impossible, not a
  forged trace. Replaying the trace on the server (as for files) is the full fix.
- Smaller: the live-voice daily quota is read-then-write (parallel calls pass it); Telegram
  sends a line per start call with no cap; `POST /api/auth/code` tells whether an email is
  entered; entrant ids `${race}-${bib}` can collide across races; no request body limit;
  `studio.client.js` (1,376 lines) hand-copies shared logic; the web session check is written
  five times; three copies of `@sentry/core` in the Worker bundle; course fixtures ship in the
  Worker through the shared barrel.
- **Scope**: the photo moments (Gemini), the studio and the map feel are large for six weeks out.
  The reviewer's advice: freeze them, keep photos off for Deauville unless the real model is
  tried and its cost and consent reviewed.

### No rank at all; the camera in the run; rehearsals get photos (2026-09-29, same branch)
The owner: no rank anywhere (not everyone runs), a camera button during the race instead of
leaving the app, and a rehearsal is a run like the real one, photos included.
- **No rank**: the certificate shows distance, pace, bib, date; `/{race}/results` lists the
  finishers by name with their time, no position. `rankOf`, `ranks`, `formatRank` and the report's
  places are gone, with their tests (the behaviour itself was removed).
- **The camera in the run**: at each photo moment the « Vue » control becomes « Ma photo » for
  500 m (the map does not move); one tap opens the front camera. The photo is kept on the phone
  (document dir) and sent when there is a network; the start selfie goes the same way. The start's
  moment belongs to the line, the finish's to the finish screen.
- **Rehearsals**: the ready screen, the camera and « Vos photos de course » after the finish work
  for rehearsals too; the home shows the photos of the last run that reached the line.
Seen in `npm run shots` (`run-photo`, `run-photo-ready`); the camera itself is the web target's
file input there: on a phone it needs the EAS build.

### Review pass (2026-09-29, same branch)
A reviewer subagent read the whole branch for sprawl and bugs. Fixed:
- **Bugs**:
  - a render lost mid-way (page closed, timeout) left the photo stuck: it is now retried after 3 min (`canTryAgain`, `makeWaiting`);
  - a photo deleted, or a runner's data erased, during a render came back: the render only writes if the photo is still there, else it deletes the picture it made (`finishRender`);
  - the app asked for the pictures again and again when offline: now once per screen;
  - removing a moment left runners' photos and files behind: they are erased with it;
  - photos taken in the app were only retried from the photos card: they now go with the pending uploads, at app start, on foreground and every 30 s;
  - the app link's `next` now goes through `sameSitePath`.
- **Sprawl**:
  - one `acceptSelfie`, `renderForMoment`, `picturePath` and `pictureResponse` for the web page, the app and the admin try;
  - `startSession` and `setRunnerCookie` shared with sign-in;
  - `courseRaceOf` for demo races;
  - `CARD_FORMATS` in shared;
  - one share-sheet helper for both page scripts;
  - `card.tsx` split into `reportParts.tsx` and `cardStyles.ts`;
  - unused app routes, fields and strings removed;
  - screen logic moved out (`lastFinishedRun`, `takenMoments`).
- Left as is: renaming `rankedRun`, `isRanked` and `bestRankedRun` to "counts" would touch results, uploads and the admin beyond this branch. They mean "counts as an official finish", and their docs say so.

### Race photos in the app, the studio and the finisher's home (2026-09-29, same branch)
The owner's review of the first pass: no ranking in the pictures, a photo before the start, the
moments in the audio editor (they need their announcement), the share screen reachable after
the run instead of « Courir », and a photo picker: during the race people only shoot, the model
runs after.
- **No ranking at all** (the owner: not everyone runs): not on the pictures, not on the
  certificate; the results page lists the finishers by name with their time.
- **The flow**: the ready screen lists the moments and takes the start selfie (front camera);
  during the run the chip says « Moment photo »; after an official finish « Choisir mes photos »
  (several at once) matches each photo to its moment by its EXIF time, sends them, and the
  pictures are made in one go and shown on the finish screen. New native module:
  **expo-image-picker** (ARCHITECTURE.md): needs a new EAS build; older shells open the web page.
- **The finisher's home**: after an official finish the home opens on « Bravo, Marc. », the
  report, share, « Mes images à partager » and the photos; « Recourir » stays below. A rehearsal
  changes nothing.
- **The studio** lists each course's moments with their announcement or « Pas encore
  d'annonce », and « Ajouter les annonces » puts them in the draft at the right place, to reword,
  record and publish. The admin « Photos » says per course whether the line is there.
- Seeds: a « Sur la ligne de départ » moment for both races (local, preview).
Seen in `npm run shots` (`run-finished-photos`: two selfies picked, sent and made by the local
stand-in, on the web target; `org-studio`). The picker, the camera and the EXIF on a real phone
are not tested (web target only, no EAS build yet); EXIF parsing is unit-tested on the shapes
Android and iOS are documented to give.

### Race photos: the runner put into their race (2026-09-29, branch `claude/post-run-share-image-8iw9d6`)
The owner's idea: ask runners for a selfie or two, at chosen moments, and have an image model put
them into the virtual race; organizers upload pictures of the places. JS and Worker only (OTA),
no native module (the camera is the phone's own; the upload is a web page).
- **Photo moments** (admin « Photos »): a title, where (start, a place of the course, finish),
  what the runner is asked, the scene for the model, up to three photos of the place.
  « Essayer avec votre photo » renders the organizer's own selfie into it, kept nowhere.
  Seeded on local and preview: Deauville (Les Planches, the finish), Champs-Élysées (the Arc, the finish).
- **During the run** the chip over the map reads « Moment photo : Sur les Planches » for 500 m.
  The organizer can add a voice line at the same place in the studio (not automatic).
- **After** (the finish screen's « Mes photos de course », opened signed in by a one-use link, or
  `/{race}/photos`): a selfie per moment, agreement ticked, 20-40 s later the picture: download,
  share, « Montrer sur ma page » (then on the public result page, « En course »), up to three versions.
  Private by default; « Supprimer mes données » erases selfies and pictures; privacy page updated.
Seen in `npm run shots` (`photos`, `org-photos`, `run-finished`) with the local stand-in (the
selfie comes back as the picture: no key in the container). 15 API tests with Gemini stubbed.
**Never run against the real model**: Owner actions.

### The race report, the share cards and the share page (2026-09-29, branch `claude/post-run-share-image-8iw9d6`)
The owner's brief: a share image like the Berlin Marathon's race report, a flow that makes
people proud to share and makes whoever sees it want to run. JS and Worker only (OTA).
- **The race report** (`raceReport` in shared): timing points every 5 km (marathon, half), 2 km
  (10 km), 1 km (5 km), the finish; time and pace over each segment; the place at each point
  from the other finishers' own splits; the two halves, a negative split, places gained.
- **Four pictures** (`card.tsx`, DESIGN.md "share cards"): `og` 1200×630 race report (the link
  preview), `post` 1080×1350, `story` 1080×1920, `sticker` (transparent, Strava-style, over one's
  own photo). The map under the course is Mapbox `light-v11` framed by `fitView` (`pad=44`).
- **The result page** shows the picture itself first, the very one under the link, with the four
  formats to pick from, « Partager l'image » (the file where the browser can share files),
  « Télécharger », « Copier le lien », then the certificate. Without a renderer the card's own
  page shows in a scaled frame. The link preview now invites: « Marc a bouclé le semi-marathon en
  1:45:00 … Du 9 au 15 novembre, courez-la vous aussi ». Visitors get « Marc l'a courue. À votre tour. »
- **The app's finish**: a negative split is said, the report picture shows once the result is
  uploaded (when the Worker renders cards), « Mes images à partager » opens the page.
Seen in `npm run shots` (card-og, card-post, card-story, card-sticker, result, run-finished).
**Still blocked on `BROWSER_RENDERING_TOKEN`** (Owner actions): until it is set, no PNG exists,
so link previews fall back to the course map and nothing can be downloaded. Fonts in the shots
are fallbacks (the container cannot reach Google Fonts).

### The rehearsal of 2026-09-29, fixed (branch `claude/rehearsal-run-issues-yugv8j`)
The owner ran the Champs-Élysées 10 km as a rehearsal (preview, 46:34, run `mumtdgzg-uaew1q4g`).
The trace was pulled through the admin (MEMORY.md) and replayed through the tracker. JS only (OTA).
- **The audio late at the first places**: every line fired on its trigger, but the Concorde and
  Madeleine lines were set 50 m past their places (300/700 m for 250/650 m): 13 s late. The seed
  now takes place lines' distances from the course's places. Preview's pack was republished as
  v3 with the two lines at 250/650 m (through the studio's API; the seed never overwrites a
  draft). Production has no Champs pack yet; Deauville's lines sit on their places.
- **The other places, 2-3 s late**: the tracker counts ground a step behind the runner, the dot on
  the map shows where the runner is. Distance lines now start 3 s of running early (at most 20 m,
  `lineLeadM`), and « Prochain » follows the dot, so the dot, the name and the voice agree.
- **Back in the app, the runner off the course**: in the background the camera kept being sent
  moves the paused map never made; back on screen it moved in a straight line from where it was
  left, across town, with the runner drawn at its centre. No moves are planned off screen now, and
  a plan gone stale (3 s) jumps to the runner (`STALE_MS`); the glide snaps on the first frame.
- **The finish cut short**: « Accueil » on the finish screen cut the finish lines and the crowd.
  They play to their end now; a new run screen cuts the tail.
- **The GPS saver never applied**: at 19 % the phone was in a pocket and Android refused the
  switch from the background. It now waits for the app to be on screen (main's `506cb70` did the
  same; its version was kept at the merge).
- **Battery**: 28 % to 7 % in 46 minutes with the 3D map on screen (about 27 %/h). A marathon at
  that rate needs a full phone; the numbers view is the fallback. Not changed yet.
- **Not done: the rehearsal's finish.** The owner wants a rehearsal to end like a real race (the
  medal, the time, the share screen, the race report) and the race home to offer « see my
  rehearsal » and « rehearse again » afterwards. That is `Finish.tsx`, the result and card pages,
  all rewritten on `claude/post-run-share-image-8iw9d6` (not merged yet). To build on it once it
  lands: `finishOutcome` 'rehearsal' gets the official screen with a « Répétition » mark; the result
  page shows a runner's latest rehearsal when asked (`?run=<id>`, `noindex`, never in the ranking);
  the home shows the last rehearsal (time, « Voir », « Refaire la répétition »).
Verified: tests (shared lead, camera plan, playback drain); the replay of the trace. Not yet on a phone.

### Telegram lines for the owner (2026-09-29, branch `claude/rehearsal-run-issues-yugv8j`)
The Worker posts one short French line to the owner's Telegram on what people do: a first line
of defense and a live feed. Sent after the response (`waitUntil`), never failing or slowing a
request; a failed send is a `console.warn`. Plain text, prefixed `[preview]` / `[local]` outside
production. Runners are named by name, bib and race, never email; « test » (`@example.com`),
« démo » (demo race) and « simulation » say so. Lines in `api/src/lib/notices.ts`, sender in
`lib/telegram.ts`.
- 🔑 Runner sign-in, web or app, with the phone the app reports: « Connexion de Léa MARTIN
  (dossard 2002, 10 km des Champs-Élysées) sur l’app Android 16 · samsung SM-S911B · v2.0.0 ».
- ▶️ Run start: the app calls `POST /api/runs/:id/started` at the gun (`{ courseId, source }`,
  fire and forget, nothing stored; `app/src/stores/runStarted.ts` watches the run store): « Départ
  de … sur 10 km : course officielle | répétition, avant l’ouverture | hors délai | simulation ».
  Needs the app's JS (OTA); older builds just say nothing.
- 🏁 Finish, once per run id (a re-sent upload is silent), app or GPX: « … a couru 10 km en 46:34 :
  officiel | répétition, hors classement | hors délai, hors classement | simulation »; a run cut
  short says how far it went (« a couru 3,4 km en 18:02 : abandon »).
- ✉️ Organizer lead (name, email, race, first 200 characters of the message), 👤 admin sign-in
  (email, « staff »), 🔥 any 500 (method, path, start of the error).

**For the owner to switch it on**: in Telegram, talk to @BotFather, `/newbot`, keep the token.
Send your new bot any message, then open `https://api.telegram.org/bot<token>/getUpdates` and read
`message.chat.id` (for a group: add the bot to it, write in it, same page; group ids are negative).
Then, in `api/`: `npx wrangler secret put TELEGRAM_BOT_TOKEN` and `npx wrangler secret put
TELEGRAM_CHAT_ID` for production, and the same with `--env preview` for preview. No deploy needed
for the secrets; the code ships with the next Worker deploy. Without them, nothing is sent.

### Sentry, app and Worker (2026-09-29, branch `claude/rehearsal-run-issues-yugv8j`)
Configured, off until the owner adds the DSNs: nothing is sent without them (local, tests, the web
target, screenshots).
- **App** (`app/src/sentry.ts`, imported first in `app/_layout.tsx`, which it wraps for touch
  breadcrumbs): `@sentry/react-native` 7.11, loaded only when the bundle has
  `EXPO_PUBLIC_SENTRY_DSN` and not on web. Environment = the channel (development in Metro),
  release `sivoov@<version>`, tag `update` = the update id. Errors only: no tracing, no replay,
  `sendDefaultPii: false`; the user is the entrant id alone, set and cleared from the session
  store. An error carries the last 60 logbook lines (`diag.ts`) as breadcrumbs, read only then.
  **Old shells**: the JS arrives over the air in shells without Sentry's native module; `enableNative`
  follows the module's presence (as `mapboxSdk.ts` does) and the SDK then sends JavaScript errors
  over fetch, with no native crash handler. JS only until the next EAS build, which carries the
  native half with @rnmapbox/maps (ARCHITECTURE.md, native module list).
- **Metro** uses `getSentryExpoConfig` (a debug id in each bundle, for source maps). The config
  plugin `@sentry/react-native/expo` is added only when the build has `SENTRY_AUTH_TOKEN`: it fails
  a native build that cannot upload.
- **Worker** (`api/src/lib/sentry.ts`): `@sentry/cloudflare` 11 wraps the handler only when
  `SENTRY_DSN` is set; `app.onError` reports the error (one line). Errors only; no headers,
  cookies, bodies, query strings or user info collected (v11 collects them by default).
- **CI**: every `eas update` (deploy.yml, preview.yml) gets `EXPO_PUBLIC_SENTRY_DSN` from the
  GitHub secret `SENTRY_DSN_APP` when it exists, and uploads the update's source maps when
  `SENTRY_AUTH_TOKEN` exists. Neither missing fails a workflow.
Proven in the container: typecheck, tests, lint; `npm run shots -- --app` (Metro with Sentry's
config, Worker without DSN); a web and an Android export (DSN inlined, debug id in the map);
`expo config` and an Android prebuild with and without the token; `wrangler dev` with a fake DSN
captured a temporary throwing route's error from `onError` and sent it. Not yet on a phone.

**The owner, to switch it on:**
1. Create two Sentry projects: React Native (the app) and Cloudflare Workers (the Worker).
2. Worker: `npx wrangler secret put SENTRY_DSN` and `npx wrangler secret put SENTRY_DSN --env
   preview` in `api/` (the Workers project's DSN).
3. App updates: GitHub secret `SENTRY_DSN_APP` (the React Native project's DSN).
4. App builds: EAS environment variable `EXPO_PUBLIC_SENTRY_DSN`, same value, for development,
   preview and production (`eas env:create`, visibility sensitive). A laptop build
   (`npm run device:preview`) takes it from the shell's environment.
5. Optional, readable stack traces: a Sentry auth token as the GitHub secret `SENTRY_AUTH_TOKEN`
   with Actions variables `SENTRY_ORG` and `SENTRY_PROJECT`, and the same three as EAS
   environment variables for builds.
6. The next EAS build (already needed for the map) carries Sentry's native half.

### Second real run: a full 10 km, against the Fenix 8 (2026-09-29)
The owner rehearsed the 10 km des Champs-Élysées (bib 2002, run `mumtdgzg-uaew1q4g`) on the
Galaxy S23 with the tracker fix from 2026-09-27, the Fenix 8 recording (DotDot run `25a17856`,
Strava `20380103615`). Easy GPS: 3.3 m median accuracy, 1 Hz, longest gap 1.2 s, nothing dropped.
The first course run to its full distance: all 22 lines fired in order, the finish and upload
landed. Compared with `uv run scripts/compare_garmin.py` (the trace is the admin's « Données
brutes »; the GPX button gave the same JSON).
- **Distance: +0.39 % against the watch** over the app's own window (10 003 m for 9 964 m), about
  1 s/km fast. Official time 46:34.7; the watch covered the same 10 km from the gun in 46:44.3.
  Km calls drifted from 1 s early at km 1 to 11 s early at km 10. The first run replays at +0.23 %:
  both runs lean long by the same small amount. The phone's reported speed read 8-10 % low again.
- **The "5 s/km too fast" the owner felt is the watch's head start**, not the tracker. The watch
  started 97 s (291 m, mostly walking) before the gun, so its average carried a slow start: the
  app's spoken average was 14 s/km faster at km 1, 6 s at km 4, 2.5 s at km 9. Against the watch's
  average from the gun it was 0.5-1.9 s/km faster. The shown 30 s pace swings ±3-4 s/km around
  the watch's (median -0.4).
- **Not recalibrated.** A larger minimum step brings both runs to the watch (12 m: +0.24/+0.12 %,
  15 m: -0.04/-0.07 %) but breaks the hairpin, the clean 10 km and the km-marks tests, and two
  runs on one phone in one city are not enough to trade the hairpin for 0.3 %. The Garmin's own
  positions sum 0.7 % over its own distance: the watch is a smoothed reference, not the truth.
- **Battery: 28 → 7 % in 45 min, 28 %/h** (from a low start, battery optimization on). 36 %/h
  until 19 %, 24 %/h after, which is when the run screen stops holding the display on (if the
  phone was not locked by hand). Even the lower rate is twice the PRD's half a phone for a
  4 h marathon. 2 133 location batches for 2 795 fixes: the JS wakes on almost every fix.
- **The GPS saver pace never engaged**: at 19 % `startLocationUpdatesAsync(SAVER_OPTIONS)` was
  refused ("Couldn't start the foreground service"), Android's ban on starting a foreground service
  from the background. The 1 Hz updates carried on, so nothing was lost, but nothing was spared.
  The owner locked the phone by hand when it neared empty; Samsung's own figure for the app that
  day is 14 % (the logbook saw 21 points go during the run, screen and system included).
- **Two small battery changes on this branch** (JS only, OTA; not yet on the phone, battery not
  yet measured): off screen, Android hands the fixes over every 4 s instead of every second
  (`BACKGROUND_BATCH_MS`; the GPS still fixes at 1 Hz and every fix is kept, so a line is said up
  to 4 s late in a pocket, never on screen), and the saver pace, when the battery runs low off
  screen, waits for the app's next moment on screen instead of being refused.

### The run map, smooth under the finger (2026-09-29, branch `claude/run-map-feel`)
The owner's second pass on the phone: turning the map did not follow the finger, house numbers
cluttered the view, the simulation stuttered. JS only (OTA).
- **Turning**: a finger put on the map drags the ground round the runner (its angle around the
  runner), two fingers twist it. Each move goes straight to the map's camera (`setCamera`, no
  animation, no redraw of the screen); let go, the turn is kept and the needle sets it back. Before,
  each move went through React state and a 120 ms eased move, always behind the finger.
- **Smooth following** (`useRunCamera`, shared by the phone and web maps): the followed camera
  gets one even move a second, aimed where the runner will be a second later and sent a glide
  frame before the last one ends, so the map animates it alone and never stops. The followed
  runner is drawn over the map at the camera's focus (`RunnerDot`), so it cannot shake against it.
  The glide aims at where the runner is now (the tracker's last step plus the ground run since,
  at their pace) instead of chasing the tracker's 13 m steps. Modelled end to end in
  `cameraFeel.test.ts` (simulator, tracker, glide, plan, camera): at 5x the camera's speed stays
  within about 10 % frame to frame and never stops; before, it swung between 0 and 22 m/s.
- **The simulation's clock** is the phone's time the speed factor, running evenly; each 250 ms tick
  hands over every fix that fell due, so a busy phone no longer slows the run or stutters its time.
- **No house numbers** close up: Mapbox Standard has them only under `showPlaceLabels`, now off in
  the runner view and on over the whole course (towns, districts; no numbers at that zoom).
Seen in the web target (runner dot at the focus, place labels off, a drag turned the map 60° and
kept it) and `npm run shots` (all app screens; the web `organizers` shot failed on the contact
form, a Worker page this does not touch). The motion itself is proven by the model test, not by
eye: the browser pane was hidden. Not yet on a phone.

### The run screen after the owner's kitchen test (2026-09-29, branch `claude/run-feedback`)
Six things the owner saw on the phone. JS only (OTA), no native module.
- **The view moved on the line** (0 GPS, 0 m): the panel under the map grew and shrank with each
  ceremony line, so the map changed height and the camera's view with it. The panel on the line
  now has a fixed height (`START_PANEL_H`, about the running panel's: the map is 430 px during the
  ceremony and 429 after the gun in the web target). Also, the native Camera got new `padding` and
  `bounds` objects every render, and each one restarted its move: props are now made once per shot.
- **The simulation stepped every second**: the tracker counts distance in steps (about 13 m, every
  4-5 fixes), and the map only glided 1.5 s ahead at the runner's own pace, not the simulation's.
  `glideStep` (shared) now carries on at the pace on the screen's clock (`LocationSource.rate`) and
  closes the gap to the tracker gently (never backwards, at most 5 s ahead, straight there past
  100 m). A simulation glides 10 times a second, a real run 4. This fixes real runs too: they
  were stepping every few seconds.
- **Audio after a stop**: stopping the run silences the line, the queue and the ambiance under
  them (the gun's music outlived the run); a live line still downloading is not played. A finish
  still plays to its end.
- **No sound until La Concorde** in « Écouter la course en 10 minutes »: simulations skipped the
  start ceremony, and the Champs-Élysées race says nothing else before 300 m. The demo now plays
  it (`?ceremony=1`); e2e and screenshot simulations stay silent and fast.
- **Turning the map**: two fingers twist it, one finger across swings it round the runner (no
  pan, no zoom); a needle button brings it back to the course's way. Works in every view.
- **Subtitles**: a cross hides the words over the map until the next line; words longer than
  the box (three lines over the map, the whole panel on the line) scroll as they are said, timed
  by the sound's own length.
- **Pre-flight**: a green check shows its title only; the headphones keep their advice.
Seen in the web target (sign-in as `lea@example.com`, the Champs demo run: ceremony heard, map
height stable, caption scrolled and hidden, map turned and reset, stop mid-line silenced it) and
`npm run shots`. Not yet on a phone.

### The course card, lettered; simulation for testers (2026-09-29, branch `claude/course-card-letters`)
The owner's review of the race home after sign-in. JS only (OTA).
- **Places are lettered A, B, C** on the map and in the list, so they never read as kilometres.
  The map also carries small dark kilometre tabs (every km on a 10 km, every 2 on a half, every
  5 on a marathon, at most 12; `courseKmMarks`), which give way to the places.
- **Touch to highlight**: a row lights its place on the map (drawn even where it was left off
  for piling up), a place on the map lights its row; touch again to clear. The taps are
  transparent views over the map, not SVG handlers (react-native-svg's `onPress` leaks
  responder props into the DOM on web).
- The line under « Le parcours » now says what the runner hears, not how it works.
- Distances: `formatOfficialKm` / `formatPlaceKm` / `formatDistanceLine` in shared (moved from
  the landing page). The finish row no longer says « 10,000 km », the bib no longer
  « 10 km · 10,0 km » (« 10 km » alone; « Semi-marathon · 21,1 km »); the finish screen too.
- **Simulation for testers**: wherever « Faire une répétition » is offered (`me.rehearsal`:
  preview, local, test accounts), « Écouter la course en 10 minutes » sits under it (the demo
  race's simulated run), and the run screen accepts `?sim` for them. Simulated runs are stored
  as such and never counted.
Seen in the web target (shots `home`, `home-place`; taps checked both ways).

### The runner's language (2026-09-29, `claude/language`, merged)
The owner asked for a way to choose the language in the app, French by default and settable by
the organizer, remembered per runner so the emails follow (the audio stays French for now).
The app's strings were all in French and English already; it just froze the phone's language.
- **The app**: « Français | English » on the sign-in screen and at the bottom of the race home;
  the screen changes at once. The app speaks the runner's choice, else the phone's language
  (French or English), else the race's. Kept on the phone and on the server (`entrants.locale`):
  a runner who never chose gets their phone's language saved at sign-in, so the emails match.
- **The organizer**: Réglages → « Langue des coureurs » (French unless changed): for runners whose
  language is not known yet (emails before they open the app) or whose phone is in neither
  language. The runner's page says which language they get and where it comes from.
- **Emails**: the sign-in code is written in the language of the screen that asked (app or web);
  the bib instructions email in the runner's language, with the race page link in it.
- **The web**: a runner who switched the site to English and signs in there has it saved too.
Seen in the web target (sign-in in English, code email in English, the home switching back to
French, both `PUT /api/me/locale` saved) and covered by tests (shared rules, API, store). Needs
migration `0008_languages.sql` before the Worker. Not built: a `langue` column in the CSV import;
the choice is per entry (a runner in two races chooses in each). Later (the owner's call,
2026-09-29): a proper runner, signed in once and entered in several races, would hold the
language, the sign-in and the history instead of each entry.

### Race-day edge cases (2026-09-29, branch `claude/run-edge-cases`, merged)
The owner asked for a review of what can go wrong mid-race: no network, the app closed or the
phone restarted, a low battery, GPS gaps (tunnels), and whether the countdown follows the
countdown file (it does). JS and Worker only, no new native module: it reaches `Sivoov
(Preview)` by OTA. Built (ARCHITECTURE.md, "A run survives the app" and "Battery"):
- **A run survives the app.** The run journals itself as it goes; a killed app, a crash or a
  restarted phone reopens straight into the run, which carries on from where the runner is (the
  clock never stopped); « Votre course continue » (resume or stop and save) only if the GPS will
  not restart; after 2 h without a sign of life the run is closed and sent silently. The audio
  pack now starts downloading at app start, not on the home screen. On Android the location
  service outlives a swipe (`killServiceOnDestroy: false`) and fixes that arrive with no run
  listening go to the journal, or switch off a GPS nobody reads.
- **GPS gaps.** A tunnel is bridged by a straight line (tested); the lines that fell due in a
  gap over a minute are dropped, bar the finish, instead of a late burst. Fix timestamps years
  off (GPS week rollover) are dated on arrival.
- **Battery.** At 20 % or with power saving: the screen may sleep and the GPS goes to its saver
  pace. The clock and the map's glide no longer redraw 8 times a second in a pocket.
- **Offline** (a subagent's pass, reviewed): the pack's manifest and files are kept in the
  document dir, so a cold start with no network still has the whole ceremony and every line;
  a phone never plays a remote URL; downloads have a 30 s deadline; a live line is downloaded
  within its 7 s or the offline version plays, with a breaker after two failures; sign-in and
  the course read their caches first; the native map falls back to the diagram after 6 s
  without a style. Uploads retry every 30 s while on screen.
- **The countdown**: the digits come from the countdown file only (one line, the last before
  the gun), never above its whole seconds (an MP3's 10.03 s showed « 11 »); a gun file that
  never loads starts the clock when « Un » ended, not 8 s later; the web reel counts to the gun
  mark. The studio warns when a countdown is not 10 ± 0.3 s long (Deauville's TTS take is not),
  when there are two, or no gun.
- `reset()` could turn a left run 'finished' after the fact (a phantom finish uploaded later).
Verified: all tests; on the web target with a mocked browser GPS: a real (non-simulated) run,
reload mid-run → back in the run at the right distance, same id, clock continuous → stop and
save → uploaded, journal cleared. Screenshot scene `run-resume` (reopens straight into the run). **Not yet on a phone** (DEVICE.md, "the ways a run gets
interrupted").

### The race home and the pre-flight, tidied (2026-09-29, branch `claude/post-login-page-layout-3f894a`)
The owner's review of the page after sign-in. JS and Worker only (OTA).
- **Home order**: welcome, the bib with its distance (« Semi-marathon · 21,1 km », no count of
  places), the race window, then the action, then the course.
- **« Faire une répétition »** before the race opens only where nobody real races: preview and
  local, test accounts (App Review's too), demo races (`mayRehearse`, `rehearsal` in `/api/me`).
  It says under it that registered runners do not see it. A real runner in production sees the
  window and no button until it opens.
- **The course card**: the course drawn by the app over a Mapbox map framed on it
  (`map.png?base=1`, `fitView`), start, finish and numbered places (left off the map where they
  would pile up), then the places with their distance, and what they are for: each is announced
  at its distance.
- **Pre-flight**: « Retour » replaces « Relancer les vérifications »; the GPS keeps looking while
  the screen is open, a failed pack download retries every 15 s, the buttons stay at the bottom
  on a small phone. A pack published since the app loaded replaces the one on the phone here.
- **Start screen**: no more « Carte du parcours gardée sur le téléphone ».
Seen in the web target (`npm run shots`, home, prepare, run-ready); not yet on a phone.

### The run screen, rebuilt (2026-09-29, branch `claude/run-screen`)
The owner asked for a run screen that is highly functional, polished and clear, with the race's
place in 3D at eye level, without deciding the identity (DESIGN.md, the run screen exception).
- **The map**: `@rnmapbox/maps` (new native module, ARCHITECTURE.md), Mapbox Standard, 3D
  buildings, lit by the sun over the course now. Ready: the whole course, tilted. On Start the
  camera flies to the start line at eye level; during the run it stands behind the runner and
  moves along the course with the real distance, gliding between GPS fixes. « Vue » switches to
  the whole course or to the numbers alone. The course is kept offline from the race home.
  Older shells (no native SDK) keep the course diagram. The token comes with `/api/me`.
- **Clarity**: next place and how far, distance, clock, pace; GPS state only when not good;
  subtitles of what the voice says; the start ceremony's words written out on the line, its
  countdown digits over the start line (they follow the ceremony's own countdown file).
- **The voice**: « Annonces » opens everything said so far (km, time, words, « Réécouter ») and
  « moins de voix » (Tout / Le parcours / L'essentiel). Packs now carry each line's caption.
- **Stopping**: hold 1.5 s with a filling ring and haptics, then a confirmation; Android's back
  asks the same. The gun is a firm haptic tap.
Seen in the web target (`npm run shots`, run scenes); **not yet on a phone**: needs a new EAS
build (the SDK is native), then a real run to look at the map in daylight, the battery with
the map on screen, and the offline region.

### Ready for iOS and for organizers' testing (2026-09-28, branch `claude/ios-readiness`)
The owner wants a TestFlight link (and a Play testing link) for a few race organizers. Built,
so the first App Review passes the first time (runbook: STORES.md):
- **iOS « Lorsque l'app est active » is enough**: the pre-flight accepted only « Toujours », which
  iOS never offers in its first prompt. iOS is no longer asked for it; background updates start
  with "while using" (checked in expo-location's source: it needs only the foreground permission
  and sets `allowsBackgroundLocationUpdates`). Android unchanged. Not yet on an iPhone.
- **Demo races** (ARCHITECTURE.md): staff press « Créer la démo » in a race's settings. Its own
  runners, results and admin (the real race's dashboard never sees them), the real race's courses
  and sound through `demo_of` (always in sync), open every day, a ten-minute simulated run on its
  home for a desk demo, and App Review's runner (`review@example.com`, code `000000`, demo races only).
- **Sign-in by email**: the race is worked out; asked only when the email is in several races,
  the bib only when two entries of one race share the email. Web sign-in too.
- **Privacy**: `/confidentialite` (`/privacy`), linked from every footer and the app;
  « Supprimer mes données » on the app's home (runs, traces, cards, AI lines, sessions; the
  entry stays with the organizer).
- **Native config** (next build): ids `app.sivoov.run{,.preview,.dev}`, no non-exempt
  encryption, app privacy manifest, French and English location prompts. Install page links
  from `IOS_APP_URL` / `ANDROID_APP_URL` (« L’app arrive… » until set).
Verified: 212 API tests (18 new), the web target (reviewer sign-in, demo home and run, deletion),
the screenshot rig, and an `expo prebuild` of the iOS project (plist, strings, manifest).

### The 10 km des Champs-Élysées (2026-09-27, branch `claude/champs-elysees`)
The owner's call: convince the organizer (SCO, who also run Deauville, sold out, already
selling a self-declared "connecté" entry) that a virtual race can be amazing with audio. Built:
- **The race** in local, preview and production D1: `10km-champs-elysees-2027`, the official GPX,
  twelve places measured on it, the organizer's logo and photo, the Paris Masters Circuit on the
  theme. Test bibs 2001-2003 on local and preview (`marc@`, `lea@example.com`, and the owner).
- **The race page** rebuilt around the race's identity and « Écoutez la course »: a five-minute
  demo reel played over the course, runner dot, race clock, countdown digits, subtitles.
  Preview: https://preview.run.sivoov.app/10km-champs-elysees-2027.
- **The sound**, produced with `npm run produce` (AUDIO.md, "Produced sound"): a native French
  Gemini voice, BBC crowds and Paris sounds, music composed with Lyria, twenty lines with
  ambiances under the big moments, heard back by an AI listener. Published on preview.
- **Ambiances under lines** and **Gemini voices** in the pipeline and the app (JS only, OTA),
  and the app's sign-in asks which race when two are open.
Preview is complete (pack v1 published, 28 files, 16.5 MB; the page plays the reel). Production
runs main's Worker: the race, the produced draft and the reel are in production D1/R2, but the
new page, the ambiances and Gemini renders need this branch merged, then « Publier » in the
studio. Gemini's free tier allows 100 TTS renders a day per model (MEMORY.md).

### First real run (2026-09-27)
The owner ran 9.2 km in 46 min with `Sivoov (Preview)` on a Galaxy S23 (SM-S911B, Android 16),
signed in as test bib 1002, screen locked, phone carried, with the owner's Garmin Fenix 8 recording
the same run (read through Strava). Preview run `mujbwasn-hwxict1f`.
- **Background GPS works.** 1 998 batches, 2 774 fixes at a steady 1 Hz (longest gap 3 s), none
  dropped, accuracy 3.3 m median (worst 9.8 m). The "0 GPS" indoor readings were stationary
  throttling, as suspected. 16 announcements fired in order (ceremony, 4 landmarks, 9 km calls)
  and the upload landed with its trace and logbook.
- **Distance read 1.9 % short.** The app said 9.03 km; the watch covered 9.20 km over the same
  46 min (the watch started 3 min and 524 m earlier). The phone's positions alone summed to within
  0.3 % of the watch; the loss came from the tracker's +-15 % clamp to the phone's reported speed,
  which read 8-16 % under the watch all run. Km calls drifted late against the Garmin's distance:
  2 s at km 2, 21 s at km 4, 49 s at km 9. By ear they could not be compared: the Garmin was
  started 524 m earlier, so its km beeps and the app's km calls were never meant to coincide.
- **Battery: not measured.** The owner's recollection is 60 → 30 %, not read off the phone, and
  the app had been open about 44 min before the start. If 30 % really went on the 46 min run, a
  4-hour marathon would need about 1.5 phones against the PRD's half. The logbook now records the
  battery itself (below).
- **Fixed on this branch** (`shared/src/domain/smoothing.ts`): the reported speed is now a loose
  ceiling (x1.5), used as a floor only when the fixes stall (a hairpin), and the minimum step grows
  with the fix's accuracy. Replaying the same run: 9 225 m, +0.23 % against the watch, every km
  within 4-7 s of it. The run is a test fixture now (`shared/src/fixtures/firstRealRun.ts`, moved
  to Deauville so the repo does not hold the route). Not yet on the phone.

| Area | State |
|---|---|
| shared domain | Schemas + pure domain logic: course projection, splits, audio triggers, upload replay (`evaluateUpload`). Tracker: +0.23 % against a watch on the first real run (9.2 km, S23); about 1 % at 8 m simulated GPS noise. |
| API / web pages | Cloudflare Worker (Hono), deployed to preview and production. Sign-in by bib + email code (Cloudflare Email Sending). Landing, prepare, install, results, certificate and upload pages are server-rendered. |
| organizer admin | Rebuilt: one sign-in per email across every race, roles (owner/editor/viewer) plus staff. Race home, Coureurs, Activités, Parcours et annonces, Équipe, Réglages. French only. |
| audio studio + pack | `/org/{race}/courses/{courseId}` (AUDIO.md): Mapbox GL map that zooms on gesture and follows the list, voice picker (ElevenLabs, Eleven v3 with `[tags]` by default), per line « La voix / Personnalisée / Votre fichier », personal lines with fields (`{prenom}`, `{dossard}`, `{temps}`…) or written by Claude per runner, each with an offline version, « Écouter un exemple », « Proposer un texte », the start ceremony shown second by second with where the clock starts, publish. The app downloads each runner's own lines with the pack and asks for live ones as they play. Built on `claude/audio-studio-voices` (2026-09-26), not yet merged or deployed. Pack v0 heard on a Galaxy S23 (2026-09-13). |
| app run / finish / share | Sign-in, race home, prepare, run (course diagram, start ceremony), finish (share, certificate link), results. Verified on a Galaxy S23: foreground service, audio, finish and upload all real, and a 9.2 km real run with the screen locked (2026-09-27, above). |
| device loop | Loop 2a (cable, `npm run device`) and loop 2b (no laptop: standalone `Sivoov (Preview)` release shell on the `preview` OTA channel, device logbook via Diagnostic) both proven on a phone. See WORKFLOW.md, DEVICE.md. |
| screenshot rig | `npm run shots` renders every app screen and web page (~70 s) into `docs/shots/`; `npm run shots:store` writes App Store / Play sized files. See SHOTS.md. |
| results / certificate / cards | `/{race}/results/{bib}` is the certificate (prints to A4, shares). Share cards (og/story) are HTML pages photographed by Cloudflare Browser Rendering, cached in R2; real rendering needs `BROWSER_RENDERING_TOKEN` (not set yet). A runner without a time yet gets a shareable bib page/card instead. |
| upload fallback | `/{race}/upload`: a GPX is replayed through the app's own tracker (`evaluateUpload`), refused with a reason (treadmill, short, too fast, outside the window) or accepted within 0.5% distance tolerance. Not yet tried with a real Strava or Garmin Connect export. |

## Next, in order

0. **Champs-Élysées: show it to the organizer.** Merge `claude/champs-elysees` (deploys
   production), then publish the pack in production's studio, then run the 10 km on the phone
   with the preview shell (bib 2003 on preview) and listen for the ambiances, the Gemini lines
   (WAV) and the finish. Then the licensing and recording list in CHAMPS_ELYSEES.md.

Anchored to PRD milestones (M2 10 Oct, M3 17 Oct, M4 31 Oct).

1. **Put the tracker fix on the phone and run with the Garmin again.** Merge this branch (the
   OTA reaches `Sivoov (Preview)` through Diagnostic → *Chercher une mise à jour*), then one more
   run with the Garmin, ideally somewhere harder: a U-turn, tall buildings or trees. Start the
   Garmin when the app's gun fires, so its km beeps and the app's km calls should land within a
   few seconds of each other. The logbook now records the battery (at the start, every 5 min,
   at the stop, with power saving and battery optimization), so the drain comes back with the
   trace. Pull it (the admin's `trace.json`, see MEMORY.md) and compare with the Garmin. One phone and one route in good GPS conditions is all
   the tracker has seen; a phone that reports its speed more than ~25 % low would still lose distance.
   For M2, a real finish: nobody has covered a course's full distance with the app yet. A test
   entrant on a short course on preview (a 5 or 10 km course) would make that a normal run.
2. **iOS: the accounts, then the first build.** The app side is ready (above); the owner's
   steps are in STORES.md. Then, on an iPhone (an iPad proves audio and sign-in, not GPS): a real
   run with the screen locked, background audio with Spotify ducked (with `duckOthers`, iOS may
   keep other audio ducked for the whole run), Gemini WAV lines. Then the TestFlight public link
   in `IOS_APP_URL`.
4. **Real uploads and link previews**: send a real Strava and a real Garmin Connect export
   through `/{race}/upload`; paste a result link into WhatsApp and iMessage and look at
   the preview.
5. **Production entrants**: import the organizer's real CSV through the admin
   (`/org/deauville-2026`).
6. **Selling entries (Paddle)**: replace the "Vente en ligne" placeholder with a price per
   distance and a checkout; a paid checkout creates the entrant and sends the instructions
   email that already exists. Needs the Paddle account, a webhook route, and a decision on
   who is the merchant of record.
7. **Audio v1**: merge `claude/audio-studio-voices`, then on preview: choose the voice (v3),
   move the ceremony lines to « Avant le départ », add the runner's call by bib and name and
   the finish call with `{temps}`, write every offline version, record, publish, and listen on
   the phone (the app update must be on the phone first: older builds play no cue and no
   personal line, only the offline files). Then the rewritten Deauville script (double loop,
   ~38 events), "moins de voix", beds (a crowd loop under the voice needs the player to mix),
   the rehearsal pack, the post-run race report. Not built: `interval` trigger, number
   fragments (live splits need a network; offline they play the generic line).
8. **The run screen's map on a phone**: merge `claude/run-screen`, make a new `preview` EAS
   build (native SDK), run with it: the map in daylight on a real screen, the
   battery with the map shown against the numbers view, the offline region (airplane mode at
   the start). The race home could use the same map later instead of its PNG.
9. **Web polish**: hero photo and real theme from the organizer, English copy review, OG
   image, English admin variant.
10. **A runner, not only entries** (not now): one sign-in for a person entered in several races,
    holding their language, devices and history; today each entry signs in on its own.

## Owner actions

- **Listen to the Champs-Élysées** (`api/.produce/out/10km-champs-elysees-2027-{10k,5k}/`):
  `run-5-30.mp3` first with its timeline `run-5-30.md` (a stop at 42 %, a walk at 80 %), then
  `reel.mp3`; then the casting page `api/.produce/out/casting/index.html` (blind; `key.json`).
  Listen for: the voice's age and energy, the regulars' « Allez Camille ! », the crowd made of
  voices, the rhythm (no long silences, not too many cheers), the U-turn and the finish. Your
  notes go in the next session; the voice is one constant in the script.
- **Gemini TTS quota**: our key allows 10 requests a minute per model, and the lite model (the
  Worker's fallback on a 429) 100 a day. A runner's pre-flight now asks for ~20 name renders,
  cached per first name: fine for a demo, not for a race week. Ask Google for a higher quota (AI
  Studio → the project → rate limits) before real entrants.

- **Share cards and race photos** (this branch): a new EAS build for the photo picker
  (`expo-image-picker`), then run migration `0009_photos.sql` before the
  Worker (`npx wrangler d1 migrations apply sivoov-run --remote --env preview`, then without
  `--env` for production, then deploy). Set `BROWSER_RENDERING_TOKEN` (below) or no report PNG
  ever exists. Check the Google AI Studio key's tier allows `gemini-2.5-flash-image` (not checked from here;
  roughly 0.04 USD a picture at list price, three at most per runner and moment), then on
  preview: `/org/deauville-2026/photos` → « Essayer avec votre photo » is the first real render.
  Then add real photos of the places (the organizer's) to each moment. A newer model is the
  `GEMINI_IMAGE_MODEL` var.

- **Runner language** (merged 2026-09-29): production needs its migration first, then the Worker: `npx wrangler d1 migrations apply sivoov-run --remote && npx wrangler deploy`
  from `api/` (same for preview with `--env preview`). The app part is JS only (OTA).

- **Stores** (STORES.md): Apple Developer Program as an organization (D-U-N-S), Play Console
  organization account. Then send the TestFlight and Play testing links to set as `IOS_APP_URL`
  and `ANDROID_APP_URL`.
- **Production** (CI is out of minutes, and production is a manual promote anyway): run the
  migration, then the Worker, from `api/`, in that order (the new Worker reads `races.demo_of`):
  `npx wrangler d1 migrations apply sivoov-run --remote && npx wrangler deploy`. Then « Créer la
  démo » on the race to show (staff, its Réglages) and add the organizers to the demo's Coureurs.
  App Review signs in as `review@example.com` / `000000`.
- **The privacy page names the company**: give its legal name, registered address and a
  contact email for data questions (`LEGAL_NAME`, `LEGAL_ADDRESS`, `PRIVACY_EMAIL` vars). Until
  then it says « édité par Sivoov » with no address. Have the text read by whoever does the
  company's legal side.
- **The S23**: `npm run device:preview` once to install the shell under its new package
  (`app.sivoov.run.preview`); the old one keeps receiving updates meanwhile.

- **Google AI billing for Gemini voices**: the key is on a tier that allows a few TTS requests a
  minute. Before real entrants (live splits for many runners at once), enable billing on the
  Google AI Studio project (Tier 1). Until then a refused render plays the offline version.
- **Merge `claude/champs-elysees`**, then in production's studio
  (`/org/10km-champs-elysees-2027/courses/10km-champs-elysees-2027-10k`) press « Publier », or
  `npm run produce -w api -- 10km-champs-elysees-2027 production` again first if anything changed.
- **Before selling Champs-Élysées entries**: the licensing list in CHAMPS_ELYSEES.md (BBC sounds,
  Lyria terms, the organizer's photos), and ask the organizer to record the 2027 race.

- **Claude for AI lines**: in the Cloudflare dashboard, AI Gateway "sivoov" → Provider keys, add
  the Anthropic key (or turn on unified billing for Anthropic). Nothing to change in the Worker:
  until then, AI lines are written by Llama 3.3 on Workers AI through the same gateway, and the
  studio says so. If the gateway is made authenticated, `CLOUDFLARE_AI_TOKEN` also needs the
  "AI Gateway: Run" permission.
- **ElevenLabs key**: give it the `voices_read` permission so the studio lists the account's
  own voices (native French voices added from the Voice Library). Today it can only render.

- **Share cards**: create a Cloudflare API token (Browser Rendering - Edit, account
  `6bd098851f5995454ecdbad6744c567c`), then `npx wrangler secret put
  BROWSER_RENDERING_TOKEN` for production and `--env preview`. Verify at
  `https://preview.run.sivoov.app/deauville-2026/og.png` (a PNG means it worked).
- **iOS**: activate the Apple Developer Program account, then `npx eas-cli login` and
  `eas credentials` once (WORKFLOW.md, "The one laptop session").
- **Production entrants**: hand over the organizer's real entrant CSV (bib, name, email,
  distance, address) for import.
- **Race content**: confirm the rewritten Deauville audio script/brief and any real
  ceremony recordings (announcer, crowd) before the next publish.

## Decisions

Newest to oldest, durable ones only. Rationale already written up elsewhere is not
repeated here (see ARCHITECTURE.md, AUDIO.md, WORKFLOW.md).

- A run that died comes back as the same run with the clock still running (a real race's clock
  never stops); the minutes the phone was dark count as a straight line. It resumes by itself
  (owner's call: only the hold-to-stop ends a run) up to 2 h after its last sign of life, within
  8 h of the gun; after that it is closed and sent.
- Swiping the app away no longer ends a run on Android (the service stays, its notification
  says so). Stopping is only ever the runner's hold-and-confirm.
- The screen stays on during the run unless the battery is low (20 %, power saving); then the
  phone's own sleep applies. GPS saver pace switches once and never back.
- A countdown not 10 s long is a studio warning, not a publish blocker (a voice take never
  lands on 10.0 s; blocking would stop every organizer).

- The run screen shows the course in 3D with the native Mapbox SDK, camera behind the runner by
  default; the diagram is the fallback and the runner's battery choice (owner's request,
  2026-09-29; supersedes "course diagram, not a map" for the run screen).
- The public pack carries each line's caption (its words, as the files say them aloud), never
  the script's authoring (templates, AI instructions, voice); supersedes "titles and keys only".
- « Moins de voix » is the runner's, three levels; a silenced line is still logged and listed.
- The run screen gets motion and a map without an identity decision: tokens only, motion only
  where it says something (DESIGN.md).
- Store ids `app.sivoov.run`, accounts the company's; nothing was published before (2026-09-28).
- iOS asks only for "while using" location; Android still needs "always".
- A demo race borrows the real race's courses by `demo_of` instead of copying them: always in
  sync, no publish hook. Runner data stays keyed on the entrant's race.
- Sign-in is by email; the answer « this email is in these races » names the races to whoever
  types the email. Accepted: entries and results are public in road racing anyway.
- « Supprimer mes données » erases what Sivoov collected and keeps the entry (the organizer's
  record); rendered voices stay in the sentence-hash cache, tied to nobody.
- The demo race's home offers a simulated run in release builds; everywhere else simulation
  stays development-only.

- The race page carries the race's identity (its colours, an accent, its photo, logo): the
  owner asked for a good landing page, which lifts "no opinionated design" for the race layer
  of that page; the Sivoov layer (header, footer, tokens) is unchanged (2026-09-27).
- A line may have an ambiance under it, pre-mixed and played on a second player; one ambiance
  at a time (2026-09-27, AUDIO.md).
- Gemini TTS is a second voice provider, through the AI Gateway, stored as WAV; the owner said
  to use Google's APIs (2026-09-27). The Champs-Élysées speaker is Gemini "Sadachbia".
- Produced sound is mixed offline (`api/tools/produce`, ffmpeg) and enters the pipeline as the
  organizer's own files, so the studio and publishing need no special case.
- The circuit a race belongs to is on its theme (`theme.series`), not a table: no migration.

- Every line keeps a sound that works offline, in the pack; a personal line is a bonus on top
  of it, never a dependency (2026-09-26, AUDIO.md).
- The AI writes per runner before the start (prepare time) and drafts text in the studio;
  never during the run. The run's numbers are said live by filling a template and rendering
  it on the spot, with a 4 s budget and the offline version behind (the owner asked for
  generation with an offline fallback; this replaces number fragments for now).
- Every LLM call goes through Cloudflare AI Gateway "sivoov", never to a provider directly (the
  owner's call, 2026-09-26). The Worker holds only `CLOUDFLARE_AI_TOKEN`; the gateway holds the
  Anthropic key. Claude (`claude-opus-5`, low effort, server-side refusal fallbacks) first,
  Workers AI Llama 3.3 70B on the same gateway when Claude is unreachable. Weather from
  Open-Meteo (no key), position rounded, not stored.
- Eleven v3 is the default voice model (tags, French via `language_code`); older drafts keep
  their model until the organizer changes it. House voices are ElevenLabs' own, checked with
  our key; native French voices come from the Voice Library by id.
- The admin maps are Mapbox GL JS from Mapbox's CDN (Leaflet dropped).

- Race window is enforced for ranking, not for running: a run outside it is stored and
  shown to the runner as a rehearsal (before) or a closed-window run (after), never ranked
  (`shared`: `isRanked` / `finishOutcome` / `bestRankedRun`, SQL twin `api/src/db/ranked.ts`).
- Re-running is allowed during the window; only the runner's best time counts.
- Share cards are HTML pages photographed by Cloudflare Browser Rendering (REST, no
  package), cached in R2 per run and language.
- The app shares a link, not an image: the link's preview is the card; the web page
  shares the image file directly where the browser allows.
- The certificate is the web page, printed to PDF by the browser's own print CSS. No PDF
  library.
- Upload tolerance: 0.5% of the course distance is credited for a watch stopped on the
  line.
- No opinionated design until the identity is decided: new surfaces use only the existing
  tokens and components (DESIGN.md, "Until the identity is decided").
- Audio script projection is authoring-time: a map click is turned into meters along the
  course by the Worker and stored as `{kind: 'distance', meters}` (AUDIO.md).
- The studio's browser does no domain arithmetic: every position drawn comes from the
  server (`estimateFirings`); saving refetches the estimates.
- Progress on the virtual course is proportional to the official distance, not the GPX's
  own measured length.
- Distance is judged against the runner's Garmin over the app's own window: that is what runners
  will compare with. The owner's Fenix 8 is the reference (2026-09-27).
- Distance honesty filter: fixes filtered (accuracy <=30 m, <=10 m/s, a step of at least
  max(8 m, 3 x accuracy)), each step capped at 1.5 x the reported-speed distance and lifted to
  it (/1.15) only when the fixes stall by more than twice their accuracy, constant-velocity
  Kalman on cumulative distance. Changed 2026-09-27 from a +-15 % clamp, after the first real run
  showed the S23's reported speed reads 8-16 % low (MEMORY.md).

## Known gaps

- **From the 2026-10-09 reviews, left**: the voice renders have no atomic spend cap (the daily
  live quota is read-then-write; parallel `/me/voices` calls for a new name render twice); an
  organizer's M4A file has no length in the pack (the director counts it as 0 s); the real race's
  admin dashboard and runs filter list the demo's 5 km as a 0-runner row; `api/tools/audio`
  (`npm run audio:build`) ignores takes; `tools/produce/assets.ts`'s `voice()` deserves a loop
  instead of its four recursive re-entries; the tracker's crossing times move with the screen's
  clock ticks (a split or the finish can be dated up to a step late with the screen on).
- **Not done from PRODUCTION.md**: the leitmotif (one Lyria theme through the race); the sound
  library and its listening page (SOUND_LIBRARY.md: `origins.json` stands in); the pitch reel's
  5-minute cap is not enforced; no real outdoor run of either course yet; the owner's scores.
- **Older app bundles** cannot read a pack with a filler line (the Champs packs): they show the
  pack as failed and say the run by captions until their JS updates (the next launch after the
  OTA). The new JS reads packs leniently, so this cannot happen again.

- Run recovery, the swipe-away service, the saver pace and the offline cold start are tested in
  the store and on the web target only. On Android: does the JS survive a swipe (the run goes on
  with its voice) or does the headless task journal the fixes? Does Samsung let the service
  live? On iOS a killed app records nothing until reopened (the gap is a straight line).
- Old audio pack versions are never deleted from the phone (a few MB per republish).
- The native map gives up after 6 s without its style: a slow first load shows the diagram for
  that run.
- GPS lost is shown (the chip), never said: the pack has no « signal GPS perdu » line.

- The run screen's map was first seen on a phone in the 2026-09-29 rehearsal (about 27 %/h with
  it on screen). Its offline region is untested; the Standard style's offline region in
  particular (style imports) may need adjusting.
- Mapbox usage: every run screen opening loads a map (Mapbox counts map loads); check the
  account's free tier against the number of runners before race week.

- Champs-Élysées: the BBC sounds are for a draft only (RemArc licence); Lyria's commercial
  terms are unchecked; the photos and logo are hot-linked from the organizer's site.
- Gemini lines are WAV: never played on an iPhone yet (Android sniffs the format).
- iOS has never run the app. "While using" background updates, background audio started from
  the location task, and `duckOthers` over other apps are read from the docs and the source,
  not seen on a phone.
- The demo run is a simulation at about 5x (10 km) to 21x (marathon): lines crowd at the higher
  speeds; nobody has listened to one end to end.
- The privacy page has no retention job behind "kept while the race is online": nothing deletes
  old runs automatically yet.
- The studio cannot upload an ambiance, nor pick a Gemini voice from its voice list (it keeps
  one it is given): the production tool sets both.
- The app still only runs one race at a time per sign-in (fine), and the home's race card and
  prepare screen were not looked at with the 10 km course.

- Share cards have never been rendered by the real Browser Rendering API (waits on
  `BROWSER_RENDERING_TOKEN`); the container also cannot reach Google Fonts, so local
  screenshots of cards and pages show fallback fonts, not Fraunces / Barlow Condensed.
- Nobody has pasted a result link into WhatsApp, iMessage or LinkedIn yet to see the link
  preview.
- Uploads are trust-based: a GPX's timestamps are believed as given, and an app run's numbers are
  checked for plausibility only (record floor, fastest kilometre, wall clock), not replayed from
  its trace; results mark files "import" and the organizer sees them.
- The admin is French only; `/organisateurs` and the runner-facing pages are FR/EN.
- Web runner sessions do not update `last_seen_at` (only the app's API calls do), so "last
  visit" on a runner page is the app's only.
- The instructions email limit (3 a day per runner) is enforced from a log in R2, not D1.
- iOS phones show as "iPhone" / "iPad" without the model (needs expo-device, a native
  module).
- No production entrants yet: seeded or imported by hand only.
- The tracker has seen one real run, on one phone (S23), in good GPS conditions (3.3 m median
  accuracy) and with no U-turn. No iPhone yet. The +0.23 % is against a watch, which has its
  own error; the hairpin floor has only been exercised on simulated runs.
- Which live lines played at each km on the first run (the rendered number or the offline
  version) is not in the trace: the logbook has no audio lines.
- Battery over a long run is unmeasured, against a PRD budget of half a phone for a
  marathon. The first run's "60 → 30 %" is a guess; the logbook records it from the next run on.
  A run that reaches its finish line uploads before the `stop` battery line is written, so its
  last reading is the latest 5-minute one.
- `WARN No task registered for key expo-task-manager` appears on every dev-client start;
  believed benign but not checked against a `preview`-profile build.
- The Worker's ElevenLabs render has run for real only from a local Worker (2026-09-26: a v3
  voice audition and a personal example); never yet from preview or production.
- Claude has only answered stubbed tests: the "sivoov" gateway holds no Anthropic key yet (it
  answers 401), so real AI lines are written by Llama 3.3 today (checked from a local Worker
  through the gateway, 2026-09-26). Read the first ones before a runner hears them.
- Live lines (splits, the finish call with `{temps}`) need the phone's network at that moment,
  in the background with the screen locked: untested on a device. Each is one ElevenLabs
  render (about 2 s, cached by sentence); budget roughly 10 per runner for splits every 5 km.
- The organizers page promises the crowd at the finish: it is only possible today as the
  organizer's own file on a line, not as a bed under the voice.
- No Android build has been made yet on the `production` channel; only the
  `preview`-channel release shell has run on a phone.
- The app is scoped to a single race (`deauville-2026`, `RACE_SLUG`) until a second race
  exists.
- Upload fallback: treadmill runs are refused while the PRD says the fallback "covers
  treadmills" (open: an organizer-reviewed declaration, or trusting TCX `DistanceMeters`);
  TCX files are not read (about half a day). Judging a marathon GPX costs 60-110 ms of CPU:
  fine on Workers Paid, over the Free plan's 10 ms, so check the account's plan before race week.
- Placeholders still in the product: pricing ("Tarif sur demande", `organizers.price.*`), the
  organizers hero mockup (`ORGANIZERS_HERO_IMAGE`), the "Vente en ligne" card, Deauville's
  support email and logo (set them in Réglages).
- Run store: `tick()` mixes the wall clock into `elapsedMs` between fixes (small split skew),
  and the persisted upload entry still carries the splits in SecureStore.
