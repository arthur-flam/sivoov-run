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
- **One voice.** The speaker, in two registers (PA and close in the ear), not two people.
- **The runner's name, often.** The speaker and the crowd both use it, all the way.
- **Keep the countdown and the gun.** They were the highlight of the draft. But the start was a
  little slow: get to the countdown faster (below).
- **Recast the voice if Gemini has better.** Sadachbia sounded like a Parisian, but too young and
  not sporty enough. We want an older voice that sounds like a sports commentator
  (« Casting », below). If nothing beats it, keep Sadachbia.
- **Content first.** The next session takes its best shot at a complete 5K and 10K to listen to,
  then the engine and the library catch up. The tone must be personal, fun and an experience.

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

## The tone, on one page

Everything in this file distilled to what a writer keeps in mind for every line. The sections
after it explain why.

**The speaker.** A race speaker in his fifties, who has called this race for years and still loves
it. Warm, quick, a smile in the voice. He enjoys the race *with* the runner. He knows Paris and
running, and he never lectures about either. On the PA he is big and public. In the ear he is
close and quiet, like a friend running alongside. He is never a tour guide, a coach reading a
manual, or an advert.

1. **The name is the hook.** Use it often: about 15 times in a 10K, 8-10 in a 5K. Vary who says
   it (the speaker, the crowd, a regular in the crowd) and how (called out, said quietly, roared).
   Never the same way twice in a row.
2. **Here and now.** What the runner would see, hear and feel on this spot at this moment. No
   dates, no "did you know", no history lesson. A fact stays only if it changes how the runner
   feels or runs right now.
3. **Always say what comes next.** Every line looks ahead ("dans quatre cents mètres…"), and every
   silence is announced.
4. **Fun comes from character, not wordplay.** A wink, a shared joke, the speaker's own pleasure.
   No puns as punchlines.
5. **Read the run, never judge it.** Their pace, their best kilometre, their projected finish:
   yes. "Vous ralentissez": never.
6. **One job per line.** Orient, prepare, push, cheer, celebrate. Most lines run 3-12 s; only
   the start, the Arc and the finish get more.
7. **It builds.** Each act is bigger than the one before. The finish is the peak, and the 60 s
   after the line are part of the show.
8. **Plant early, pay off late.** At least one promise made in the first kilometre comes back in
   the last.
9. **Spoken French.** Short sentences, breaths (`…`), numbers in words. Read every line aloud
   before rendering it.
10. **No gender agreement about the runner.** We don't ask, so we don't know: no « prêt / prête »,
    « venu / venue », « fatigué ». Write « Vous y êtes », « En place », « C'est votre course ».
    The draft got this wrong (« la raison pour laquelle vous êtes venu »).
11. **When in doubt, cut.** Every line interrupts the runner's own music. It has to be worth it.

**Before and after** (the draft, then the direction; examples, not final lines):

| The draft | The direction |
|---|---|
| « C'est ici qu'en 1797, André-Jacques Garnerin a sauté d'un ballon avec le tout premier parachute. » | « Parc Monceau. Écoutez… les oiseaux, le gravier. Le seul calme de la course, Camille. Profitez-en : au bout, il y a les Champs. » |
| « Au numéro trente, un matin de février 1947, Christian Dior présentait le New Look. » | « Avenue Montaigne, la plus chic de Paris. Les vitrines vous regardent, Camille… Tenez-vous droit. » |
| « Kilomètre six. Vingt-neuf minutes quarante. » | « Kilomètre six. Vingt-neuf quarante… pile sur votre rythme du départ. C'est exactement ça. » |
| « Neuf cents mètres de pavés pour aller le chercher. Petits pas… et laissez la foule vous porter. » | (close) « Petits pas. Les bras. L'Arc ne bouge pas, Camille : c'est vous qui avancez. » |

## Casting the voice

Do this before writing many lines: the voice changes how the lines should be written.
- **Brief:** a French race speaker in his fifties, deep and warm, with the energy of a radio
  sports commentator. Native Parisian French. He has to work on the PA (big, smiling) and in the
  ear (low, close).
- **Candidates:** the Gemini TTS prebuilt voices. Check the current list on Google's docs
  rather than trusting memory. Shortlist six to eight that the docs describe as deep, mature,
  firm, gravelly or knowledgeable, plus Sadachbia as the reference.
- **Direction counts as much as the voice:** the director's notes (`geminiPrompt`) can make a
  voice older and more sporty. Try each candidate with two directions.
- **The test:** the same three lines for every candidate:
  - the PA welcome with a name;
  - a close coaching line on the climb;
  - the finish call with name and time.

  Render them, file them in the library (or a dated folder until it exists), and let the owner
  listen blind (names hidden) and score.
- **Names:** check how the winner says a dozen first names (French, Arabic, English, Asian,
  hyphenated). A mangled name is worse than no name, and those renders are the riskiest.

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

### A starting beat sheet (a proposal to beat, not to follow)

Distances on the official GPX. Times are for 5:00/km. P = a pool of takes; ★ = the runner's
name.

| Where | Beat | Job |
|---|---|---|
| Start pressed | The village first (DJ, crowd), then on the PA: ★ welcome to the Champs. Wherever they are, 20,000 run with them | Cold open, ≤ 15 s |
| | Their town and weather in one sentence, roads open where they are (the safety line, folded in) | Personal, ≤ 10 s |
| | « Coureurs… à vos marques. » The countdown, the crowd counting along on the last three. Horn, « Partez ! », the drop | The highlight. Countdown starts ≤ 35 s after Start |
| 100 m | ★ « Vous y êtes. » Let the fast ones go | Release |
| 250 m | Concorde: the cobbles underfoot, the Obelisk. **Plant:** « Vous le reverrez quand il restera trois cents mètres. » | Place + promise |
| 650 m | Madeleine, then Malesherbes: a long false flat, find your rhythm. « On se retrouve au parc. » | Orient + announced silence |
| each km | Split, read against their opening pace (P by condition: steady, faster, slower, round number in reach) | Their race |
| between | Crowd regulars shout ★, short affirmations from the speaker (P) | Fillers, the rhythm director's |
| 2.1 km | Monceau: the world leads (birds, gravel). The only calm of the race | Breath |
| 3.3 km | Rue de Lisbonne: the top of the loop, let the legs roll | Coach |
| ~4 km | The one story, on the flat: about this race and its runners, never a museum | Distraction |
| 5 km | « Previously on »: their start, their best km, where they stand. « Et maintenant… les Champs. » | Act break |
| ~5.6 km | « Dans quatre cents mètres, à droite… et vous verrez l'Arc. » | Anticipation |
| 5.95 km | The climb: drums, cobbles, crowd. ★ from the crowd | Act II peak builds |
| ~6.4 km | Close voice: short body cues, ★ | Push |
| ~6.8 km | Near silence: breath, the drums far away | The break before the drop |
| 6.9 km | The U-turn: the roar, the music flips. « Tout redescend. Les Champs sont à vous, ★ ! » | Midpoint reversal |
| 7.95 km | Montaigne: a wink | Fun |
| 8.6 km | The Seine, the Eiffel Tower across the water: the circuit's last stage, their third medal | Future |
| 9.0 km | Golden km: the build starts, count down in pictures (« un pont, puis la ligne ») | Act III |
| 9.45 km | Pont Alexandre-III: gold statues, ★ from the crowd | Push |
| ~9.7 km | **Payoff:** « Je vous l'avais dit… l'Obélisque. Trois cents mètres. » (check on the GPX that it is in view) | Promise kept |
| Finish | Horn, roar, ★ and their time on the PA | The peak |
| +20 s | Close again: what they just did, the medal (the first of three), see you at the Trocadéro | The end |

### The ceremony, faster

The countdown and the gun were the best part of the draft; the wait before them was too long
(welcome, safety, call and speaker's word in a row, plus the village). Merge the welcome and the
call into one line with the name, fold the safety into the weather line, and start the
countdown within ~35 s of pressing Start in the 10K and ~20 s in the 5K.

## The 5K demo

What a race director tries first. It is the trailer: denser, every signature moment, nothing
slow. It starts on the same countdown and gun as the 10K, cut short: village, ★ and the
promise of the course in one line, then « Coureurs… à vos marques. »
- **Recommended course: the last 5 km of the 10K** (km 5 → 10 on the official GPX):
  - the climb of the Champs, the Arc's U-turn, Montaigne, the Seine, the Golden km, the line;
  - it shares every sound and most lines with the 10K;
  - it is the 10K's best half.

  Check the cut on the GPX; if the start point is dull to describe, start the story at the
  ceremony and let the first kilometre be the approach.
- Its own finish and the same leitmotif. The countdown starts ~20 s after Start.
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

> Read CLAUDE.md, then docs/PRODUCTION.md (start with "The tone, on one page") and
> docs/SOUND_LIBRARY.md: they are the brief. We are producing the Paris 10K (Champs-Élysées
> course) and a 5K demo that sound like an experience: personal, fun, with rhythm, one voice and
> the runner's name all the way. Take your best shot. I want to listen to a complete run soon,
> then improve it. Work in this order, one validated slice per commit:
> (1) Casting: render the three test lines with the shortlisted Gemini voices and two directions
> each, and give me a blind listening list.
> (2) The 5K: the rundown from the beat sheet (show it to me before writing lines), then the
> lines in the chosen voice, then a full-run render at 5:30/km with the name "Camille" (extend
> `npm run produce` for it). Record every render's origin from the start (a manifest until the
> library exists).
> (3) My notes on the 5K, a second pass.
> (4) The 10K the same way, reusing the 5K's second half.
> (5) The engine, so the app plays what the renders promise: pools, conditions read from the
> run, the rhythm director, name cheers prepared before the start, with tests in shared/ and the
> density check.
> (6) The sound library and its listening page.
> Render voices with Gemini. When you need my ears, say exactly which files to listen to and what
> to listen for, then wait. Keep STATUS.md and MEMORY.md current.
