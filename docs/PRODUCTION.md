# Production: making the race sound great

The brief for the next content push: the Paris 10K and a 5K demo, produced like the best audio
shows, with rhythm. Written 2026-10-09 after the owner ran the 10 km Champs-Élysées draft for
real and listened to it. Read with `AUDIO.md` (the contract: events, packs, ambiances) and
`SOUND_LIBRARY.md` (where every sound we make or find is kept and scored).
`AUDIO_EXPERIENCE.md` is older research; where it disagrees with this file, this file wins.

## The decisions (owner, 2026-10-09)

- **Target: the Paris 10K, ready to pitch around January 2027.** The course in the repo is the
  10 km des Champs-Élysées (7 Feb 2027, `CHAMPS_ELYSEES.md`). Deauville (November) is no longer
  a content target: there is not enough time to do it well.
- **A 5K demo** next to it, for a race director to try in one lunch break.
- **Gemini is the voice provider** (billing enabled). ElevenLabs limits how many renders can run
  at once unless we pay for a large plan, and a pack of per-runner lines needs many at once.
- **No questions to the runner.** No sign-up questionnaire about goals or experience. Anything
  personal comes from what we already know (name, bib, town, weather) and from the run itself.
- **More sound, fewer long silences.** The draft let the runner run for minutes with nothing
  from the race. Silence is still a tool, but it has to be short and on purpose.
- **Live cheers with the runner's name**, many of them, not once at the start and once at the
  finish.
- **Sounds and music are judged by people listening**, before they ship. One listen by a person
  is worth more than any automatic score. Automatic checks catch mechanical faults
  (a director's note read aloud, a cut-off file). They do not judge taste.
- **Claude work runs on the subscription**, in Claude Code sessions. Writing, structure and
  critique happen in the session; Gemini renders the voice and can listen to it back. No
  Anthropic API pipeline is needed for content.

## What was wrong with the 10K draft

The owner's notes from running the draft (`api/src/seed/champsElyseesScript.ts`), and what each
one teaches:

| Heard | Why | Rule from now on |
|---|---|---|
| Long silences | ~4 minutes of voice in a 50-minute run, all on landmarks. Nothing happens between landmarks | A rhythm director fills gaps (below). Something from the race at least every ~2-3 minutes at any pace |
| Gratuitous lines | Most course lines have the same shape: place + trivia + a pun (Garnerin's parachute, Dior's New Look, the Obelisk's 3,000 years) | Trivia is not content. A fact only stays if it changes how the runner feels or runs *now* |
| Not descriptive enough | The lines name places but do not put the runner there | Describe what you would see, hear and feel on that spot: width, cobbles, the Arc growing, the crowd getting thicker |
| Not personal enough | Name at the start, a split template, name and time at the finish | The crowd knows your name all the way; the speaker reads your run (your pace, how it changes, your projected time) |
| Sounds that did not fit | 1960s-1980s BBC crowds under a 2027 Paris race; generic, thin | Every sound goes through the library and is scored by a listener before it ships (`SOUND_LIBRARY.md`) |

## The craft: produce it like a show

A race is a story with a fixed plot: everyone knows how it ends. Good television, film and radio
still keep people hooked on stories like that. Here is how, applied to a run.

### Structure
- **Cold open.** The first ten seconds after Start decide whether the runner trusts the audio.
  Start with sound (the village, a crowd, the race's music), then the voice. No preamble.
- **Three acts, mapped to distance**, so the arc holds at any pace:
  - 10K: Act I 0-3 km (arrive, settle, plant), Act II 3-7.5 km (the middle, the climb, the
    turn), Act III 7.5-10 km (the descent, the Seine, the Golden km, the line).
  - 5K: Act I 0-1.5, Act II 1.5-3.5, Act III 3.5-5.
- **A midpoint reversal.** The Champs course hands us one: the U-turn under the Arc
  (6.9 km). Everything before it climbs, everything after it falls. Build to it, and make the
  reversal heard (the music turns over, the crowd erupts, the voice changes register).
- **The hard moment is acknowledged, then released.** Most runners suffer in the last third of
  Act II. Say it honestly ("this is the part that costs"), then deliver the release.
- **The intensity curve climbs.** Plot intensity (0-10) against distance before writing a word.
  Dips are breaths, and each dip sits higher than the one before. The finish is the peak, not
  the start.

### Devices
- **Plant and payoff.** Something said early comes back later: a place seen at km 1 seen again
  200 m from the line; a promise at the start ("at the Arc, you'll understand why people come")
  kept at the Arc. Payoffs are what make a script feel written instead of listed.
- **Promise before a silence.** Never go quiet without saying what comes next and roughly when
  ("I'll find you at the park"). A silence that was announced feels like a pause in a
  conversation, not like the app breaking.
- **Callbacks to the runner's own run.** "At kilometre two you were at five ten. You're at five
  oh two now." The runner's data is the only story that is truly theirs.
- **A leitmotif.** One musical idea for the race (Lyria). It is heard at the start, it returns
  thin under the climb, it builds in the Golden km and resolves at the finish. That is the
  race's sound identity, and what makes the demo reel recognisable.
- **Two kinds of voice.** The *speaker* is public: the PA, big, for the crowd. Add a *close*
  voice in the runner's ear: calm, low, coaching (a second Gemini voice, or the same speaker
  directed close-mic). Switching between the two is rhythm in itself. Decide in the first
  session whether it is one person in two registers or two people.
- **The crowd is a character.** It shouts the runner's name. It gets thicker on the Champs.
  It has a few recurring "regulars" (the same two or three voices at several points).

### Rhythm
Think of it as music: beats of different lengths, alternating.

| Beat | Length | Examples | In a 50-min 10K |
|---|---|---|---|
| Long | 25-45 s | the ceremony, the reversal, the finish | 3-4 |
| Medium | 8-20 s | a place described, a coaching cue, a split read with meaning | 12-18 |
| Short | 1-5 s | the crowd shouting your name, a sting, the speaker saying one word | 20-40 |
| Bed | 30-180 s | the crowd on the climb, the Golden km's music | 4-6 |
| Silence | < 3 min, announced | your own music | between the rest |

- No two medium beats of the same kind back to back (two place descriptions in a row is a
  tour guide).
- Short beats are what kill the long silences, at almost no cost to the runner's own music.
- Density must hold at every pace. A 7:30/km runner runs for 75 minutes and must not get the
  4:30/km runner's script with longer holes. The rhythm director (below) handles that.

### Writing a line
- Second person, present, sensory. What is here, now, for you.
- One job per line: orient, prepare, coach, cheer, celebrate, or (rarely) tell a story.
- A story is allowed at most twice in a 10K, on the flat middle, and must connect to effort or
  to running. Otherwise it's cut.
- No pun endings. No "did you know". No history lesson.
- Written for the ear: short sentences, numbers in words (the engine does it, `spokenFr.ts`),
  breath marks (`…`) where the voice should take time.
- French first. Every line is read aloud by a person before it is rendered.

## What the engine needs

The script editor already supports variants in a limited way: one offline version plus one
personal version per line. The engine needs four things more. Each is pure logic in `shared/`
(tests first), read by the app, shown in the studio.

1. **Pools.** A line can carry several takes. The engine picks one the runner has not heard in
   this run (rotation, no repeat). Splits, cheers, fillers and "keep going" lines all live in
   pools, so the tenth cheer does not sound like the first.
2. **Conditions read from the run, not asked.** A take can carry a `when`. The engine already
   knows these things about the run:
   - *reference pace*: the runner's own pace over km 1-2 (their rhythm, measured, not declared);
   - *drift*: this km against the reference (fading, steady, pushing);
   - *projection*: the finish time at this pace, and whether it is close to a round number
     ("under fifty minutes is in reach");
   - *stopped or walking* for more than ~20 s (an encouraging restart line, not a reproach);
   - the distance left, the time of day, the weather, the town, whether this is a rehearsal.

   The studio shows a line's takes with their conditions as tags (« si ralentit », « si proche
   de 50 min », « à l'arrêt »). This *is* the variant system; no runner profile is needed.
3. **A rhythm director.** A pure function: given the time since the race last made a sound,
   the runner's current pace, and the distance to the next placed line, it decides whether to
   play a filler from a pool now. It never plays one if the next placed line would arrive within
   ~40 s. It respects a per-race `maxGapSeconds`, ~150 s by default, to tune by listening.
   Fillers are mostly short beats.
4. **Name cheers, prepared before the start.** The first name is known before the gun, so cheers
   are not live generations:
   - render a pool of ~12-15 short shouts at the pre-flight ("Allez Camille !", "Vas-y
     Camille !", a few voices, a few energies) and play them over a crowd bed through the
     existing `under` player;
   - cache them by *first name and take*, not by runner: every Camille shares the same
     renders, so the cost is per name, not per entry;
   - place a few at fixed moments (the climb, the Arc, the Golden km, the final straight) and
     let the rhythm director use the rest as fillers.

   Live generation stays for what only exists during the run: times, paces, projections.

## Testing what we make

- **Full-run renders are the main test.** Extend `npm run produce` to render the whole run as
  the engine would play it, at a given pace, into one file plus a timeline. Make it at three
  paces (4:30, 5:30, 7:00/km) and with one stop and one walking minute. The owner listens to
  them; the timeline shows every gap. This tests the writing, the rhythm director, the pools
  and the mix together.
- **A density check in tests.** Simulate the run at 4:00-8:00/km; no gap longer than
  `maxGapSeconds`; no line overlaps the next placed one. Cheap, in `shared/`, runs in CI.
- **Generations are not all checked.** Mechanical checks only:
  - a duration plausible for the text (`plausibleSeconds`, exists);
  - loudness in range;
  - for pack renders, a sampled transcription by Gemini compared with the text (catches a
    director's note read aloud).

  Per-runner renders get the duration check only.
- **Real conditions, a few times.** One real run per big change, outdoors, phone locked,
  earphones. Note what was heard and where (the run journal has the timeline).

## The 10K plan (Champs-Élysées)

Rewrite from the rundown, not from the draft:
1. Course bible: the GPX profile (climbs, turns, cobbles, the long straights), what is seen
   and heard at each point on race morning, the race facts that matter to a runner (pens,
   Golden km, the circuit's three medals). Sources noted.
2. Rundown: acts, the intensity curve, every beat with its job, length and placement, the
   leitmotif's appearances, the plants and their payoffs, the announced silences.
3. Lines, several takes for anything in a pool, read aloud, then rendered with Gemini.
4. Sounds: each one picked from the library, or made and then scored (`SOUND_LIBRARY.md`). The BBC
   crowds go unless a listener scores them 4+ in context.
5. Full-run renders at three paces; the owner's notes; repeat 2-5.

## The 5K demo

What a race director tries first. It is the trailer: denser, every signature moment, nothing
slow.
- **Recommended course: the last 5 km of the 10K** (km 5 → 10 on the official GPX):
  - the climb of the Champs, the Arc's U-turn, Montaigne, the Seine, the Golden km, the line;
  - it shares every sound and most lines with the 10K;
  - it is the 10K's best half.

  Check the cut on the GPX; if the start point is dull to describe, start the story at the
  ceremony and let the first kilometre be the approach.
- Its own short ceremony (~45 s, not 2 min), its own finish, the same leitmotif.
- It works at 25-40 minutes. Density is higher than in the 10K.
- A demo race (`demo_of`), with its own course row for the 5K.

## Definition of done (both courses)

- Full-run renders at 4:30, 5:30 and 7:00/km, listened to end to end by the owner, with no open
  note marked as blocking.
- The density check passes from 4:00 to 8:00/km.
- Every line and sound in the pack has a library entry with its origin and at least one human
  score of 4 or more, heard in context.
- A pitch reel of at most 5 minutes per course (`reel.mp3`), with chapters.
- One real outdoor run of each, phone locked.

## Kickoff prompt for a long session

Paste this into a fresh Claude Code session (laptop, Gemini key in the environment):

> Read CLAUDE.md, then docs/PRODUCTION.md and docs/SOUND_LIBRARY.md: they are the brief. We are
> producing the Paris 10K (Champs-Élysées course) and a 5K demo to the definition of done in
> PRODUCTION.md. Work in this order, one validated slice per commit:
> (1) the sound library and its listening page (SOUND_LIBRARY.md), so everything after it is
> kept and scored;
> (2) the engine: pools, run-read conditions, the rhythm director, name cheers prepared before
> the start, with tests in shared/ and the density check;
> (3) full-run renders at a given pace in `npm run produce`;
> (4) the 10K: course bible, rundown with the intensity curve, then lines. Show me the rundown
> before writing lines;
> (5) the 5K demo.
> Render voices with Gemini. Never ship a sound no person has scored. When you need my ears, say
> exactly which files to listen to and what to listen for, then wait. Keep STATUS.md and
> MEMORY.md current.
