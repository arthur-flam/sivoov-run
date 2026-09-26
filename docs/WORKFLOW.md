# Workflow: building this from cloud sessions

The constraint: development happens in Claude Code on the web and on a phone. No Mac, no
simulator, laptop access only occasionally. The workflow is built around four loops. Loop 2b
is the one that matters outdoors: phone plus browser, no cable, nothing to plug in.

## Loop 1: validate in the container (minutes, no phone)
- `npm run typecheck && npm test && npm run lint` at the root before any push.
- API: `npm run dev -w api` starts the Worker with local D1 and R2. Hit it with fetch in
  tests or Playwright. Pages are server-rendered, so screenshots are cheap.
- App: `npm run dev -w app` serves the web target. Playwright (Chromium is pre-installed)
  drives it, with geolocation mocked and the simulation location service selected via
  `?sim=marathon-deauville&pace=5:30`. Screenshots are sent back into the session.
- A recorded GPS trace can be replayed the same way for regressions.
- `npm run shots` photographs every key screen and page headlessly in about seventy seconds
  and lays them out on a contact sheet (`docs/shots/index.html`). It is the fastest way to
  see a design change whole, and `npm run shots:store` produces the store-sized files.
  See `docs/SHOTS.md`.

## Loop 2a: the phone on a cable (minutes, laptop)
The Android SDK and JDK 17 are installed on the laptop, so the dev shell is compiled locally
and pushed over USB: `npm run device:build` once, `npm run device` every time after. No EAS
queue, no `EXPO_TOKEN`. This is the fastest loop when the laptop is at hand — see
`docs/DEVICE.md`. Everything below still applies to iOS, to shareable installs and when the
laptop is not around.

## Loop 2b: no laptop at all (this is the outdoor loop)
The phone carries **`Sivoov (Preview)`**, a standalone shell: the JS bundle is inside the APK,
so it needs no metro and no cable, and `expo-updates` is live on the `preview` channel. Built
once over USB with `npm run device:preview`; after that the chain is phone plus browser.

1. **Ship JS from a cloud session.** Validate in loop 1, push to main — `deploy.yml` publishes
   to the `preview` channel. Without a push, ask for it by hand, from a session or from
   GitHub's mobile web UI: `gh workflow run deploy.yml -f action=publish-preview`.
2. **Pull it onto the phone.** Open the app, finish screen → **Diagnostic** → *Chercher une
   mise à jour*: it fetches and reloads on the spot. (Left alone, expo-updates downloads in
   the background and swaps at the *next* launch, so it takes two starts. Outdoors, use the
   button.)
3. **Read what the phone saw.** There is no `adb logcat` out there, so the app keeps its own
   logbook: the background task's batches, the fixes it received, the fixes it dropped for
   want of a listener, permissions, uploads. Two ways back:
   - on the spot, the **Diagnostic** screen, with *Partager* to paste the whole thing into a
     Claude session from the phone;
   - afterwards, it rides to R2 inside the run's trace —
     `npm run trace:pull -w api -- preview <run-id>` prints the counters and every line.
4. **The counters that settle the walk test.** `task.batches` is how often Android called the
   JS task at all; `task.fixes` the fixes it handed over; `task.empty` batches with nothing in
   them (a stationary phone being throttled — innocent); `task.dropped` fixes that arrived
   while no run was listening (the bug). All zero, `task.batches` included, means the task
   never reached JS.

What still needs the laptop, and nothing else does:
- a **native** change (a new module, a permission, an icon) — rebuild with
  `npm run device:preview` over USB, or order it in the cloud with
  `gh workflow run deploy.yml -f action=build-preview` (EAS, needs `EXPO_TOKEN`);
- the **dev client** loop 2a, which is metro over a cable and strictly faster when the laptop
  is at hand. Note `device:preview` regenerates `android/` for the preview package, so going
  back to loop 2a costs one `npm run device:build`.

## Loop 2: ship to the phone by CI (minutes, no laptop)
- The native shell is built rarely with EAS Build (`workflow_dispatch` on `deploy.yml`,
  or `eas build --profile preview` from a session with `EXPO_TOKEN`).
- Every PR gets its own EAS Update branch (`preview.yml`). The dev client's launcher lists
  branches; open the one for the PR to test it. Merging to main publishes to the `preview`
  channel and deploys the Worker (`deploy.yml`).
- Production: the store build points at the `production` channel; a manual promote step
  publishes an update there.
- Rule: a JS-only change never waits for a build. A native change is a recorded decision.

## Loop 3: the run feeds back (hours)
- After each run the app uploads the raw GPS trace, the audio events fired, timing, and
  device info to R2, attached to the run. Crashes go to Sentry.
- Notes from the road are typed into the session from the Claude mobile app, and the device
  logbook is shared straight out of the Diagnostic screen.
- A session pulls the trace (`npm run trace:pull -w api -- preview <run_id>`, list the runs by
  leaving the id out), replays it in a test, and fixes against it.

## Session shape
- One vertical slice per session or PR. State the acceptance in the first message: which
  screens, which tests, which screenshot or device note proves it.
- Plan mode for anything touching the data model or the native shell.
- Review is the diff plus the screenshot. Merge from the phone.
- Keep `docs/STATUS.md` current at the end of every session; append gotchas to `docs/MEMORY.md`.

## Secrets and where they live
| Secret | Where | Used by |
|---|---|---|
| `EXPO_TOKEN` | GitHub Actions secret (optionally the cloud environment) | EAS Update, EAS Build |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secret | `wrangler deploy` |
| Resend, ElevenLabs, Sentry DSNs | Worker secrets via `wrangler secret put`, `.dev.vars` locally | api |
| `BROWSER_RENDERING_TOKEN` (Browser Rendering - Edit) | Worker secret, production and preview | api: share cards (`lib/cards.ts`) |
| Apple / Google credentials | EAS servers | EAS Build |
Cloud sessions need none of these for loop 1. Adding `EXPO_TOKEN` to the environment lets a
session publish an update directly (loop 2 without CI).

## The one laptop session (any OS, no Mac needed)
1. Apple Developer Program active; Google Play console account.
2. `npx eas-cli login`, `eas credentials` once to let EAS create and store certificates.
3. `eas build --profile development --platform all`, install the dev client on the phone.
4. Create the `EXPO_TOKEN`, Cloudflare and Resend secrets in GitHub.
5. Register `run.sivoov.app` and `preview.run.sivoov.app` on the Worker.
After this, everything is phone plus browser until a native change forces step 3 again.

## Cloud environment settings (claude.ai/code)
- Network: allow npm registry, `*.expo.dev`, `*.cloudflare.com`, `*.workers.dev`, Sentry,
  Google Fonts. Default "trusted" policy is enough.
- The `SessionStart` hook in `.claude/hooks/session-start.sh` installs workspaces so tests
  run immediately. Once merged to main every session gets it.
