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

## Where a script lives (`shared/schemas/audioScript.ts`)
A **script** is the event list plus the French text each line is read with, and the voice that
reads it. One draft per `(course, locale)` in `audio_scripts`; its `version` is the version the
next publish will produce. `shared/domain/audioScript.ts` derives the events (`buildScript`,
`eventFor`) and the pack manifest (`manifestFor`), so the studio and the CLI build the same pack.

A line may carry `audio: { kind: 'upload', hash, format: 'mp3'|'m4a'|'wav', bytes, name }`: the
organizer's own sound (the race director's voice, a crowd, a bell), which plays instead of the
voice. Such a line is always a file event (`<key>.<format>` in the pack), even if it has slots,
and the TTS never reads it (`renderableLines` leaves it out). The draft also keeps `published:
{ version, at, fingerprint }`, written by publishing only: the fingerprint is the sha256 of
`publishedContent(script)` (voice + lines), so the admin can say whether anything changed since.

## Pipeline: the studio is the primary path
Written for race directors, not engineers: every sentence on these screens comes from
`api/src/pages/org/studioCopy.ts`, and the JSON answers carry the same words, so the browser only
paints what the Worker wrote.

1. **`/org/{race}/courses`**: one card per distance, three steps in plain words. The trace (GPX
   → geometry JSON in R2 at `courses/<courseId>/geometry.json`; a measured length more than 3%
   off the official distance is flagged "Tracé à vérifier"), the announcements (how many, how
   many still need their voice), the publication (never, since when, or changes not published).
   One primary button: "Écrire les annonces", "Continuer", or "Publier les changements" (a
   confirmed form post to `/courses/{id}/publish`). "Ajouter une distance" takes km.
2. **The studio**, `/org/{race}/courses/{courseId}`: the course on a Leaflet/Mapbox map (or the
   SVG diagram with `?map=svg`, no token or no network), the distance frise, and the list grouped
   by moment in running order: "Au départ", "Sur le parcours", "Pendant toute la course" (every
   km, pace coaching), "À l'arrivée" (`momentOf`, `whenInWords` in `shared/domain/audioEditor.ts`).
   Each row says when ("Au km 5,2", "Tous les km", "À 1 h 30 de course"), the title, the first
   words and a status: "Voix prête", "À enregistrer", "Fichier audio", or "À l'écran" (a line with
   slots: the app shows it as a caption and does not voice it yet). A click on the map proposes
   an announcement at that distance (projection is authoring-time: the stored trigger is
   `{kind:'distance', meters}`). A target pace (5:30/km by default) places `elapsed` and `split`
   triggers through `estimateFirings`. The header (sticky from 900px) holds the summary line and
   the publish button with what publishing does. Viewers get the same page read-only.
3. **The editor**, simple first: "Quand" (distance in km with a decimal comma, time in minutes,
   every N km, pace in min/km: the browser converts to the meters and seconds the schema stores,
   mirroring `triggerFromEditor`), "Texte lu" with a character count and an estimate at 15
   characters a second, then Écouter / Enregistrer la voix / Utiliser un fichier audio / Dupliquer
   / Supprimer. Category, how it meets another announcement, importance, repetition (pace only),
   slots and file name sit under "Réglages avancés". Every edit autosaves (debounced, one write
   at a time, a local copy until the Worker has it).
4. **The voice**: "Enregistrer la voix" per line, or "Enregistrer les voix manquantes": ElevenLabs
   from the Worker (`api/src/lib/tts.ts`), cached in R2 at `tts/<sha256(text|voiceId|model)>.mp3`,
   so an unchanged line is never paid for twice. Needs `ELEVENLABS_API_TOKEN` (`wrangler secret
   put`, `.dev.vars` locally); without it the endpoint answers 503 in French and "Écouter" uses
   the browser voice.
5. **Your own file**: "Utiliser un fichier audio" posts one MP3, M4A or WAV (5 MB max, recognised
   by its bytes, not its name) to `POST .../script/lines/{lineId}/audio`. The Worker stores it at
   `studio-uploads/<sha256>.<format>` (once per content) and records it on the line; "Écouter"
   plays it from `.../uploads/<hash>.<format>`; "Revenir à la voix" is `DELETE` on the same path
   (the file stays stored). Saving the whole script keeps the file, and refuses a hash the Worker
   never stored. Rendering the voice for such a line is refused (409).
6. **Publishing** copies each line's sound (the upload, or the cached voice for its text) to
   `packs/<courseId>/<version>/<key>.<ext>`, writes `manifest.json` beside them and the
   `audio_packs` row, records `published` on the draft and bumps it to `N+1`. Packs are immutable
   per version (the audio route caches them for a year), and publishing requires every line with
   a sound to have one: it names the missing ones. The pack format is unchanged by uploads: the
   app sees file events and file entries with their sha256, as before.

JSON routes, all under `/org/{race}/courses/{courseId}` on the organizer cookie; writes need the
`edit_audio` right (viewers get 403): `GET|PUT script`, `POST script/render`, `POST|DELETE
script/lines/{lineId}/audio`, `POST script/project`, `POST script/publish`; reads for anyone on
the team: `GET audio/{hash}`, `GET uploads/{hash}.{format}` (both `Cache-Control: private`).

**The CLI** (`api/tools/audio/`, the laptop path) still works and shares the schemas:
`npm run audio:build -w api -- <local|preview|production> [courseId]` runs fixture script →
ElevenLabs (cached in `api/.cache/audio/`) → R2 + `audio_packs` through wrangler. The Deauville
fixture lives in `api/src/seed/deauvilleScript.ts` and is seeded as the studio's draft at
(latest published version + 1), so a re-seed never overwrites what an organizer wrote.

R2 layout: `courses/<courseId>/geometry.json`, `tts/<hash>.mp3` (the render cache, private),
`studio-uploads/<hash>.<format>` (the organizers' own files, private),
`packs/<courseId>/<version>/<key>.<ext>` + `manifest.json` (what the app downloads).
The JSON the app gets from `/api/courses/:id/pack` carries titles and file keys only: script
text never leaves the organizer session.

## Playback rules in the app
- Background audio session, mixes with the runner's music (duck), never steals focus
  permanently.
- Interruptions (call) pause; events missed during a pause are dropped, not queued, except
  `finish`.
- Volume and "less talk" setting: `coaching` and `personal` can be turned down independently
  of `ceremony` and `course`.
- Each fired event is logged with distance, time, and position for the run trace.
