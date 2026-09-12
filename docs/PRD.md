# Sivoov Run - Product Requirements

Status: draft v1, September 2026. Owner: Arthur.

## 1. One paragraph

Race organizers sell out. The demand they turn away is worth money and goodwill, and
"virtual" entries have so far meant a medal in the post and a Strava screenshot. Sivoov
Run turns a virtual entry into a race: during race week the runner runs the distance
wherever they are, the app puts them on the real course, an announcer starts them, the
course is narrated kilometer by kilometer, they finish to a crowd, and they get an official
time on the race's results page, a certificate, and the medal. The organizer gets a branded
page, entries, and a results list, with no logistics beyond shipping medals.

First race: Marathon International de Deauville, 14-15 November 2026 (marathon, half,
and any shorter distances the organizer wants to open). The race director is the sponsor
of the project and sells out the physical race.

## 2. Customers and what they buy

### Organizer (buys the product)
- Extra revenue from turned-away demand, at near-zero marginal cost.
- A virtual product that does not cheapen the real one: real course, real time window,
  results that look official.
- A page they can link from their site and mailing, in their colors.
- A list of who ran, times, and medal shipping addresses, exportable.
- Setup that takes an afternoon: a form and a CSV, not a project.

### Runner (has the experience)
- "I ran Deauville" even though I was in Lyon, or on a treadmill in Montreal.
- A start that feels like a start, a course I can picture, a finish that feels earned.
- An official time next to everyone else's, a certificate I can share, a medal.
- No fuss: I know my bib number and my email, that is all I need.

### Personas for Deauville
- The refused: wanted a bib, race sold out, runs seriously, will compare their time.
- The far away: friend or family of a real entrant, runs the half the same morning.
- The treadmill runner: winter, indoors, wants the medal and a time. Uses upload.

## 3. Runner journey (v1)

1. **Land** on `run.sivoov.app/deauville-2026` from the organizer's site or email.
   Race identity (hero, colors, logo), what you get, the distances, the window, the price
   or "included with your virtual entry", and one button: "Je participe" / "Sign in".
2. **Identify** with bib number + email. Entrants are pre-loaded from the organizer's
   registration platform (CSV). A 6-digit code arrives by email. No password, no account
   creation screen. Unknown bib/email: a clear message and a link to the organizer.
3. **Install** the app from the web page (App Store / Play Store link, or TestFlight during
   pre-launch). Sign in with the same email code. The app knows which race you are in.
4. **Prepare** (web and app): course preview, the audio trailer (30 s), what to expect,
   choose distance if several, pick your start slot inside the window (any time, but the
   app frames it as "your wave"). Download the audio pack so the run works offline.
5. **Run** (app only): pre-flight checks (GPS lock, location permission "always", battery,
   headphones), then a countdown, the announcer, the gun. During the run: distance, time,
   pace, position on the course diagram, next landmark, km splits. Audio events fire on
   distance along the course. The runner runs a real distance anywhere; progress on the
   virtual course equals distance run.
6. **Finish**: automatic at the distance. Finish audio, time frozen, splits shown, "your
   time is official". Results sync when online.
7. **After** (web): results page with the official time in the race's list, certificate
   (PDF and share image), medal shipping status.

**Fallback**: "Upload my run" on the web (GPX file, later Strava/Garmin connect). Gets a
time flagged "uploaded" in results. Covers treadmills and app failures. Runners paid for
the medal, they get it either way.

## 4. Organizer journey (v1)

1. We create the race with them: name, dates, virtual window, distances, course GPX per
   distance, theme (logo, colors, hero photo), landmarks brief (what to say where), medal
   photo, entry price if we sell entries directly (v2), shipping policy.
2. They export entrants from their registration platform; we import the CSV (bib, name,
   email, distance, address). Re-import is idempotent.
3. Organizer admin at `run.sivoov.app/org/deauville-2026`: entrants, who signed in, who
   started, who finished, times, export CSV (results, shipping list). Magic-link login
   restricted to their emails.
4. Results page is public and embeddable (iframe or link).

## 5. The experience that sells it (audio)

The audio is the product. Three layers:

- **Ceremony**: start line ambiance, announcer welcomes the runner by name, countdown,
  gun. Finish: crowd, announcer calls the name and the time. Pre-produced once per race.
- **Course**: narration at landmarks by distance ("km 3, vous arrivez sur les Planches"),
  written from the organizer's brief and generated with Claude, read by TTS (ElevenLabs,
  French voice), cached as MP3 per race. Coaching lines per pace band. Pre-produced.
- **Personal**: name at start and finish, split announcements, "you are on the pace of the
  800th finisher of 2025" using the real race's historical results, encouragement when
  pace drops. Templates with slots, so most of it is pre-produced too; anything truly
  dynamic uses TTS on device or a small live call and degrades gracefully offline.

Everything the run needs is downloaded before the start. The run never depends on the
network.

## 6. Scope

### v1 (Deauville, November 2026)
- Web: race landing, sign-in by bib + email code, app install page, results, certificate,
  upload fallback, organizer admin with CSV import/export.
- App (iOS + Android): sign-in, race home, prepare, run, finish, results. French + English.
- Audio: ceremony + course + personal name/splits. Historical ghost pace if results exist.
- Ops: entrants import, results export, error reporting, GPS trace upload for debugging.

### v1.5 (if time allows before race week)
- Live tracker page for family ("where is Marc now") with cheers.
- Strava connect for upload fallback and auto-share.
- Leaderboard live during the window.

### Non-goals (explicitly out)
- City discovery, route library, the 20-routes challenge. Different product.
- Social graph, friends, comments, feeds.
- Direct payment (v2: Stripe checkout for organizers who want us to sell entries).
- Self-serve organizer onboarding. We onboard Deauville by hand.
- Cycling, walking variants. Watches (Garmin, Apple Watch) beyond upload.

## 7. Requirements that constrain design

- Background execution: the run continues with the screen locked, phone in an armband,
  for up to 6 hours (marathon walkers). Location "always" permission, background audio.
- Offline: the run works with no network. Sync happens after.
- Battery: a marathon must not drain more than roughly half a modern phone.
- GPS honesty: distance is smoothed and filtered (harvested Kalman), no auto-pause by
  default, a run is a run. Results show "app" vs "uploaded".
- Accessibility outdoors: the run screen is readable in bright sun and with sweat on the
  screen. Large numbers, huge tap targets, no gestures that can misfire.
- Privacy: name, email, address, GPS traces. Minimal retention, GDPR export/delete on
  request, traces used only for the runner's results and debugging.
- French first. Dates, numbers and pace formats localized.

## 8. Timeline (race week 14-15 November 2026, window to define with the organizer)

| By | Milestone |
|---|---|
| 26 Sep | M1: repo bootstrapped, shared domain + API + web sign-in live on preview, app shell runs a simulated race end to end on web and in the dev client |
| 10 Oct | M2: real run on device with audio pack, finish, results sync, results page, upload fallback |
| 17 Oct | M3: App Store and Play Store submissions, organizer admin, certificate, entrants imported |
| 31 Oct | M4: store approval, polish pass, audio content final, load test, ops runbook |
| 7 Nov | Freeze. Race week ops: support inbox, daily results export |

App Store review is the critical path. Submit a build by mid-October even if features are
missing; features arrive over the air.

## 9. Success for Deauville
- Entries sold and share of entrants who sign in, start, finish, upload.
- Finish rate among starters (target: same as the real race).
- Support tickets per hundred runners.
- Organizer says yes to 2027 and gives a reference.

## 10. Open decisions
- Does the organizer sell virtual entries through their platform (we import) or do we sell
  (Stripe, v2)? Assumption for v1: they sell, we import.
- Window length: race day only, or the whole week. Assumption: 9 to 15 November.
- Which distances are open virtually. Assumption: marathon and half.
- Medal logistics: organizer ships from the entrant list we export. Assumption: yes.
