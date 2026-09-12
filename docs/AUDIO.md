# Audio

The audio is the product. This document is the contract between content, the pipeline and
the app. The event model is ported from the previous repo (see HARVEST.md) and simplified.

## Event model (`shared/schemas/audio.ts`)
```
AudioEvent {
  id: string
  trigger: { kind: 'start' } | { kind: 'finish' }
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

## Pipeline (`api/tools/audio/`)
`brief.md + course.gpx` → script.json (Claude) → review → tts (ElevenLabs) → pack manifest
+ MP3s in R2 → `audio_pack` row. Idempotent per `(course, version)`. Runs from a session.

## Playback rules in the app
- Background audio session, mixes with the runner's music (duck), never steals focus
  permanently.
- Interruptions (call) pause; events missed during a pause are dropped, not queued, except
  `finish`.
- Volume and "less talk" setting: `coaching` and `personal` can be turned down independently
  of `ceremony` and `course`.
- Each fired event is logged with distance, time, and position for the run trace.
