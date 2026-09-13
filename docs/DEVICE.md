# Testing on a real Android phone

Everything here runs from the laptop over a USB cable. No EAS queue, no Apple account, no
Play console. The Android SDK and JDK 17 are already installed on this Mac, so the dev
client is compiled locally and installed straight onto the phone.

The dev build is called **Sivoov (Dev)** (`com.arthur.flam.sivoov.dev`) and always talks to
**preview** (`https://preview.run.sivoov.app`), never production. It installs next to a real
Sivoov without replacing it.

## 0. One-time, on the phone
1. Settings → About phone → tap **Build number** seven times ("You are now a developer").
2. Settings → System → Developer options → **USB debugging** ON.
3. Plug the phone into the Mac with a cable that carries data, then accept
   **Allow USB debugging** on the phone's screen (tick "always allow from this computer").
4. Check the Mac sees it:
   ```bash
   npm run device:doctor
   ```
   It should list one device with the state `device`. `unauthorized` means step 3 was not
   accepted; nothing listed usually means a charge-only cable.

## 1. First build (~15 min, once)
```bash
npm run device:build
```
This runs `expo prebuild` (writes the gitignored `app/android/`), compiles the dev client,
installs it on the phone and starts Metro. Rerun it only when a **native** module is added
or removed (`app/package.json` → anything `expo-*` with native code, see ARCHITECTURE.md).

If you only want the APK without a phone attached: `./scripts/device.sh apk`, then
`./scripts/device.sh install` once the phone is plugged in.

Only `arm64-v8a` is compiled, because every real Android phone is arm64 — building the four
default ABIs took 46 minutes and made a 260 MB APK for nothing. For an x86 emulator:
`ANDROID_ABIS=x86_64 npm run device:build`.

Permissions and the battery exemption are granted over adb by `npm run device:prep` (the
build runs it for you), so nobody has to tap through Android's dialogs — including the
"always" location that Android otherwise only offers from its own settings page.

## 2. Every other time (~10 s)
```bash
npm run device
```
Starts Metro, points the phone at it over USB (`adb reverse`) and launches the app. Every
JS change reloads live. This covers almost everything: screens, audio logic, the tracker,
the upload queue.

Logs from the phone, in a second terminal:
```bash
npm run device:logs
```

## 3. The acceptance run
The one thing the web target cannot prove: background location, background audio and the
upload queue on a real device. Do this once, then it is a regression to repeat after any
change to the tracker, the audio player or the location task.

Sign in with a seeded test entrant (docs/ACCESS.md). Use **bib 1002 / lea@example.com /
code 000000** — 1002 is on the marathon, which is the course that has the audio pack.

1. Home shows the bib, the distance and the course map. Tap **Courir**.
2. `/prepare` runs four checks: permission, GPS lock, battery, headphones. Plug headphones
   in before this, and grant location **"Allow all the time"** when Android asks — the
   "while using the app" answer kills the run as soon as the screen locks.
3. Start. The intro and the gun should play in the headphones.
4. **Lock the screen and put the phone in your pocket.** Run 1-2 km around the block.
   This is the actual test: distance must keep climbing and the km split must fire with
   the screen off.
5. Long-press stop to finish. The run uploads (run + GPS trace) when you come back.

What to watch for and write down:
- Did the distance drift while stopped at a traffic light?
- Did the audio duck your music instead of stopping it?
- Did the screen-off period lose fixes (a straight line between two points in the trace)?
- Battery drop over the run.

## 4. After the run, from the laptop
```bash
npm run trace:pull -w api -- preview                  # list the runs, newest first
npm run trace:pull -w api -- preview <run-id>         # writes .traces/<run-id>.json
```
The trace is the raw filtered fix stream; replay it in a `shared/` test to fix the tracker
against real data instead of simulated noise (WORKFLOW.md, loop 3).

The run also shows up in the organizer admin: https://preview.run.sivoov.app/org/deauville-2026
(sign in with `orga@example.com`, code `000000`).

## 4b. The standalone shell, for a run with no laptop anywhere near
`Sivoov (Dev)` is a debug dev client: it has **no JS bundle of its own** and shows a red screen
without metro, so it cannot leave the house. `Sivoov (Preview)` can.

```bash
npm run device:preview      # ~15 min: prebuild for the preview package, release build, install
```
It installs `com.arthur.flam.sivoov.preview` alongside the dev one — different package, both
can sit on the phone — grants the location permissions and the battery exemption over adb, and
launches it. From then on:
- the bundle is inside the APK, so no metro, no cable, no laptop;
- `expo-updates` is live on the `preview` channel, so JS from a cloud session reaches it
  (`gh workflow run deploy.yml -f action=publish-preview`, then **Diagnostic → Chercher une
  mise à jour** on the phone);
- it is a release build, so it is the only honest place to measure battery.

It signs in from scratch like a new phone: `coureur@example.com`, code `000000` on preview.

Two costs, both known: `device:preview` regenerates `android/` for the preview package, so the
next loop-2a session starts with one `npm run device:build`; and a native change means running
`device:preview` again over the cable. See WORKFLOW.md, loop 2b.

## 5. Gotchas
- **Battery optimisation.** Android kills background location for "optimised" apps after a
  while. Settings → Apps → Sivoov (Dev) → Battery → **Unrestricted**. `npm run device:doctor`
  reports whether the app is exempt. Samsung and Xiaomi are the aggressive ones; on Samsung
  also remove the app from "Sleeping apps" in Device care.
- **"Allow all the time" is a second prompt.** Android 11+ only offers it from the system
  settings page after the app has been granted "while using". The `/prepare` screen links
  there; if the check stays orange, that is why.
- **A charge-only USB cable** shows no device and no error. Try another cable first.
- **Metro not reachable** (red screen, "could not connect"): the `adb reverse` is gone
  because the cable was unplugged. Rerun `npm run device`.
- **`adb: no devices`** after the phone sleeps: unlock it, the authorisation prompt may be
  waiting behind the lock screen.
- The dev client is a debug build: it is slower and uses more battery than the real thing.
  Do not judge battery life from it — judge it from a `preview` profile build.
- **No `adb logcat` outdoors.** The app keeps its own logbook instead: finish screen →
  **Diagnostic**, with *Partager* to send it into a Claude session, and the same lines ride to
  R2 with the trace (`npm run trace:pull` prints them). Anything you would have wanted in
  logcat has to be `diag('tag', '…')` in `app/src/diag.ts` *before* you walk out.

## 6. Where this fits
`docs/WORKFLOW.md` describes the same loops for cloud sessions. Sections 1-4 are loop 2a, done
locally over a cable: faster, and needing no `EXPO_TOKEN`. Section 4b is loop 2b, the one that
works with no laptop in the room. EAS Build is still the path for an iPhone, for a shareable
install link, and for the store builds.
