# Audio

The audio is the product. This document is the contract between content, the pipeline and
the app. `AUDIO_EXPERIENCE.md` is the content brief (what makes race audio good, the Deauville
rundown); this one says how a sound gets from the organizer's studio into a runner's ears.

## Three kinds of line, one rule
Every line of a script has a sound that works with no network: the voice reading its text, or
the organizer's own file. That sound is in the pack, downloaded before the start. On top of it,
a line can be **personal**: said differently to each runner. The personal version is a bonus,
never a dependency; whenever it cannot be made (no network, no town on file, no AI key, an AI
refusal, the voice provider down), the offline version plays.

| In the studio | What the runner hears | Made when | Without network |
|---|---|---|---|
| **La voix** | the same sentence for everyone | publishing | plays (in the pack) |
| **Personnalisée**, fields known before the start (`{prenom}`, `{dossard}`, `{ville}`…) | "Dossard mille deux cent quarante-sept, Camille Martin" | when the app opens the race home or the pre-flight | plays if downloaded, else offline version |
| **Personnalisée**, written by the AI | a sentence Claude wrote for this runner (name, town, weather there and at the race) | same, before the start | same |
| **Personnalisée**, fields of the run (`{temps}`, `{km}`, `{allure}`…) | "Kilomètre vingt et un, une heure cinquante-deux" | the moment it plays | offline version |
| **Votre fichier** | the organizer's MP3/M4A/WAV (the race director, a crowd, a bell) | uploading | plays (in the pack) |

## Event model (`shared/schemas/audio.ts`)
```
AudioEvent {
  id, title, category: 'ceremony' | 'course' | 'coaching' | 'personal' | 'safety'
  trigger: { kind: 'cue', at: 'armed' | 'countdown' | 'gun', order }   // the start ceremony, before the clock
         | { kind: 'start' } | { kind: 'finish' }
         | { kind: 'distance', meters } | { kind: 'split', everyMeters }
         | { kind: 'pace', slowerThan?, fasterThan?, afterMeters } | { kind: 'elapsed', seconds }
         | { kind: 'filler' }                   // no place: the rhythm director plays it (below)
  source: { kind: 'file', key }                 // the offline sound, always a file in the pack
  personal?: { phase: 'prepare' | 'live' }      // the runner's own version exists (see below)
  under?: key                                   // an ambiance played under it (see "Ambiances")
  takes?: [{ id, key, caption?, when?, personal? }]   // other ways of saying it (see "Takes")
  mix: 'duck' | 'wait' | 'interrupt', priority: 0..10, once
}
AudioPack { courseId, version, locale, events, files: { key: { url, bytes, sha256, seconds? } }, maxGapS? }
```
`source.kind: 'template'` still parses (the app's caption-only v0 list uses it) but the studio
no longer produces it. An app that predates `personal` ignores the field and plays the file.
Triggering is pure: `nextEvents(state, pack, fired)` (`shared/domain/audioTriggers.ts`) for the
lines placed on the course, wrapped by `dueLines(state, pack, said, pause)` (`rhythm.ts`), which
the app calls: the placed lines due now with the take each says, or one filler. An app that
predates `filler` cannot read a pack that has one (the trigger is a closed union): it shows the
pack as failed and the run is said by captions only, until its JS updates (the next launch).

## Takes, conditions and the rhythm director (PRODUCTION.md, "What the engine needs")
- **Takes.** A line may carry takes: other ways of saying it, each with its own words, its own
  file (`<key>~<take>.<ext>`), maybe a personal version, maybe a condition (`when`). The line's
  own words are one more take, with no id and no condition. `pickTake` (`runReading.ts`) says
  one the runner has not heard in this run, a take written for this moment first, then the
  least heard, then the script's order. The run's fired records keep the take (`take`), the
  journal too, so a resumed run keeps rotating.
- **Conditions read from the run, never asked** (`readRun`): `steady` / `faster` / `slower`
  (the last kilometre against the runner's own pace over km 1-2, within 2.5 %), `round` (a
  finish time in whole five minutes is within reach, past 30 % of the course and 1 km from the
  line), `restart` (running again after 20 s or more stopped or walking, for 20 s; stops are
  followed tick by tick by `followPause`: no ground counted for 12 s, or slower than 10:00/km).
- **The rhythm director** (`rhythm.ts`): when nothing placed is due, `fillerNeed` decides
  whether a filler plays. Silence is counted from the end of the last sound, ambiances included
  (the pack's `seconds`): a silence that would outlast the course's `maxGapS` (150 s when
  absent) is cut in two evenly, never later than 40 s before the maximum, never within 40 s of
  the next placed line, never while the runner stands or walks. A runner who runs again after a
  stop gets one word for it, from a filler take marked `restart`. Fillers take turns, the least
  said first.
- **The density check**: `hearRun(pack, targetM, plan)` plays a run on paper (a pace, stops,
  walks) through the same `dueLines`; `api/src/seed/champsElyseesScript.test.ts` holds both
  Champs courses to their `maxGapS` from 4:00 to 8:00/km, and the production tool renders whole
  runs with it.

**The start ceremony is sequenced, not triggered.** `cue` events never come out of
`nextEvents`. `ceremonySequence(pack)` returns them in play order (every `armed` line, then the
`countdown`, then the `gun`, by `order`) with `countdownIndex` and `gunIndex`. The app plays
them back to back when the runner presses Start, shows the countdown digits from the countdown
file's own remaining time, and starts the clock when the gun file starts: « Partez ! » and
00:00 are the same instant. Sync is at file boundaries, never inside a file. Only one line
drives the digits, the last `countdown` one (`countdownIndex`); another `countdown` line plays
like an `armed` one. The digit is `countdownDigit(remaining, duration)`: never above the file's
whole seconds (MP3 padding makes a 10 s file report 10.03 s, which opened on « 11 »), never 0.
The countdown and the gun lines are required: without a sound on the phone for either, the
silent 5 s countdown; any other line with no sound is left out (`ceremonyPlan`). A gun file that
never loads dates the clock from the end of the line before it (`onEnd`), not from the
watchdog 8 s later. A pack with no cue keeps the silent 5 s countdown. The countdown line is
written one number per second (« Dix. Neuf. … Un. ») and its sound must last 10 s: the studio
warns otherwise (below).
A personal line can be part of the ceremony (the runner called by bib and name) as long as it
only uses fields known before the start (`live_before_start` otherwise).

## The script (`shared/schemas/audioScript.ts`, `shared/domain/audioScript.ts`)
One draft per `(course, locale)` in `audio_scripts`; its `version` is what the next publish
produces. A line is an event plus:
- `text`: what the voice reads, the same for everyone. For a personal line it is the offline
  version. May be empty while unwritten (publishing waits). Eleven v3 tags allowed.
- `personal?: { kind: 'template', template } | { kind: 'ai', prompt }`.
- `audio?`: the organizer's upload (`{ kind: 'upload', hash, format, bytes, name }`), played
  instead of the voice.
- `slots`: legacy. Older drafts had caption-only templates; `upgradeLine` turns them into
  personal templates whose offline version is still to write (applied when a draft is loaded).

`lineIssues(line)` says what blocks a line: `no_text`, `placeholder_in_text` (braces in the
text everyone hears), `unknown_placeholder`, `live_before_start`. The studio words them
(`studioCopy.issueText`); publishing refuses a script with any.
`ceremonyIssues(lines, secondsOf)` (`shared/domain/ceremonyChecks.ts`) warns without blocking:
`countdown_length` (the countdown's sound is not 10 ± 0.3 s, measured from the file's first
bytes by `audioSeconds`, WAV or MP3), `countdown_twice`, `countdown_without_gun`. The studio
lists them under the line (`ceremonyIssueText`), and a publish answers them as `warnings`. A
voice take of « Dix. Neuf. … Un. » is whatever length it comes out (Deauville's seed): the fix
is a file of 10 s (`npm run produce` pads its countdown cut to exactly 10 s).

**A line's own voice** (`line.voice = { id, direction, scene? }`): the same speaker in another
register (on the PA, close in the ear: the direction and the scene change) or another voice
(a regular in the crowd). `voiceOfLine` gives it on the script's model; the studio, publishing,
the runner's own renders and the production tool all use it, and its render keys include the
scene. A Gemini voice's `scene` is where the speaker is (« Sur la sono du village de départ »).

**The voice** is `script.voice = { id, name, model, stability?, direction?, scene? }`, one per script. New scripts
start on George, `eleven_v3`. The TTS body is `ttsRequestBody(voice, text, locale)` and the
render cache key `voiceCacheInput(voice, text)`, shared by the Worker and the CLI: the text as
the model takes it (v3 keeps `[tags]`, older models get them stripped by `textForVoice`), the
voice id, the model, and the stability when one was chosen (so renders made before voices had
settings keep their keys).

## Placeholders (`shared/domain/placeholders.ts`, `spokenFr.ts`)
| Field | Known | The runner hears |
|---|---|---|
| `{prenom}` `{nom}` | before | as registered |
| `{dossard}` | before | « mille deux cent quarante-sept » |
| `{ville}` | before | the town of their address; none on file → offline version |
| `{epreuve}` | before | « marathon », « semi-marathon », « dix kilomètres » |
| `{km}` | during | kilometres done: « douze » |
| `{temps}` | during | « une heure cinquante-deux »; at the finish, « trois heures, quarante-six minutes et dix-neuf secondes » |
| `{temps_km}` | during | the last kilometre: « cinq minutes vingt-huit » |
| `{allure}` | during | average pace: « cinq minutes trente au kilomètre » |
| `{arrivee_prevue}` | during | finish time at this pace |
| `{objectif}` | during | the round time within reach (`readRun`): « cinquante minutes »; none → offline version |
| `{allure_depart}` | during | their own pace over km 1-2: « cinq minutes dix » |
| `{meilleur_km}` | during | their fastest kilometre: « le kilomètre quatre, en quatre minutes cinquante » |

Every number is written out in French words before it reaches the voice (`frenchNumber`,
`spokenClock`, `spokenDuration`): a misread number discredits the whole pack. The old English
names (`{firstName}`, `{splitTime}`…) are read as aliases. `fillTemplate` returns null when a
value is missing; that line then plays its offline version, never a sentence with a hole.
`liveFactsFor(runState)` is what the app sends for a live line, with glitch values left out.

## Ambiances (`under`)
A line may carry an ambiance: the start village, the music of the gun, drums up a climb, a
finish fanfare. It is a file in the pack (`<key>-under.<ext>`), started on a second player
when the line starts, and it plays to its own end, over the next lines, until another line
brings its own ambiance (the old one fades in 0.8 s) or the run stops. Before the gun it is
the ceremony's (stopping the ceremony stops it); from the gun on it belongs to the run. The
runner's own line (their name, their time) is thus said inside the crowd, not in silence.
- It is pre-mixed at its level: an ambiance under a voice sits about ten decibels below it,
  and one that opens under its own line is held down while the line plays (the two are on
  separate players, so nothing can duck one under the other at play time).
- The runner's music is ducked for as long as an ambiance plays: keep them for the moments.
- Splits carry none: at 9 km the split must not cut the Golden km's music.
- The studio shows a line's ambiance and keeps it through saves; uploading one is not built:
  `npm run produce` sets them (below).

## The voices: ElevenLabs or Gemini
`script.voice.model` picks the provider (`shared/domain/geminiVoice.ts`, `api/src/lib/tts.ts`):
- **ElevenLabs** (`eleven_v3`, older models): MP3, `[tags]` for v3. Our key is on the free
  plan: no Voice Library voices by API, so no native French voice.
- **Gemini** (`gemini-3.8-flash-tts`, a voice name such as `Sadachbia`): native French,
  directed in words (`voice.direction`, and a scene per line in the production tool), called
  through the AI Gateway (`google-ai-studio` route, `GEMINI_API_KEY`). It answers raw PCM or a
  WAV; renders are stored as `.wav` (`voiceFormat`), and so are the pack files of voice lines
  and the runners' own lines. The prompt must be the full "AUDIO PROFILE / THE SCENE /
  DIRECTOR'S NOTES / TRANSCRIPT" form, or the model reads its notes aloud; even then it
  sometimes does, so a take far longer than its words (`plausibleSeconds`) is rendered again,
  twice at most (the production tool also has each take heard back and compared).
  About 3 s per short line: a live line may take 7 s in the app. The preview model allows a
  few requests a minute on our key: see CHAMPS_ELYSEES.md, "Known limits".

## Produced sound (`api/tools/produce/`)
`npm run produce -w api -- <raceId> [local|preview|production] [--publish] [--runs] [--course 5k]`
mixes each course of a race with ffmpeg: every line and take said by its own voice and scene
(Gemini), over beds and ambiances per line (`sounds.ts`): music composed for the race (Lyria,
kept in R2 `produce-sources/`), a French crowd made of a dozen Gemini voices shouting by the
roadside (`crowd.ts`) over the archive's wordless roars (BBC Sound Effects, draft licence), the
park, the bells, a synthesized heart before the Arc. A line with an ambiance keeps its own file
to the voice alone, so the runner's own version (raw, from the Worker) sounds the same over it.
- `--runs`: whole runs as a runner hears them (`run.ts`), at 4:30, 5:30 (a 45 s stop and a
  walking minute) and 7:00/km, through the app's own engine (`hearRun`), the app's player on
  paper (one voice at a time, interruptions, each ambiance until the next) and a stand-in
  playlist ducked like the runner's music: `out/<course>/run-<pace>.mp3` and a timeline
  (`.md`) with every silence. The listener's main test (PRODUCTION.md).
- The demo reel is the 5:30 run condensed (`reelOf`), with chapters (`DemoReelSchema`), at
  `demo/<courseId>/reel.{mp3,json}`, served by `/api/courses/:id/reel(.mp3)` and played on the
  race page (« Écoutez la course »).
- Every render's origin (voice, model, direction, scene, words; or the sources of a mix) goes
  to `out/<course>/origins.json`, until the sound library exists (SOUND_LIBRARY.md).
- With a target, the tool opens that environment's own D1 and R2 (`tools/bindings.ts`:
  Wrangler's platform proxy, remote bindings for preview and production), uploads the files as
  the organizer's own (`studio-uploads/`), points the draft's lines and takes at them, and with
  `--publish` publishes with the Worker's own `publishScript`. No sign-in: Wrangler's account.
- `npm run casting -w api` renders the casting (PRODUCTION.md) for a blind listen.

## ElevenLabs v3 tags
`[excited]`, `[whisper]`, `[laughs]`… before the words they colour; ellipses make pauses. The
studio offers the ones a race speaker needs (`AUDIO_TAGS`, French labels) as chips, only when
the script's model is v3. Captions, the browser voice and v2 get the text without them.

## The AI (`api/src/lib/llm.ts`, `lib/prompts/`)
Every LLM call goes through Cloudflare AI Gateway **"sivoov"** (`AI_GATEWAY` var), never to a
provider directly. The Worker holds one secret, `CLOUDFLARE_AI_TOKEN`, and no provider key:
- **Claude first** (`claude-opus-5`, low effort, server-side refusal fallbacks) through the
  Anthropic SDK pointed at the gateway's Anthropic route, with `x-api-key` omitted and
  `cf-aig-authorization`: the gateway adds the Anthropic key it holds (a provider key stored in
  the gateway, or Cloudflare's unified billing).
- **Workers AI as the stand-in** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, OpenAI-compatible
  chat on the same gateway) when the gateway cannot reach Claude: no key stored yet (it answers
  401 today), an outage. A Claude refusal is not handed to Llama. The studio says who wrote each
  text (« Écrit par Claude » or the Llama note).
Two uses, never during the run:
1. **A personal `ai` line**, written per runner when the app asks for its voices: the
   organizer's instructions, the offline version as the example of tone and length, when it
   plays, the race, the runner (name, bib, town) and the weather there and at the race
   (Open-Meteo, position rounded to about a kilometre, nothing stored). The rules in the system
   prompt are the craft rules of AUDIO_EXPERIENCE §1. What comes back is cleaned (quotes,
   braces, runaway length, tags for a non-v3 voice) and kept per runner and pack version for
   12 hours in `personal-texts/` (rewritten once when a position first arrives).
2. **« Proposer un texte »** in the studio: a draft of the text everyone hears, from the race,
   its places and the neighbouring lines. The organizer edits it before recording.
No token: AI lines play their offline version and the studio says so.

## The studio (`/org/{race}/courses/{courseId}`)
Written for race directors: every sentence comes from `api/src/pages/org/studioCopy.ts`, and the
JSON answers carry the same words.
1. **The courses page** (`/org/{race}/courses`): one card per distance, trace, announcements
   (to complete, to record), publication; "Les lieux du parcours" per card.
2. **The map** (Mapbox GL, see ARCHITECTURE.md) with every announcement placed, pinch and wheel
   zoom, following the list as it scrolls; a click on the course proposes an announcement
   there (projection is authoring-time: stored as `{kind:'distance', meters}`). The frise
   below; a target pace places time-based lines.
3. **The voice**, above the list: « Voix de la course : George · Expressive (Eleven v3) ·
   Naturelle » and « Changer de voix »: the house voices (ElevenLabs voices checked with our
   key, `lib/voices.ts`), the account's own voices when the key has `voices_read`, any voice id
   pasted in, the model (v3 / Multilingual v2), v3's creative/natural/steady setting, and an
   audition on a sentence with the race's name. Changing it means recording every line again.
4. **« Comment le coureur entend ces annonces »**: the table above in four sentences.
5. **Le départ, seconde par seconde**: the cue lines in play order with their durations (the
   file's own once recorded, an estimate before), which line drives the digits, the line whose
   first second starts the clock, the total before the clock, and « Écouter le départ », which
   plays it back beside the runner's screen (« Sur la ligne », the digits, then « Chrono 0:00 »).
6. **Each line**: Quand (km, minutes, every N km, pace, or « Avant le départ »), then « Ce que
   le coureur entend »: La voix / Personnalisée (a sentence with fields, or « Écrite par l’IA »)
   / Votre fichier. Field chips (before / during the run) and tag chips insert at the caret.
   A personal line shows when it is made, « Écouter un exemple » (Camille Martin, dossard 1247,
   de Lyon, at km 12, rendered by the real voice) and the offline version. Problems are listed
   under the text. « Proposer un texte », Écouter, Enregistrer la voix, Dupliquer, Supprimer;
   category, mix, priority, repetition and file name under « Réglages avancés ». Autosave.
7. **Publishing** copies each line's sound (upload, or the rendered voice of its text) to
   `packs/<courseId>/<version>/<key>.<ext>`, writes `manifest.json` and the `audio_packs` row,
   writes the personal lines' definitions to `personal-defs/<courseId>/<version>.json`
   (private), records `published` and bumps the draft. Refused while a line has an issue or a
   missing sound, naming them. Packs are immutable per version.

Studio JSON routes, under `/org/{race}/courses/{courseId}` on the organizer cookie; writes need
`edit_audio`: `GET|PUT script`, `POST script/render`, `POST|DELETE script/lines/{id}/audio`,
`POST script/project`, `POST script/publish`, `GET voices`, `POST voice/sample`,
`POST script/sample` (a personal line as the sample runner hears it), `POST script/suggest`;
reads: `GET audio/{hash}`, `GET uploads/{hash}.{format}` (private). Test accounts may not spend
ElevenLabs credit outside local (`maySpendCredit`).

## What the app gets
- `GET /api/courses/:id/pack`: the manifest (titles and file keys, never script text) and
  `GET /api/packs/:course/:version/:key` the files (immutable, a year).
- `POST /api/me/voices` (bearer, optional `{lat, lng}`): the runner's own versions of the
  pack's `prepare` lines and takes, rendered now (four at a time, cached by what is said and who
  says it, so every Camille shares the same cheers): `{ courseId, version, files: { key: { url,
  bytes, sha256 } } }`, `key` being `eventId` or `eventId/takeId` (`personalKey`). Absent lines
  play their offline file.
- `POST /api/me/voices/live` (bearer) `{ courseId, version, eventId, take?, facts }`: one `live` line
  rendered now, `{ url, bytes }`; 422 when a value is missing, 429 past 150 new renders a day
  per runner (renders already cached are free).
- `GET /api/voices/:hash.mp3`: personal renders, public by the hash of what they say.

R2 layout: `courses/<id>/geometry.json`; `tts/<hash>.mp3` (studio renders, private);
`studio-uploads/<hash>.<format>`; `packs/<course>/<version>/…` (public); `personal-defs/`,
`personal-texts/`, `voice-quota/` (private); `voices/<hash>.mp3` (runners' renders, by hash).

## Playback rules in the app (`app/src/audio/`)
- Background audio session, ducks the runner's music, never steals focus permanently.
- The pack downloads from the race home and the pre-flight (« Pack audio prêt · 1,9 Mo »), then
  the runner's own lines (`packStore.loadPersonal`), the pre-flight sending its first GPS fix
  rounded for the weather. A run never waits for either. Every file has a 30 s deadline: a
  stalled download ends in 'error' (Retry), never in 'loading' forever.
- The pack is kept on the phone (`packDisk.ts`): files under the document dir (the OS may purge
  the cache dir; packs older builds put there are downloaded again), and per course
  `packs/<course>/pack.json`: the manifest, the runner's own lines and their words. A cold start
  (the phone restarted mid-race, the app killed after the pre-flight) plays from it with no
  network, 'ready' at once; the network is asked afterwards, and a newer pack replaces a whole
  kept one only once all its files are on the phone. On a phone `uriFor`/`soundFor` return local
  files only (a remote file offline held a line 8 s for nothing); the web streams the urls.
- The binding of the run store to the speaker (`playback.ts`) is made once, by the run screen,
  and outlives it while a run is on (`countdown`, `running`): Android may destroy the React tree
  (the app swiped away) while the run goes on. A screen mounted again reuses it. Fired records
  marked `silent` (a backlog restored after a crash) are neither played nor listed.
- `soundFor(event)`: the runner's own version of a `prepare` line when it came down, the pack
  file otherwise. The ceremony uses it too. A `live` line fires, the app asks
  `/api/me/voices/live` with `liveFactsFor(state)`, downloads the answer's file to the phone
  within the same 7 s, and plays it or the offline file. After two network failures in a row
  (a server that answers with a refusal does not count), live lines are not asked for during
  five minutes (`breaker.ts`): in a valley with no signal every split would be 7 s late.
- Files play through `playSequence` (all or nothing, with a watchdog). Interruptions drop the
  backlog except `finish`.
- « Moins de voix » (AUDIO_EXPERIENCE.md X1), the runner's choice on the run screen, kept on the
  phone: `all`, `course` (the places and every kilometre call, whatever the split's category),
  `essential` (ceremony, start, finish, safety). `audibleAt` in `shared/domain/voiceLevel.ts`. A
  silenced line still fires, goes to the trace and shows in the list, marked « En silence ».
- Captions: every pack event carries `caption`, the line's words without voice tags (for a
  personal line, its offline version); `/api/me/voices` returns `captions` for the runner's own
  lines and `/api/me/voices/live` a `caption` with the file. The public pack never carries the
  script itself (templates, AI instructions, voice settings). The run screen shows what the voice
  is saying as subtitles, the start ceremony's lines large under « Sur la ligne » (not the
  countdown line: its digits are on screen), and lists every line with « Réécouter »
  (`app/src/audio/said.ts`, `replay` in `usePlayback.ts`).
- Each fired event is logged with distance and time for the run trace.

## The CLI (laptop path)
`npm run audio:build -w api -- <local|preview|production> [courseId]` renders the fixture script
(`api/src/seed/deauvilleScript.ts`) with the same body and cache key as the Worker, then R2 +
`audio_packs` through wrangler. The seed is the studio's first draft (insert-only: a re-seed
never overwrites an organizer's work), and shows each kind of line once.
