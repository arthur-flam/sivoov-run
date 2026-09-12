# Memory (append-only)

- 2026-09-12: Previous repo (`arthur-flam/sivoov`) drifted: CLAUDE.md pointed at folders
  that did not exist and referenced docs that were never written. Cost: every session started
  wrong. Rule here: STATUS.md is updated at the end of every session, no exceptions.
- 2026-09-12: In the previous app, virtual runs were a flag on a 1000-line run screen that
  swapped in a debug mock-location adapter. Lesson: the location source is an interface from
  day one (device, simulation, replay), and the run screen does not know which one it has.
- 2026-09-12: Kalman smoothing on distance (not only on lat/lon) is what made splits stable.
- 2026-09-12: Expo SDK is 57 (React Native 0.86) as of June 2026. Pin the SDK, upgrade only
  between milestones.
- 2026-09-12: Simulating GPS with white noise per fix makes every distance filter look broken
  (raw distance inflates 100%+ at 8 m). Real receivers drift slowly. The simulator uses an
  AR(1) offset (correlation 0.98/s) and the tracker bounds each step by the Doppler speed
  (±15%); with that, distance is within ~1% at 8 m noise. Tune against a real trace before
  trusting any number.
- 2026-09-12: `@cloudflare/vitest-pool-workers` 0.22 (vitest 4) dropped `defineWorkersConfig`:
  use the `cloudflareTest()` Vite plugin from the package root, and augment
  `Cloudflare.Env` (not `ProvidedEnv`) for test bindings. `readD1Migrations` still exists.
- 2026-09-12: workerd lags Cloudflare's compatibility dates by a couple of weeks; a
  `compatibility_date` newer than the installed binary makes every test fail at startup.
- 2026-09-12: Two-level custom domains (`preview.run.sivoov.app`) get their certificate a few
  minutes after `wrangler deploy`; TLS handshake failures right after a first deploy are not
  a config bug. From the cloud sandbox, `curl` to the deployed hosts is blocked
  (EHOSTUNREACH); verify with `--resolve` or from the phone.
- 2026-09-12: Node cannot run the shared package directly (`--experimental-strip-types`
  needs explicit extensions, JSON imports need attributes). Tools run with `tsx`, and
  fixtures are `.ts` modules, not `.json`, so Metro, Vite and workerd all agree.
- 2026-09-12: A simulation LocationSource must expose one clock for its whole life:
  the countdown, the gun (`startRun(now)`) and the fixes all read it. Resetting the clock in
  `start()` shifted every elapsed time by the countdown length.
