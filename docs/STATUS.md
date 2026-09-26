# Status

Updated: 2026-09-26. Race week: 14-15 November 2026 (Marathon International de Deauville).
Milestones: PRD.md section 8 (M1 26 Sep, M2 10 Oct, M3 17 Oct, M4 31 Oct, freeze 7 Nov).

## Where we are

Live: https://run.sivoov.app/deauville-2026 (production), https://preview.run.sivoov.app
(preview). Test sign-in and roles: docs/ACCESS.md. M1 is done bar the moving-tracker walk
test (see Next, item 1). Production has the race and its courses; no real entrants yet.

| Area | State |
|---|---|
| shared domain | Schemas + pure domain logic: course projection, splits, audio triggers, upload replay (`evaluateUpload`). Tracker holds ~1% distance error at 8 m simulated GPS noise. |
| API / web pages | Cloudflare Worker (Hono), deployed to preview and production. Sign-in by bib + email code (Cloudflare Email Sending). Landing, prepare, install, results, certificate and upload pages are server-rendered. |
| organizer admin | Rebuilt: one sign-in per email across every race, roles (owner/editor/viewer) plus staff. Race home, Coureurs, Activités, Parcours et annonces, Équipe, Réglages. French only. |
| audio studio + pack | `/org/{race}/courses/{courseId}` (AUDIO.md): Mapbox GL map that zooms on gesture and follows the list, voice picker (ElevenLabs, Eleven v3 with `[tags]` by default), per line « La voix / Personnalisée / Votre fichier », personal lines with fields (`{prenom}`, `{dossard}`, `{temps}`…) or written by Claude per runner, each with an offline version, « Écouter un exemple », « Proposer un texte », the start ceremony shown second by second with where the clock starts, publish. The app downloads each runner's own lines with the pack and asks for live ones as they play. Built on `claude/audio-studio-voices` (2026-09-26), not yet merged or deployed. Pack v0 heard on a Galaxy S23 (2026-09-13). |
| app run / finish / share | Sign-in, race home, prepare, run (course diagram, start ceremony), finish (share, certificate link), results. Verified on a Galaxy S23: foreground service, audio, finish and upload all real; the tracker itself has never seen a moving runner. |
| device loop | Loop 2a (cable, `npm run device`) and loop 2b (no laptop: standalone `Sivoov (Preview)` release shell on the `preview` OTA channel, device logbook via Diagnostic) both proven on a phone. See WORKFLOW.md, DEVICE.md. |
| screenshot rig | `npm run shots` renders every app screen and web page (~70 s) into `docs/shots/`; `npm run shots:store` writes App Store / Play sized files. See SHOTS.md. |
| results / certificate / cards | `/{race}/results/{bib}` is the certificate (prints to A4, shares). Share cards (og/story) are HTML pages photographed by Cloudflare Browser Rendering, cached in R2; real rendering needs `BROWSER_RENDERING_TOKEN` (not set yet). A runner without a time yet gets a shareable bib page/card instead. |
| upload fallback | `/{race}/upload`: a GPX is replayed through the app's own tracker (`evaluateUpload`), refused with a reason (treadmill, short, too fast, outside the window) or accepted within 0.5% distance tolerance. Not yet tried with a real Strava or Garmin Connect export. |

## Next, in order

Anchored to PRD milestones (M2 10 Oct, M3 17 Oct, M4 31 Oct).

1. **The walk test, then the acceptance run.** The tracker has never seen a moving runner:
   two indoor tests read "0 GPS - 0 rejetés", most likely stationary throttling but still
   unverified. Walk 200 m and read the finish screen's counts; non-zero clears it, zero
   means the background task never reaches JS. Then a 1-2 km run, screen locked, phone in
   a pocket, and pull the trace (`npm run trace:pull`) to tune the tracker against real
   GPS. See WORKFLOW.md loop 2b for the device-logbook counters that tell the two apart.
2. **iOS does not exist yet.** No Apple Developer Program step done, no `eas credentials`,
   no build. Highest schedule risk on this page (PRD calls App Store review the critical
   path, submission due mid-October): start it before anything cosmetic.
3. **Turn on real share cards**: set `BROWSER_RENDERING_TOKEN` (see Owner actions), then
   check one real render on preview.
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
- Distance honesty filter: fixes filtered (accuracy <=30 m, <=10 m/s, >=8 m steps), each
  step bounded by Doppler speed +-15%, constant-velocity Kalman on cumulative distance.

## Known gaps

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
- The tracker has never recorded a moving runner: indoor tests read zero samples, most
  likely stationary throttling, but it stays unverified until someone walks with it.
- Battery over a long run is unmeasured, against a PRD budget of half a phone for a
  marathon.
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
