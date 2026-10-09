# 10 km des Champs-Élysées: the virtual edition

The second race, and the one that has to convince its organizer. This file is the brief and
the rundown; `AUDIO_EXPERIENCE.md` holds the craft rules it follows, `AUDIO.md` the contract.

- Race page: `/10km-champs-elysees-2027` (preview: https://preview.run.sivoov.app/10km-champs-elysees-2027).
- Studio: `/org/10km-champs-elysees-2027/courses/10km-champs-elysees-2027-10k`.
- Sound: `npm run produce -w api -- 10km-champs-elysees-2027 [local|preview|production] [--publish]`
  (`api/tools/produce/`), which writes every mix and the demo reel to `api/.produce/out/`.

## Why this race

- **Sport Concept Organisation (SCO) runs it, and also runs Deauville.** Eric Schwartz is named as
  organizer of both. It is the same client and the same person to convince.
- **It sells out.** 5,083 finishers in 2023, about 18,000 in 2025, and 20,000 entries for
  2026, full by mid-December.
- **It already sells a virtual entry, but a thin one.** The "PMC connecté" costs €32 per race,
  or €89 for the three races of the circuit. The runner runs 10 km anywhere and types their
  own time into Klikego. Nobody checks the distance or the time, and there is no official
  ranking (circuit rules, art. 18).

  Everything we add sits on top of a product that already exists:
  - the time measured by GPS;
  - the race in the runner's ears;
  - the runner's name at the start and at the finish;
  - a results page.

  That is the pitch in one sentence.
- **The Paris Masters Circuit is why people run virtually.** It has three stages:
  - 10 km des Champs-Élysées, 7 Feb 2027
  - 10 km Hexagone Trocadéro, 5 Sep 2027
  - 10 km de la Tour Eiffel, 5 Dec 2027

  Each stage has its own medal. Finishing all three, in person or connecté, earns the
  collector stand. Runners who cannot get a bib, or who live elsewhere, still want the set.
  The page shows the circuit and the audio closes on it: the finish line tells the runner
  their medal is the first of three.

Facts, with sources: the research notes of 2026-09-27 are summarized here. The official site is
10kmchampselysees.fr, the circuit is parismasterscircuit.fr, the GPX is the one linked from the
2027 race page. The 5th edition is Sunday 7 February 2027, first wave at 10:30, in six coloured
pens by target time. There is a separate ranking for the fastest last kilometre (the "Golden
km"). Course record 28:34. Title partner FULFIL; charity UNAFTC.

## The course (official GPX, 151 points, 10.03 km)

One loop from the lower Champs-Élysées by the Pavillon Ledoyen. The kilometre points below
were measured on the GPX:

| km | Where |
|---|---|
| 0.25 | Place de la Concorde, the Obelisk, cobbles |
| 0.65 | La Madeleine, then Bd Malesherbes, a long false flat |
| 2.1 | Parc Monceau (Garnerin's first parachute jump, 1797) |
| 3.3 | Rue de Lisbonne, high point of the first loop |
| 4.15 | Saint-Augustin again, Bd Haussmann |
| 5.95 | Rond-Point des Champs-Élysées: the climb up the cobbles, the Arc ahead |
| 6.9 | U-turn below the Arc, the highest point, then the descent |
| 7.95 | Avenue Montaigne (Dior's New Look, 12 Feb 1947) |
| 8.6 | Place de l'Alma, the Eiffel Tower across the Seine |
| 9.0 | The Golden km |
| 9.45 | Pont Alexandre-III, the Grand Palais |
| 10 | The finish, where it started |

## What the runner hears (rewritten 2026-10-09, PRODUCTION.md)

One speaker, Gemini's Sadachbia directed as « un homme de cinquante-cinq ans qui anime cette
course depuis quinze ans », in registers (each line's own `voice`: on the PA, in the ear, close
on the cobbles, calm in the park, at the line), and two regulars in the crowd: Martine (Gacrux),
a Parisienne at every race, and a young club runner (Puck). They say the runner's name about
fourteen times in the 10 km. Between the places the rhythm director keeps the race from going
quiet for more than 150 s (120 s on the 5 km): the regulars shouting the name, a word from the
speaker, a restart word after a stop. Every kilometre is read against the runner's own opening
pace (takes: steady, faster, slower, a round time in reach). The words are in
`api/src/seed/champsElyseesScript.ts`, the sound in `api/tools/produce/sounds.ts`.

| 10 km | 5 km | Line | Heard |
|---|---|---|---|
| Start | Start | Le village | The village (DJ set down the avenue, walla), then « Bonjour Paris ! » on the PA |
| | | Bienvenue (★) | « Camille… bienvenue sur les Champs-Élysées ! Vingt mille coureurs… et vous en êtes. » The 5 km adds the course, the open road and « à vos marques » |
| | | La route (AI, 10 km) | The weather at home and on the Champs, the road open where they are, « Coureurs… à vos marques. » |
| | | Compte à rebours | Ten numbers on the PA, the crowd counting the last three along (five Gemini voices), over the anthem's build |
| 0 | 0 | Le départ | Horn, « Partez ! », the drop and the roar |
| 80 m | 60 m | Vous y êtes (★) | 10 km: the Obélisque straight ahead, « vous le reverrez quand il restera trois cents mètres » (the plant). 5 km: « ce premier kilomètre, c'est l'approche » |
| 650 m | | La Madeleine | Malesherbes, a long false flat to the park; the crowd will look after you |
| 2.1 km | | Parc Monceau (★) | Birds and gravel come in: the only calm of the race |
| 3.3 km | | Rue de Lisbonne | The top of the loop, let the legs roll |
| 3.85 km | | Le record | 28:34: at that speed you see nothing; you will see everything, in two kilometres |
| 5.3 km | | La moitié (★, live) | Five km behind you, your best kilometre, and now the Champs |
| | 200 m | Le faubourg | The street narrows; in 700 m, on the right, the Champs |
| 5.6 km | 600 m | Vers le Rond-Point | Downhill, keep some back; in 300 m on the right, you'll see it |
| 5.95 km | 950 m | La montée | « Levez les yeux… l'Arc de Triomphe. Neuf cents mètres de pavés. » Drums and a French crowd for 150 s |
| 6.25 km | 1.25 km | Martine (★) | « Allez Camille ! Ça monte, mais ça passe ! » |
| 6.45 km | 1.45 km | Les pavés (★) | Close: « Petits pas. Les bras. L'Arc ne bouge pas… c'est vous qui avancez. » The crowd thickens |
| 6.79 km | 1.79 km | Juste avant l'Arc | A whisper, « Écoutez… cent mètres », a heartbeat, the drums far away |
| 6.9 km | 1.9 km | Demi-tour (★) | The roar, the music flips: everything goes down now. The 5 km plants the Obélisque here |
| 7.4 km | 2.4 km | Le club (★) | « Allez Camille ! Ça descend tout seul ! » |
| 7.95 km | 2.95 km | Montaigne (★) | « Les vitrines vous regardent… tenez-vous droit. » |
| 8.6 km | 3.6 km | La Seine | The Eiffel Tower across the water, the circuit's last stage; the last km in 400 m. A bell |
| 8.99 km | 3.99 km | Le Golden km | A piece that never stops rising, the crowd building |
| 9.45 km | 4.45 km | Le pont (★) | The gold statues, the Grand Palais, and all these people for you |
| 9.59 km | 4.59 km | Martine (★) | « C'est la fin, c'est la plus belle ! » |
| 9.7 km | 4.7 km | L'Obélisque (★) | The payoff: « je vous l'avais dit. Trois cents mètres. » |
| 9.85 km | 4.85 km | Dernier virage | The home crowd |
| Finish | Finish | La ligne, l'arrivée (★, live), après la ligne (★, live) | Horn and roar, the name and time on the PA over the fanfare, then close again: the best km, the medal (first of three), the Trocadéro and the Eiffel Tower; the 5 km points to the 10 km on 7 February |

★: the runner's name (a personal version; its offline version is said without it).

**The 5 km demo** (course `10km-champs-elysees-2027-5k`, marked `demo`): the 10 km's second half
from boulevard Haussmann, for a race director's lunch break. It is run on the race's demo
(`10km-champs-elysees-2027-demo`), never shown on the real race's pages. Its ceremony reaches the
countdown in about 15 s, the 10 km's in about 25.

### The demo reel and the full runs

Each course's 5:30/km run condensed to a few minutes, said to the sample runner (Camille Martin,
bib 1247, from Lyon), with chapters: what the race page plays under « Écoutez la course ».
`npm run produce -w api -- 10km-champs-elysees-2027 --runs` also writes whole runs at 4:30,
5:30 (with a stop and a walk) and 7:00/km, each with a timeline of every silence:
`api/.produce/out/<course>/reel.mp3`, `run-<pace>.mp3`, `run-<pace>.md`.

## What is not ours yet (licensing, before selling)

Everything below is fine for a draft. Each item needs a decision before real entries are sold.

- **BBC Sound Effects** (crowds, air horn, drums, pigeons, fountain, church bells). The RemArc
  licence allows personal, educational and research use only. Before selling:
  - buy the equivalents (Pro Sound Effects, Soundsnap, Artlist SFX); or, better,
  - record the real race on 1 February 2027: the start village, the Marseillaise if there is
    one, the crowd on the Champs, the finish. One person with a Zoom recorder, three hours.
- **Lyria music.** Generated through our Gemini API key. Check Google's terms for commercial
  use of Lyria output before selling. The five pieces we kept are in R2
  (`produce-sources/lyria-*.mp3`) with their prompts in `api/tools/produce/sources.ts`.
- **Photos and logo** are the organizer's (their site's CDN). Ask for the kit: logo in SVG,
  hero photos with rights, and the medal photo.
- **The voice** is Google's Gemini TTS: commercial use is covered by the API terms.

## What would make it better (for the owner to generate or record)

In order of effect per euro:

1. **Record the real race on 1 Feb 2027.** Every crowd in the pack would become that race's
   own crowd. A real PA announcer calling "Sas violet !" beats any synthesis.
2. **"Aux Champs-Élysées" (Joe Dassin, 1969).** Heard from the crowd on the climb or at the
   finish, it is the most recognizable sound this race could have. It needs a licence (SACEM,
   publisher). Otherwise commission a Suno sound-alike? Not recommended: the recognition is
   the whole point.
3. **A real starter's pistol and the organizer's voice.** Ask Eric Schwartz for one
   phone-recorded sentence (« Bienvenue sur la plus belle avenue du monde ») for the
   ceremony. It goes in as « Votre fichier » on its line in the studio.
4. **Better crowds than the BBC's 1960s-1980s tapes, if the real race cannot be recorded.**
   ElevenLabs sound effects work on our key, at about 100 credits each. Prompts to try:
   - "Dense crowd of 20,000 runners cheering on a wide Parisian avenue, cowbells, French
     shouts of 'allez, allez', 30 seconds";
   - "Samba batucada drum group playing on the roadside as runners pass, crowd clapping, 45
     seconds";
   - "Small group of Parisian spectators shouting encouragement in French at passing
     runners, 20 seconds".
5. **More music, if Lyria's pieces tire.** Suno prompts in the same spirit as the Lyria ones
   in `sources.ts`:
   - the start anthem: "French touch house, 124 bpm, build and drop at 0:45";
   - the Golden km: a 3-minute build.

## Known limits of this draft

- **Gemini's preview TTS allows only a few requests a minute on our key.** Production takes
  minutes because of it. On race week, live splits for many runners at once would hit the
  limit, and they would fall back to their offline version.
  - Before real entries: enable billing on the Google AI project (Tier 1), or render the
    number fragments ahead of time.
  - It also sometimes reads its director's notes aloud. The prompt form and a length check
    catch it (`plausibleSeconds`).
- **The ambiances are pre-mixed at fixed levels.** The runner's own music is ducked while
  one plays. A 150-second crowd under the climb means 150 seconds of ducked music.
  Deliberate for the big moments; worth a "moins d'ambiance" setting later.
- **The studio shows each line's produced file and ambiance but cannot upload an ambiance
  yet.** Rerun the tool instead.
- **iOS has never played a WAV personal line.** Gemini lines are WAV. Android sniffs the
  format; iOS is untested.
