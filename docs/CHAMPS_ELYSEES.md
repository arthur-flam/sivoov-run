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

## What the runner hears

One voice all the way: the race speaker (Gemini "Sadachbia", a native French male voice,
mature and radio-like). The model is directed by scene: on the start village's PA, in the
runner's ears, at a big moment, at the line.

Around the voice there are three kinds of sound:
- crowds and Paris sounds from the BBC archive;
- music composed for this race with Lyria;
- the runner's own music, the rest of the time.

"Under" means an ambiance that starts with a line and keeps playing after it (AUDIO.md).

| When | Line | Heard |
|---|---|---|
| Start pressed | Bienvenue sur les Champs | The start village as an ambiance: a French-touch DJ set heard from down the avenue, the London Marathon start crowd, a French crowd. Over it, on the PA: « Bonjour Paris ! Bienvenue au 10 km des Champs-Élysées… » |
| | Routes ouvertes | « À Paris, l'avenue est fermée pour vous. Là où vous êtes, elle ne l'est pas. » |
| | L'appel dans le sas | Personal: « Dossard mille deux cent quarante-sept… Camille Martin ! Bienvenue sur les Champs-Élysées. On vous attend dans le sas ! », inside the village crowd |
| | Le mot du speaker | Written by the AI for each runner: the weather where they are and on the Champs, ending « Coureurs… à vos marques. » |
| Countdown | Compte à rebours | Ten numbers, one per second, on the PA. Under them, the ten seconds of the start anthem's build (Lyria) and a crowd rising. The on-screen digits follow the file |
| Gun, 0:00 | Le départ | Air horn and « Partez ! ». The clock starts on it. Under: the anthem's drop, whistles and a roar, fading over about a minute into the runner's own music |
| 300 m | La Concorde | « L'Obélisque vous regarde passer : trois mille ans qu'il en voit d'autres. Laissez partir les pressés… » |
| 700 m | La Madeleine | Announces Malesherbes, then promises a silence: « …on se retrouve au parc. » |
| Every km | Chaque kilomètre | Live: « Kilomètre trois. Quatorze minutes vingt. » |
| 2.1 km | Parc Monceau | Pigeons and a fountain come in, then the parachute story, said softly: « Respirez… ça ne durera pas. » |
| 3.3 km | Rue de Lisbonne | Coaching: the top of the loop, let the legs roll |
| 5 km | Mi-course | A crowd pocket. « …et après, la raison pour laquelle vous êtes venu : les Champs-Élysées. » |
| 5.95 km | La montée des Champs | « Levez les yeux : tout en haut, l'Arc de Triomphe. » Under: a drum tattoo and a crowd for 2.5 min, all the way up. No talk on the climb |
| 6.9 km | Demi-tour sous l'Arc | « À partir d'ici… tout redescend. Les Champs-Élysées sont à vous ! » Under: the descent anthem (Lyria, 90 s) and a roar |
| 7.95 km | Avenue Montaigne | Dior's New Look, 80 years ago: « la tenue qu'on regarde sur cette avenue… c'est la vôtre. » |
| 8.6 km | L'Alma et la Seine | A Paris church bell. The Eiffel Tower, and the last stage of the circuit in December |
| 9 km | Le Golden km | « Tout ce qui vous reste… c'est maintenant. » Under: a 3-minute piece that never stops rising (climax at 2:35) and the crowd building |
| 9.8 km | Remontée vers la ligne | « Dernier virage, le long de la Seine… la ligne est là ! » Under: the finish crowd, from here to the line |
| Finish | La ligne | Air horn and a roar, instantly: « Voilà la ligne d'arrivée ! » |
| | L'arrivée | Personal, live: « Camille Martin ! Quarante-sept minutes et douze secondes ! Vous avez bouclé le 10 km des Champs-Élysées ! » Under: the finish fanfare (Lyria) and applause, then the speaker on the PA: the medal is the first of three, see you at the Trocadéro in September and at the Eiffel Tower in December |

A 50-minute run hears about 4 minutes of voice. The rest is the runner's own music, ducked
only while a line or an ambiance plays.

### The demo reel

The whole race condensed to about five minutes, said to the sample runner (Camille Martin,
bib 1247, from Lyon, 47:12). It is one MP3 with chapters, and it is what the race page plays
under « Écoutez la course ». Send it to anyone who will not go and run:
`api/.produce/out/10km-champs-elysees-2027-10k/reel.mp3`.

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
