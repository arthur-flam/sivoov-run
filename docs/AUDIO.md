# Audio

The audio is the product. This document is the contract between content, the pipeline and
the app. The event model is ported from the previous repo (see HARVEST.md) and simplified.

## Event model (`shared/schemas/audio.ts`)
```
AudioEvent {
  id: string
  trigger: { kind: 'cue', at: 'armed' | 'countdown' | 'gun', order: number }   // the start ceremony, before the clock
         | { kind: 'start' } | { kind: 'finish' }
         | { kind: 'distance', meters: number }          // along the course
         | { kind: 'split', everyMeters: 1000 }          // recurring
         | { kind: 'pace', slowerThan?: secPerKm, fasterThan?: secPerKm, afterMeters: number }
         | { kind: 'elapsed', seconds: number }
  source: { kind: 'file', key: string }                  // R2 object in the pack
        | { kind: 'template', key: string, slots: string[] }   // pre-rendered per slot value or TTS on device
  mix: 'duck' | 'wait' | 'interrupt'                     // versus music / other events
  priority: 0..10
  category: 'ceremony' | 'course' | 'coaching' | 'personal' | 'safety'
  once: boolean
}
AudioPack { courseId, version, events: AudioEvent[], files: {key: {url, bytes, sha256}} }
```
Triggering is a pure function `nextEvents(state, pack, fired) -> AudioEvent[]` in
`shared/domain/audioTriggers.ts`, tested with simulated runs. The app only plays what the
function returns.

**The start ceremony is not triggered by the run, it is sequenced before it.** `cue` events
never come out of `nextEvents`. `ceremonySequence(pack)` (same file) returns them in play order
— every `armed` line (the intro, the call to the line, as soon as the runner presses Start),
then the `countdown`, then the `gun`, by `order` within a moment — with `gunIndex`, the line
whose first second starts the clock (`lines.length` when there is no gun: the clock starts as
the last line ends). The run store plays them back to back, shows the countdown digits from
the countdown file's own remaining time, and calls `startRun(now)` when the gun file starts, so
« Partez ! » and 00:00 are the same instant. Sync is at file boundaries, never inside a file.
An app that predates the sequence plays no cue at all: never publish a pack with cues before
the app update that plays them is live.
A pack with no cue (every pack published before them) keeps the silent 5 s visual countdown,
and its `start` / `elapsed: 0` ceremony lines fire at the gun as before. The countdown line is
written to last one second per number (« Dix. Neuf. … Un. ») and nothing else, since the
digits on screen follow it; measure the rendered file before publishing.

## Layers
1. **Ceremony** (per race): start ambiance, announcer intro, countdown, gun; finish crowd,
   announcer with name and time. Produced once, mixed to files.
2. **Course** (per course): landmarks at distances from the organizer's brief. Script written
   with Claude from the brief plus the GPX (landmarks are placed by distance along the
   course), reviewed by a human, read by ElevenLabs (French; English variant), stored as MP3.
3. **Personal**: templates with slots (`{firstName}`, `{splitTime}`, `{pace}`, `{ghostRank}`).
   Names are rendered per entrant at pack build time (one short file per entrant, cheap).
   Numbers use pre-rendered fragments or on-device TTS as fallback, so the run never needs
   the network.

## Where a script lives (`shared/schemas/audioScript.ts`)
A **script** is the event list plus the French text each line is read with, and the voice that
reads it. One draft per `(course, locale)` in `audio_scripts`; its `version` is the version the
next publish will produce. `shared/domain/audioScript.ts` derives the events (`buildScript`,
`eventFor`) and the pack manifest (`manifestFor`), so the studio and the CLI build the same pack.

## Pipeline: the studio is the primary path
**The studio** — `/org/{race}/courses/{courseId}`, organizer session, phone-usable:

1. Upload the GPX on `/org/{race}/courses` → geometry JSON in R2 at
   `courses/<courseId>/geometry.json`, measured length shown.
2. Write the script on the map: the course, the km ticks, the landmarks and one marker per
   audio event at its projected position. A click on the course proposes an event at that
   distance (the stored trigger is `{kind:'distance', meters}` — projection is authoring-time,
   there is no geo trigger). A target pace (5:30/km by default) turns `elapsed` and `split`
   triggers into positions through `estimateFirings` (`shared/domain/audioEstimates.ts`), drawn
   on the map and on the distance frise. Every edit autosaves; `Écouter` plays the rendered MP3
   or the browser voice for a draft line.
3. `Générer la voix` per line, or `Tout générer`: ElevenLabs from the Worker
   (`api/src/lib/tts.ts`), cached in R2 at `tts/<sha256(text|voiceId|model)>.mp3`, so an
   unchanged line is never paid for twice. Template lines (with slots) are not rendered.
   Needs `ELEVENLABS_API_TOKEN` (`wrangler secret put`, `.dev.vars` locally); without it the
   endpoint answers 503 in French and the studio still writes and plays with the browser voice.
4. `Publier la version N` copies the cached MP3s to `packs/<courseId>/<version>/<key>.mp3`,
   writes `manifest.json` beside them and the `audio_packs` row, then bumps the draft to
   `N+1`. Packs are immutable per version (the audio route caches them for a year), and
   publishing requires every non-template line to be rendered — it names the missing ones.

**The CLI** (`api/tools/audio/`, the laptop path) still works and shares the schemas:
`npm run audio:build -w api -- <local|preview|production> [courseId]` runs fixture script →
ElevenLabs (cached in `api/.cache/audio/`) → R2 + `audio_packs` through wrangler. The Deauville
fixture lives in `api/src/seed/deauvilleScript.ts` and is seeded as the studio's draft at
(latest published version + 1), so a re-seed never overwrites what an organizer wrote.

R2 layout: `courses/<courseId>/geometry.json`, `tts/<hash>.mp3` (the render cache, private),
`packs/<courseId>/<version>/<key>.mp3` + `manifest.json` (what the app downloads).
The JSON the app gets from `/api/courses/:id/pack` carries titles and file keys only: script
text never leaves the organizer session.

## Playback rules in the app
- Background audio session, mixes with the runner's music (duck), never steals focus
  permanently.
- The pack downloads from the race home and the pre-flight, so it is on the phone before the
  start line; the pre-flight says so ("Pack audio prêt · 1,9 Mo"). A run never waits for it.
- Files play through `playSequence` (`app/src/audio/player.ts`): N files back to back, all or
  nothing, with a watchdog because expo-audio reports no load error on Android. The event
  queue plays each event as a sequence of one; the start ceremony is a sequence of its lines.
- Interruptions (call) pause; events missed during a pause are dropped, not queued, except
  `finish`.
- Volume and "less talk" setting: `coaching` and `personal` can be turned down independently
  of `ceremony` and `course`.
- Each fired event is logged with distance, time, and position for the run trace.
