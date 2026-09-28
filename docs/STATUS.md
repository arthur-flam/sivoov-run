# Status

Updated: 2026-09-28. Race week: 14-15 November 2026 (Marathon International de Deauville).
Second race: 10 km des Champs-Élysées, 7 February 2027 (docs/CHAMPS_ELYSEES.md).
Milestones: PRD.md section 8 (M1 26 Sep, M2 10 Oct, M3 17 Oct, M4 31 Oct, freeze 7 Nov).

## Where we are

Live: https://run.sivoov.app/deauville-2026 (production), https://preview.run.sivoov.app
(preview). Test sign-in and roles: docs/ACCESS.md. M1 is done. The first real run happened
on 2026-09-27 (below); M2 still needs a real finish. Production has the race and its courses;
no real entrants yet.

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
  home for a desk demo, and App Review's runner (`review@example.com`, code `REVIEW_CODE`).
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
8. **Native Mapbox in the app**: replace the static PNG race-home map with
   `@rnmapbox/maps` (course line, a live runner dot as an option next to the diagram).
   Needs a new build; record it in ARCHITECTURE.md's native module list when it lands.
9. **Web polish**: hero photo and real theme from the organizer, English copy review, OG
   image, English admin variant.

## Owner actions

- **Stores** (STORES.md): Apple Developer Program as an organization (D-U-N-S), Play Console
  organization account. Then send the TestFlight and Play testing links to set as `IOS_APP_URL`
  and `ANDROID_APP_URL`.
- **After merging `claude/ios-readiness`**: `npx wrangler secret put REVIEW_CODE` (production,
  six digits), then « Créer la démo » on the race to show (staff, its Réglages), and add the
  organizers to the demo's Coureurs. The migration (0007) runs with the deploy.
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
- Uploads are trust-based: a GPX's timestamps are believed as given; results mark them
  "import" and the organizer sees them, but a stricter check needs a product decision.
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
