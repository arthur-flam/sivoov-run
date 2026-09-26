# Audio Experience

What the runner hears, why, and what to build for Deauville 2026. `AUDIO.md` is the contract
(event model, pipeline, playback rules). This is the content brief: principles, a ranked idea
list, a proposed rundown for Deauville, and a v1 cut.

Vocabulary used below: **bed** = a non-verbal ambience loop (crowd, sea, PA bleed) under
everything else; **beat** = one scripted moment; **pocket** = a short cluster of audio between
two long silences.

---

## 1. What makes race audio great

**0. The bar is on the floor.** The Conqueror, Yes.Fit and Race At Your Pace — the incumbent
virtual-race products — ship no audio layer at all: a map, a postcard, a medal. Reviews praise
the medal. Anything competent here is a category difference, not a feature.

**1. Silence is the default; speech is an event.** The failure mode of every audio-running
product is talking too much. Naomi Alderman built Zombies, Run! as "four or five 60-120 second
bursts of story" per arc, with the runner's own playlist as the ad break — stretching a mission
from 30 to 60 minutes adds *more songs between the same beats*, not more dialogue. Peloton is
the counter-example, and the complaint is always density, never content ("instructors who feel
the need to talk literally the whole time"). A 4-hour marathon should hold well under 25 minutes
of voice, in pockets of 60-120 seconds.

**1b. Space the pockets on something.** Apple's *Time to Run* puts one coaching beat at each
song boundary; Runna cues only at lap boundaries, never mid-rep. We have a better ruler than
either — distance along a real course. One pocket per landmark, a hard floor of 2 km between
pockets, and the split as the only thing allowed to recur.

**2. Announce the silence.** "Je vous laisse courir, rendez-vous au vingtième" turns absence
into a promise kept rather than an app that stopped working. Cheap, and it buys the right to be
quiet for twenty minutes.

**3. Never talk into the hardest effort.** Guided-run reviews complain most about a voice
arriving mid-interval. In a marathon the equivalents are the last kilometre and the stretch
right after a bad split. Those get crowd, not commentary.

**4. A race is a ceremony, not a workout.** This is the one thing coaching apps cannot copy and
the whole reason the product exists: a start the runner does not control, a gun they obey, an
announcer who says their name at the line. Budget the production effort accordingly — the
ceremony is worth more per second than anything in the middle.

**5. Specificity is the emotion.** "Les cabines des Planches portent des noms de stars" is
remembered; "quel bel endroit" is not. Named, dated, located detail is also what the runner
repeats to other people afterwards, which is the only marketing the product gets.

**6. Second person, present tense, "vous".** The line describes what is happening to the runner
now. Anything they cannot see or feel from where they actually are ("regardez à droite") has to
be written so it works both on the real course and on a treadmill in Montreal: evoke, don't
instruct.

**7. Numbers must be sparse and exact.** The split is the one number a runner genuinely wants.
Give the time, not the interpretation. One wrong number discredits every other line in the pack.

**8. The crowd is the cheapest emotion per euro — and record the city rather than describing
it.** Amsterdam's virtual marathon is best-in-class: an hour of cheers from actual Amsterdammers
on a 3D binaural mic, plus the city's own sounds (tram bells, market vendors, the Westertoren).
Virtual London simply fires crowd audio every half mile. Beds need no translation and never need
re-recording when a fact changes. Deauville has its own sound set — boards underfoot, gulls, the
tide, a horse at walk, the Marseillaise — and somebody should go and record it.

**8b. Encode continuous state without words.** Zombies, Run!'s one clever mechanic is a pursuit
ping that accelerates as the zombies close: distance with no number and no voice. Ours is a
crowd bed that swells toward the line.

**9. One voice, held all the way — and give it a reason to be there.** A single announcer from
the pre-start to the medal makes the race one object. Make the voice *diegetic*: it is the race
speaker on the PA, not a disembodied coach. Zombies, Run! never sounds cheesy because every
line is a radio transmission; a "coach" saying the same words would. A second voice is allowed
only when it plays a role the announcer cannot (the race director, a local), and must be
obviously different.

**10. The arc must escalate.** Kilometre 38 cannot sound like kilometre 8. Density, energy and
the crowd bed all rise toward the line. A flat arc is the single biggest craft failure in
virtual-race audio, and the reason "narrated course" products feel like audio guides.

**11. Never depend on the network, and degrade to a generic file.** Every dynamic line needs a
pre-rendered fallback. The pack is downloaded before the start (already true here).

**12. The memory is the product, so make it portable.** The finish call with the runner's name
and time is the asset that gets shared and re-listened to. Render it as a file that survives the
run.

**13. Let the runner turn it down without turning it off.** A single "moins de voix" control
that keeps ceremony and course and drops coaching and personal.

**14. Know what French runners hate hearing.** A published list of the worst marathon
encouragements is a direct spec for what the announcer must never say: minimising the distance
left (« il ne reste qu'un petit tour »), false maths (« tu es presque à la moitié » at 18 km),
untrue promises about hills, denying the effort (« tu n'as pas l'air fatigué »), asking for a
smile. The positive corollary: count what is **done**, not what is left — « trente-deux derrière
vous » lands where « plus que dix » insults.

---

## 2. Ideas, ranked by moment

Rating: **V** value to the runner, **E** effort, both out of 3. Cost is the production route:
`file` = one pre-rendered MP3, `slots` = template with pre-rendered fragments, `entrant` = one
short file rendered per entrant at pack-build time, `llm` = written per runner off-line (server,
after the run), `tts-live` = on-device speech at run time.

### Before the start (app is armed, runner has not moved)

The engine has no trigger for this phase — `TriggerState.phase === 'idle'` fires nothing but a
`start` event, and the store owns a `countdown` phase the pack cannot see. Fixing that unlocks
the whole section (see §4, item 1).

| # | Idea | Runner hears (FR) | Data | Cost | V/E |
|---|---|---|---|---|---|
| A1 | **Pre-start bed**: the pen, ten minutes before the gun. Plays on the prepare screen. | *(no words: crowd, PA bleed, wind, a whistle)* | none | file | 3/1 |
| A2 | **Call to the line**, by bib and name | « Dossard mille deux cent quarante-sept, Marc Dupont : vous êtes attendu sur la ligne de départ. » | name, bib | entrant + slots | 3/2 |
| A3 | **Sound check / volume**, in character | « Avant de partir, réglez le volume : vous devez entendre la mer sans crier pour l'entendre. » | none | file | 2/1 |
| A4 | **Breathe-and-wait beat**, 60 s before the countdown | « Deux minutes. Secouez les épaules. Vous avez déjà fait le plus dur : vous êtes là. » | none | file | 2/1 |
| A5 | **Goal declared back**: runner picks a target time in prepare, the announcer repeats it | « Objectif trois heures quarante-cinq. C'est noté. Ne le dépassez pas dans les cinq premiers kilomètres. » | goal time | slots | 2/2 |
| A6 | **Weather line** for where the runner actually is | « Neuf degrés, vent de nord-ouest : la même chose qu'à Deauville ce matin. » | weather (lat/lng) | slots or tts-live | 1/3 |
| A7 | **A rehearsal run**, 3-5 km, a week before, using the real ceremony and three real landmark lines. The Virtual London Marathon shipped a practice 5K for exactly this reason: race day must not be the first time the runner hears the audio, or discovers their headphones don't pair. | « Ceci est un essai. Le vrai départ, c'est dimanche. » | none | file | 3/2 |
| A8 | **Announce the plan before the effort**, Peloton's warm-up doctrine: the one place density is welcome | « Voilà comment ça va se passer : je vous parle aux kilomètres qui comptent, et je vous laisse tranquille entre les deux. Au trentième, je reviens. » | none | file | 3/1 |

### The start ceremony (the 90 seconds that sell the product)

| # | Idea | Runner hears (FR) | Data | Cost | V/E |
|---|---|---|---|---|---|
| B1 | **Speaker over music in the pen**, then the hand-off to the starter | « … et on rappelle aux coureurs du marathon que le départ est dans une minute. Marathon : une minute ! » | none | file | 3/1 |
| B2 | **Countdown from ten with the crowd joining in** — the crowd must be audible, not just the voice | « Dix… neuf… huit… » | none | file | 3/1 |
| B3 | **The gun**, then twenty seconds of roar and footsteps, then a hard fade to nothing | *(horn, roar, feet, fade)* | none | file | 3/1 |
| B4 | **The race director's real voice**, one recorded line before the gun | « Bienvenue à Deauville. Où que vous soyez ce matin, vous courez notre marathon. » | none (one recording) | file | 3/1 |
| B5 | **First 400 m instruction**, deliberately anti-climactic | « Laissez partir les autres. Les quarante premiers mètres ne comptent pas. » | none | file | 2/1 |
| B6 | **Field size** so the runner is inside a crowd, not alone | « Vous êtes deux mille sept cents au départ ce matin. » | field size | file | 2/1 |

### Early kilometres (0-8: seafront, Touques)

| # | Idea | Runner hears (FR) | Data | Cost | V/E |
|---|---|---|---|---|---|
| C1 | **Landmark lines**, one per landmark, ~20 s, never two within 2 km | « Vous êtes sur les Planches. Du bois sous vos pieds, la mer à gauche, et quarante-deux kilomètres devant vous. » | distance | file | 3/1 |
| C2 | **The seafront bed**: gulls, tide, wood underfoot, under the first 2 km | *(bed)* | distance | file | 3/1 |
| C3 | **Too-fast guard** at km 3-5 only, once | « Vous êtes parti trop vite. Vingt secondes de trop au kilomètre. Reprenez votre allure, elle vous attend. » | pace, goal | slots | 3/1 |
| C4 | **Crowd pockets** at the two or three places the real race is loud, 15 s each | *(bed: cheering, cowbells, a name shouted)* | distance | file | 3/1 |
| C5 | **Aid station cues** at the real table positions | « Ravitaillement. Buvez, même si vous n'avez pas soif : c'est le kilomètre cinq qui décide du trentième. » | distance | file | 3/1 |

### The long middle (8-32: the part every product gets wrong)

| # | Idea | Runner hears (FR) | Data | Cost | V/E |
|---|---|---|---|---|---|
| D1 | **A serialised story in 3-4 episodes**, 60-90 s each, spread over the middle. For Deauville: the horses (the haras, the hippodrome, one anecdote). This is the single strongest answer to middle-of-marathon boredom, and the thing Zombies, Run! proves works. | « Épisode deux. À votre droite, des barrières blanches à perte de vue… » | distance | file | 3/2 |
| D2 | **Announced silence** after each pocket | « Je vous laisse courir. Rendez-vous au vingtième. » | distance | file | 3/1 |
| D3 | **Half-way beat**, treated as a ceremony moment, not a landmark | « Mi-course. Vingt et un kilomètres derrière vous, en une heure cinquante-deux. Le reste du marathon commence maintenant. » | split time | slots | 3/1 |
| D4 | **Km splits**, terse, two numbers and nothing else | « Kilomètre douze. Cinquante-huit minutes quarante. » | km, split | slots | 3/2 |
| D5 | **Five-km recap** replacing the split at multiples of 5 | « Vingt-cinq kilomètres. Deux heures onze. Moyenne : cinq minutes seize au kilomètre. » | splits, avg pace | slots | 2/2 |
| D6 | **Ghost runner from the real previous edition** | « À cette allure, vous êtes dans les foulées du quatre cent douzième de l'an dernier. » | 2025 results, pace | slots | 3/3 |
| D7 | **Local voices**, 15-20 s each, non-announcer: a groom, a fisherman, a volunteer | « Moi je tiens ce ravitaillement depuis onze ans. Et chaque année, au trentième, je vois les visages changer. » | distance | file | 2/2 |
| D8 | **Drifting-pace nudge**, at most twice in the race, and never twice in 10 km | « Votre allure glisse doucement. Rien de grave. Trois grandes respirations, et on reprend le rythme. » | pace | file | 2/1 |
| D9 | **Weather/wind beat** tied to the exposed section | « Le vent vous prend de face sur ce tronçon. Raccourcissez la foulée, ne forcez pas : il tourne au trentième. » | distance (+ weather) | file | 2/1 |

### The last kilometres (32-42)

| # | Idea | Runner hears (FR) | Data | Cost | V/E |
|---|---|---|---|---|---|
| E1 | **The wall beat at km 32**, written specifically, the most important line in the pack after the finish | « Trente-deux. C'est ici que le marathon commence vraiment. Dix kilomètres. Vous en avez déjà fait trente-deux : ceux-là, personne ne vous les reprend. » | distance | file | 3/1 |
| E2 | **The crowd bed rises** from km 38 to the line, never fully silent again | *(bed, escalating)* | distance | file | 3/2 |
| E3 | **Finish projection** once, at km 38 | « À cette allure, vous franchissez la ligne en trois heures quarante-huit. » | pace, remaining | slots | 3/2 |
| E4 | **The return to the sea** — the emotional pivot, the course comes back to where it started | « La Manche est de nouveau là, sur votre gauche. Elle ne vous quitte plus jusqu'à l'arrivée. » | distance | file | 3/1 |
| E5 | **No talk in the last kilometre.** Crowd only, then the announcer at the line. | *(crowd, PA, a name shouted)* | distance | file | 3/1 |
| E6 | **Boards underfoot** in the final 200 m: the sound of the Planches | *(bed)* | distance | file | 3/1 |

### The finish

| # | Idea | Runner hears (FR) | Data | Cost | V/E |
|---|---|---|---|---|---|
| F1 | **The name-and-time call.** The product in one sentence. | « Marc Dupont ! Trois heures quarante-six, dix-neuf secondes. Marathon International de Deauville. Vous êtes arrivé. » | name, chip time | entrant + slots | 3/2 |
| F2 | **Forty seconds of finish area**, then real quiet | *(crowd, PA, applause, a distant speaker)* | none | file | 3/1 |
| F3 | **The medal**, as an instruction | « Baissez la tête. Voilà. Elle est à vous. » | none | file | 3/1 |
| F4 | **Close the arc** with a callback to the intro line | « Ce matin je vous disais : quarante-deux kilomètres devant vous. Il n'y en a plus un seul. » | none | file | 3/1 |
| F5 | **"Your time is official"**, said, not only shown | « Votre temps est officiel. Il part vers les résultats du marathon. » | none | file | 2/1 |

### After the run

| # | Idea | Runner hears (FR) | Data | Cost | V/E |
|---|---|---|---|---|---|
| G1 | **A 90-second race report**, written per runner after the run and rendered server-side. No offline constraint, no latency constraint, one LLM call and one TTS call per finisher. The best use of an LLM in this product. | « Vous êtes parti prudemment : cinq vingt au premier kilomètre. Au trentième, votre allure n'avait pas bougé de huit secondes… » | all splits, goal, weather | llm + tts | 3/2 |
| G2 | **The finish call as a shareable clip** (15 s audio, or audio over the certificate image) | *(F1, as a file)* | name, time | entrant | 3/2 |
| G3 | **Replay the race** — the whole audio track, in order, as a podcast on the results page | — | fired-event log | file | 2/2 |

### Cross-cutting

| # | Theme | Idea | V/E |
|---|---|---|---|
| X1 | **"Moins de voix"** | Three levels: *Cérémonie seule* (ceremony + finish only), *Normal* (+ course + splits), *Tout* (+ coaching + personal). Categories already exist in the schema; this is a setting, a filter and a screen. | 3/1 |
| X2 | **Personalization** | Tiered by cost: name (entrant file) → goal time (slots) → splits (slots) → ghost from real results (slots) → weather (live). Ship in that order. Never let a personalized line be the only thing at an important beat: always a generic file behind it. | 3/2 |
| X3 | **Coaching** | Opt-in, capped: at most 4 coaching events in a marathon, none in the last 2 km, none within 90 s of a landmark. A coaching line that arrives twice sounds like a bug. | 2/1 |
| X4 | **Music & ambiance** | Do not ship licensed music. Ship beds. The runner's own playlist is the soundtrack and the app ducks under it (already the playback rule). A bed and the runner's music at once is fine; a bed plus music plus voice is mud — beds duck too. | 3/1 |
| X5 | **Safety** | Real roads, real traffic. One pre-start line ("vous courez sur des routes ouvertes, la course ne vous protège pas") and nothing during the run that tells the runner to look at anything. `safety` category is never filtered by "moins de voix". | 3/1 |
| X6 | **Replayability** | The window is a week and some runners will run twice. A second pack variant (`version: 2`, alternate landmark lines, same ceremony) is cheap once the pipeline exists. Also: runners of the half hear a subset, not a rewrite. | 2/2 |
| X7 | **Shareability** | The certificate, the finish clip (G2) and the race report (G1). No social graph, no feed (PRD non-goal) — the runner shares it themselves. | 3/2 |
| X8 | **Voice** | One ElevenLabs voice for the announcer (currently *George*, an English preset — audition French-native voices before the final pack: an accent on « Tourgéville » is an immersion break). One real human voice for the race director. | 3/1 |
| X9 | **Number rendering** | Pre-render French fragments once (0-59, "heure/heures", "minute/minutes", km 1-42) and concatenate for every split, projection and finish time. Offline, consistent, no per-entrant TTS spend, no on-device TTS accent. Do this before any other personalization. | 3/2 |
| X10 | **Treadmill and elsewhere** | Half the audience is not in Normandy. Every line must work with eyes closed. Write « la mer est à votre gauche » (evocation) not « tournez à gauche » (instruction). | 3/1 |
| X11 | **Terrain honesty** | Runna disables pace alerts on hilly courses because target pace is meaningless on a gradient. Our runner's real terrain is unknown and unknowable, which is the same problem one step worse: keep pace coaching to the two guards (C3, D8) and never scold. | 3/1 |
| X12 | **Haptics locked to audio** | Apple pushes a landmark photo to the watch with a gentle haptic *at the moment it is named*. A single vibration when a landmark line starts costs nothing and confirms to a runner with earbuds in the wind that the app is alive. | 2/1 |
| X13 | **Organizer slots** | RunGo lets organizers drop custom audio at chosen course points (sponsor messages, elite voices, a scream tunnel). Reserve two or three `course` slots in the pack that the organizer can fill with their own recordings — it is also how the race director's line (B4) gets in without a bespoke pipeline. | 2/2 |
| X14 | **No fail states** | Zombies, Run! never fails a runner: caught means you drop supplies and the mission continues. Ours: missing a target pace, walking, stopping for a light, or finishing in six hours must never change the finish audio into something smaller. | 3/1 |

### From the previous product (`arthur-flam/sivoov`), what to keep

- **Keep: the trigger vocabulary.** `waypoint` (lat/lon/radius) is worth porting for runners
  actually on site; `periodic` / `periodic_distance` already exist here as `split`.
- **Keep, but move off the run: the LLM.** `llm.service.ts` wrote lines live, mid-run. Wrong
  place for a race: one voice, a fixed reviewed script, latency fatal, offline mandatory. Move
  the same capability to G1, the post-run report, which has none of those constraints.
- **Keep, weakly: the weather service.** `app/src/services/weather.ts` (cached 30 min, fails to
  `null`) is a clean port and gives A6/D9 a nice touch. v1.5, not v1.
- **Drop: personality presets** (COACH / EXPLORER / MINDFUL / GUIDE…). A race is not a
  personality slider; it is one announcer. The only axis that matters is *how much* they talk
  (X1), not *who* they are. Same for the "hero of your urban adventure" system prompt — it is
  written for the city-discovery product the PRD rules out.

---

## 3. Applied to Deauville 2026

### Verified facts the pack can stand on

From the organizer and press (sources in §5). **Marked `?` = unverified, confirm with the race
director before it goes in a runner's ears.**

- 7th edition, **14-15 November 2026**. The **marathon is Sunday 15 November at 10h00**, starting
  rue de la Mer / Boulevard de la Mer (the two official pages disagree `?`). Half: Sunday, waves
  08h00-08h20. 10 km: Saturday 15h00. Relays: Sunday 10h15. Kids' 900 m: Saturday 13h30.
- **42.195 km, 113 m of climb, all tarmac, "très roulant et quasiment plat"**, and — the fact
  that should reshape the whole script — **a double loop of about 21 km**.
- Communes crossed, per the organizer: **Deauville, Tourgéville, Bénerville, Saint-Arnoult**.
  Only those four.
- Aid stations **every ~5 km plus the finish**: water in biodegradable cups, Coca, bananas,
  oranges, raisins, chocolate, crackers, strawberry sweets, sugar, pain d'épices.
- Cut-off **5h30**. Pacers 3h00 to 4h30. Metal medal for every finisher, plus a digital one.
- **~20,000 runners expected across the weekend in 2026, of whom ~4,000 marathoners** (12,000-15,000
  in 2024 — the race is growing fast). Deauville's own population is 3,539.
- 2025 marathon won by Guillaume Ruel in 2h21'44 and Selina Leroy in 2h39'56. Course record
  Titus Kirwa Komen, 2h16'19, 2022.
- Finish: "une majestueuse arrivée sur les Planches de Deauville".
- Mid-November on the Côte Fleurie: mean high 11 °C, mean low 6.5 °C, ~14 rain days in the
  month, 87% humidity. 2019 got sun and no wind; reports flag rain, wind and cold as the norm.

**Discrepancies to fix in the repo** (not in this document's scope, but worth a line):
`api/src/seed/deauville.ts` has `organizerUrl: 'https://www.marathon-deauville.com'` — the
official site is **marathondeauville.fr** — and names the race "Marathon International **de**
Deauville" where the organizer writes "Marathon International **in** Deauville" ("inDeauville"
being the area's tourism brand).

### The structural problem with the current v0 script

`shared/src/fixtures/index.ts` places nine landmarks on a single pass: Planches 200 m, Normandy
900 m, Touques 3 900 m, Saint-Arnoult 7 700 m, Tourgéville 11 600 m, half 21 097 m, hippodrome
30 000 m, Sunset Beach 38 000 m, finish 42 195 m. But the course is a **double loop**, and the
GPX in the fixture confirms it: the coordinates return to the start area around the halfway
point. So:

- **Every landmark is passed twice**, and the second pass has nothing to say — the entire back
  half is covered by two landmarks, exactly the flat arc principle 10 warns about.
- `hippodrome` (30 km) and `sunset` (38 km) are almost certainly the *second pass* of features
  already passed at ~9 and ~17 km. Neither Sunset Beach nor the hippodromes are named by the
  organizer `?`.
- **Bénerville is missing**, and is one of only four communes the organizer lists. Coastal, west
  of Deauville, so probably on the seaward return leg: ~17 km and ~38 km `?`.
- `touques` is in the fixture as a commune but is **not** in the organizer's four. The Touques is
  also the river and the older hippodrome — the landmark may be the bridge, not the village `?`.

**Recommendation: model the course as one loop of landmarks, played twice with different text.**
That is not extra work — it is the same eight places, written once outbound and once as a
homecoming — and it hands you the arc for free. Distances below are loop-relative +21.1 km for
the second pass, and all need checking against the 2026 GPX.

### The dramatic arc

| Pass | Distance | Where | What the audio is doing |
|---|---|---|---|
| 1 | 0-1 km | Planches, Normandy | Ceremony spills over. Wide, warm, the sea. "Forty-two kilometres ahead of you." |
| 1 | 1-8 km | Touques, Saint-Arnoult | Settle down. The horses, episode 1. The too-fast guard. Then a long announced silence. |
| 1 | 8-17 km | Tourgéville, bocage | Quietest part of the race. One local voice, one weather beat, splits. |
| 1 | 17-21 km | Bénerville, the seafront return | The sea comes back. The crowd bed returns. The runner thinks they are nearly home. |
| — | **21.1 km** | **Past the finish arch** | **The pivot. You run past the line and turn away from it.** |
| 2 | 21-29 km | Planches, Normandy, Touques again | Familiar ground, changed meaning. The horses, episode 2. Shorter lines, more honesty. |
| 2 | 29-33 km | Saint-Arnoult, Tourgéville | The wall beat at 32. The one place the announcer gets to be big in the middle of nowhere. |
| 2 | 33-40 km | Bénerville, the seafront | Escalation begins and never stops. Crowd bed rising, projection at 38. |
| 2 | 40-42.195 km | The Planches | Crowd only, then the cabins, then the name. |

### The start ceremony, beat by beat (10h00, Sunday)

1. **The village bed** (on the prepare screen): PA bleeding across the Boulevard de la Mer,
   crowd, wind off the Channel, a whistle. No words.
2. **The speaker**, mid-sentence, as a real PA always is: « …et on rappelle aux marathoniens que
   le sas ferme dans cinq minutes. »
3. **The call by bib and name.** « Dossard mille deux cent quarante-sept, Marc Dupont. »
4. **The safety line.** Real roads, no closures where the runner is.
5. **The field.** « Vous êtes quatre mille sur le marathon ce matin, vingt mille sur le
   week-end. Dans une ville de trois mille cinq cents habitants. »
6. **The race director**, his own recorded voice.
7. **The plan** — how often the announcer will talk, and the promise of silence.
8. **La Marseillaise.** See below; this is the signature.
9. **Countdown from ten**, the crowd joining in.
10. **The gun**, roar, twenty seconds of footsteps, hard fade.
11. **At 400 m**, one line: let them go.

### What a real spectator hears at this race

A speaker on the PA at the race village (Palais Omnisport, Boulevard de la Mer) with music
between announcements; the Marseillaise before the start; a dense, loud, slightly chaotic crowd
on the Planches at both the start and the finish — runners' most common complaint is spectators
blocking the finish funnel, which tells you how packed it is; then, inland through Saint-Arnoult
and Tourgéville, near silence: open bocage, white haras fencing, a few clusters of spectators,
volunteers at a table every 5 km calling out what is on it. No bands or stages are published `?`.
Underneath everything, twice per lap: the sea, the gulls, and 643 metres of wood underfoot.

### Three signature moments, unique to this race

**1. La Marseillaise before the gun.** Verified from runner reports across editions — « une
Marseillaise avant le départ qui fout les frissons », and in 2024 sung « sur le toit des
Planches ». Nothing else we can produce will beat it. The composition is public domain, but use
a fresh recording (a choir, or the crowd itself), not a commercial master.

**2. Running past the finish arch at 21 km and turning away from it.** A consequence of the
double loop, and the cruellest, most memorable thing this course does. Treat it as a ceremony
event, not a landmark: the crowd rises, the PA is audible, and the announcer says it out loud
rather than pretending it isn't happening.

**3. The finish straight is a walk of fame.** The Planches are a 643 m boardwalk built in 1923
by Charles Adda, lined with **450 bathing cabins painted with the names of actors and directors
honoured at the American Film Festival** since 1987. Runners call the boardwalk finish
"interminable". Turn that liability into the best 40 seconds in the product: name the cabins as
the runner passes them. No other marathon finish in the world lets an announcer do that.

### Proposed events table

Paste into the studio. `trigger` uses the model in AUDIO.md plus the proposed `cue` kind (§4).
Distances marked `?` need the 2026 GPX. Text is a one-line placeholder for the studio to expand
to 15-25 seconds where marked (bed rows have no text).

| id | trigger | cat | FR |
|---|---|---|---|
| `ceremony.village` | cue:armed | ceremony | *(bed: PA, foule, vent, mouettes)* |
| `ceremony.speaker` | cue:armed | ceremony | « …et on rappelle aux marathoniens que le sas ferme dans cinq minutes. » |
| `ceremony.call` | cue:armed | personal | « Dossard {bib}, {firstName} {lastName}. Vous êtes attendu sur la ligne. » |
| `ceremony.safety` | cue:armed | safety | « Vous courez sur des routes ouvertes : la course ne vous protège pas, regardez pour deux. » |
| `ceremony.field` | cue:armed | ceremony | « Quatre mille marathoniens ce matin, dans une ville de trois mille cinq cents habitants. » |
| `ceremony.director` | cue:armed | ceremony | *(voix du directeur de course)* « Où que vous soyez ce matin, vous courez notre marathon. » |
| `ceremony.plan` | cue:armed | ceremony | « Je vous parlerai aux kilomètres qui comptent, et je vous laisserai tranquille entre les deux. » |
| `ceremony.marseillaise` | cue:countdown | ceremony | *(La Marseillaise, enregistrement neuf)* |
| `ceremony.countdown` | cue:countdown | ceremony | « Dix… neuf… huit… » |
| `ceremony.gun` | cue:gun | ceremony | *(corne, clameur, foulées, fondu)* |
| `coach.first400` | distance 400 | coaching | « Laissez-les partir. Les quatre cents premiers mètres ne comptent pas. » |
| `bed.seafront.1` | distance 200 | course | *(bed: mer, mouettes, bois sous les pieds)* |
| `planches.1` | distance 200 | course | « Vous êtes sur les Planches. Six cent quarante-trois mètres de bois, la mer à gauche, et quarante-deux kilomètres devant vous. » |
| `normandy.1` | distance 900 | course | « Le Normandy sur votre droite. Et juste derrière, la rue où Coco Chanel a ouvert sa première boutique en 1913. » |
| `touques.1` | distance 3900 `?` | course | « Vous quittez le front de mer et passez la Touques. La campagne normande vous attend : trouvez votre rythme, il est encore tôt. » |
| `aid.1` | distance 5000 | course | « Ravitaillement. Buvez même sans soif : c'est le cinquième kilomètre qui décide du trentième. » |
| `haras.ep1` | distance 7700 `?` | course | « Saint-Arnoult. Épisode un : ici on élève des pur-sang depuis plus d'un siècle… » |
| `coach.toofast` | pace, after 3000 | coaching | « Vous êtes parti vingt secondes trop vite au kilomètre. Reprenez votre allure, elle vous attend. » |
| `silence.1` | distance 8200 | course | « Je vous laisse courir. Rendez-vous au vingtième. » |
| `tourgeville.1` | distance 11600 `?` | course | « Tourgéville. Villas, bocage, barrières blanches. Le bocage coupe le vent : laissez-le travailler pour vous. » |
| `local.1` | distance 14000 `?` | course | *(voix locale)* « Moi je tiens ce ravitaillement depuis onze ans. Au trentième, je vois les visages changer. » |
| `benerville.1` | distance 17000 `?` | course | « Bénerville. La mer revient sur votre droite — mais ce n'est pas encore pour vous. » |
| `seafront.1` | distance 20000 `?` | course | « Deauville de nouveau. Écoutez : c'est la foule de l'arrivée. Ne la croyez pas. » |
| `half.arch` | distance 21100 | ceremony | « Vous passez devant l'arche d'arrivée. Et vous tournez. Vingt et un kilomètres encore : c'est maintenant que ce marathon se décide. » |
| `half.split` | distance 21097 | personal | « Mi-course, {splitTime}. » |
| `planches.2` | distance 21300 | course | « Les Planches, deuxième fois. Le même bois, pas le même homme. » |
| `strassburger` | distance 25000 `?` | course | « Épisode deux : la villa Strassburger, bâtie pour un Rothschild sur des terres de la famille Flaubert, rachetée par un magnat de la presse américaine venu ici pour les chevaux. » |
| `haras.ep2` | distance 28800 `?` | course | « Les haras, encore. Ce matin vous les avez regardés. Maintenant vous courez comme eux : à l'économie. » |
| `wall.32` | distance 32000 | ceremony | « Trente-deux. Trente-deux kilomètres derrière vous — ceux-là, personne ne vous les reprend. » |
| `tourgeville.2` | distance 32700 `?` | course | « Tourgéville. Dernière fois. Après ça, tout redescend vers la mer. » |
| `sea.returns` | distance 38000 `?` | course | « La Manche est de nouveau là, sur votre gauche. Elle ne vous quitte plus. » |
| `projection` | distance 38000 | personal | « À cette allure, vous franchissez la ligne en {projectedTime}. » |
| `bed.crowd.rise` | distance 38000 | course | *(bed croissant jusqu'à la ligne)* |
| `split` | split 1000 | personal | « Kilomètre {km}. {splitTime}. » |
| `planches.final` | distance 41600 | ceremony | « Vous êtes sur les Planches. Les cabines portent des noms : Simone Signoret. Clint Eastwood. Et aujourd'hui, la vôtre. » |
| `finish.name` | finish | personal | « {firstName} {lastName} ! {chipTime} ! Marathon International in Deauville. Vous êtes arrivé. » |
| `finish.area` | finish | ceremony | *(bed: foule, PA, applaudissements, 40 s)* |
| `finish.medal` | finish | ceremony | « Baissez la tête. Voilà. Elle est à vous. » |
| `finish.callback` | finish | ceremony | « Ce matin je vous disais : quarante-deux kilomètres devant vous. Il n'y en a plus un seul. » |

The half-marathon course reuses rows 1-25 with `half.arch` replaced by the finish block — one
pack, one filter, no second script.

---

## 4. Recommended v1 for race week (November 2026)

Constraints: one founder, ~2 months, App Store review on the critical path (PRD §8), a pipeline
that already renders French MP3 through ElevenLabs and serves a pack from R2. Audio content is
*not* on the critical path — it ships over the air as `version: 2` of the pack — so the code
changes come first and the writing fills the remaining weeks.

### Ship, in this order

1. **Make the ceremony sequenceable** (engine, half a day). Two real defects today:
   `ceremony.countdown` and `ceremony.gun` both trigger on `elapsed: 0`, so they race each other
   *after* the gun instead of leading into it; and nothing can play while `phase === 'idle'`, so
   the whole "before the start" section is unreachable. Add a `cue` trigger
   (`{ kind: 'cue', at: 'armed' | 'countdown' | 'gun' }`) fired explicitly by the store's existing
   `countdown` phase, plus an `order` field so a pocket plays in sequence. Everything depends on it.
2. **Beds** (3 files: start pen, crowd pocket, finish area; ~2 min total). The largest emotional
   return per hour of work in this document. Needs one playback change: a bed loops *under*
   events instead of entering the priority queue.
3. **Number fragments** (X9). Pre-render French numerals once and concatenate. Turns splits from
   caption-only into audio, and unlocks the finish time, the half-way time and the projection.
4. **Per-entrant name files** (A2, F1). One or two short renders per entrant at pack-build time.
   Check the ElevenLabs spend first: concurrency is capped at 2 (MEMORY.md), so a thousand
   entrants is a batch job, not a request handler.
5. **Re-place the landmarks for the double loop** (§3): get the 2026 GPX, add Bénerville, and
   turn nine one-pass landmarks into one loop of eight played twice with different text. Cheap,
   and it is what turns a narrated tour into a race with an arc.
6. **The rewritten pack** (~38 events, §3). French-native voice, escalating arc, honest distance
   language, announced silences. Writing and reviewing time, not code.
7. **The rehearsal run** (A7). A 3-5 km pack with the real ceremony, a week before the window
   opens — also the only realistic way to learn whether the audio works on a hundred strangers'
   phones before it matters.
8. **The race director's line and the Marseillaise** (B4, §3). One phone recording and one choir
   or crowd recording: the two most credible sounds in the product for five minutes of someone's
   time. Ask in the same email as the GPX.
9. **"Moins de voix"** (X1). Three levels, filtering on the `category` already in the schema.
10. **The post-run race report** (G1). Server-side, no offline or latency constraint; reuses the
   TTS tool and lands on the results page beside the certificate.

Items 1-6 are M2/M3; 7-10 fit the M4 polish pass and can slip to the week before race week,
because none of them ships in a store build.

**Ask the organizer this week** for the 2026 GPX, the aid-station positions, clearance to record
or reuse the Marseillaise, the director's voice, and the 2025 results file (which decides whether
D6 is v1 or v1.5). One meeting settles every `?` in §3.

### Leave out of v1

- **LLM or TTS during the run.** Latency, offline, and an unreviewed line in the runner's ears.
  The LLM belongs after the finish (G1), and that is where the old repo's `llm.service.ts`
  capability should resurface.
- **Weather** (A6, D9 live variants). Charming, not load-bearing. The static version of D9
  ("the wind on this stretch") gets 80% of the effect from a file.
- **The ghost runner** (D6) unless the organizer hands over the 2025 results as a clean file in
  October. It is the best personalization idea in the document and the one most likely to eat a
  week on data wrangling; make it a v1.5 item with a hard data deadline.
- **Multiple voices** beyond the announcer plus the director. Local voices (D7) are a 2027 idea.
- **English audio.** English UI and captions in v1; one voice pack, French. A second full pack
  doubles the review burden for an audience that is mostly French.
- **Licensed music.** Beds only. No rights conversation in the two months before a race.
- **Personality presets**, replay-as-podcast (G3), and any second pack variant (X6).

### The one test that matters

Before the pack is final, listen to the whole thing at race pace on a phone, outdoors, with the
runner's own music playing — not in the studio. The failure modes this document is trying to
prevent (too chatty, flat arc, voice arriving in the wrong moment, numbers that sound robotic)
are all inaudible on a desktop and obvious after 40 minutes of running.

---

## 5. Sources

**The race.** Organizer first; anything not corroborated here is marked `?` in §3.
- Official: [site + programme](https://www.marathondeauville.fr/) and its `/marathon`, `/semi-marathon`, `/10km`, `/la-deauvikids` pages · [practical info](https://marathondeauville.fr/blank)
- Press: [2026 preview — field size, course, records](https://stadion-actu.fr/marathon-international-indeauville-tapis-rouge-pour-20-000-coureurs-les-14-et-15-novembre-2026/) · [2024 preview](https://stadion-actu.fr/marathon-international-in-deauville-12-000-coureurs-a-lassaut-des-planches-les-16-et-17-novembre-2024/) · [2026 times, prices, pacers](https://www.jds.fr/trouville-sur-mer/actu/programme-du-marathon-international-de-deauville-2026-epreuves-horaires-et-tarifs-1597090_A) · [profile and cut-off](https://www.marathons.fr/Marathon-de-Deauville)
- Results: [2025 winners](https://dicodusport.fr/blog/resultats-et-classement-marathon-de-deauville-2025/) · [Klikego 2025](https://www.klikego.com/resultats/marathon-international-in-deauville-2025/1544740583497-9)
- Runner reports (the Marseillaise, the boardwalk finish, the criticisms): [runagora](https://www.runagora.fr/57786-recits-avis-marathon-international-in-deauville.html)
- Place: [Les Planches — 643 m, Adda 1923, 450 cabins](https://fr.wikipedia.org/wiki/Les_Planches_(Deauville)) · [Deauville](https://fr.wikipedia.org/wiki/Deauville) · [Villa Strassburger](https://fr.wikipedia.org/wiki/Villa_Strassburger) · [Chanel 1913](https://espritdegabrielle.com/chanel-et-deauville-ville-de-toutes-les-ambitions-et-de-toutes-les-elegances/)
- November weather: [ou-et-quand](https://www.ou-et-quand.net/partir/quand/france/normandie/deauville/mois/novembre/) · [a-contresens](https://planificateur.a-contresens.net/europe/france/normandy/deauville/3021668-novembre.html)

**The craft.**
- Zombies, Run! — Alderman on arcs under 20 min and music as the ad break: [her account](https://naomialderman.com/zombies-run/) · [Den of Geek](https://www.denofgeek.com/games/naomi-alderman-interview-zombies-run-crying-and-music/) · [mechanics](https://zombiesrun.fandom.com/wiki/Player%27s_Guide) · [scale](https://en.wikipedia.org/wiki/Zombies,_Run!)
- Nike Run Club — [talk model](https://www.wareable.com/running/nike-plus-run-club-guide-how-to-use-running-430) · [Bennett on starting slow](https://about.nike.com/en/magazine/coach-chris-bennett-interview) · [Headspace runs](https://www.wareable.com/running/nike-run-club-mindful-runs-headspace-221) · [the critique](https://nutreats.co.za/nike-headspace-guided-mindful-run/)
- Apple Fitness+ Time to Run — [city routes, soundscapes, haptics](https://www.apple.com/newsroom/2022/01/apple-fitness-plus-introduces-collections-and-time-to-run-starting-january-10/) · [one beat per song](https://www.bustle.com/wellness/apple-fitness-time-to-run-review) · [critique](https://www.newsweek.com/apple-fitness-plus-time-run-wonderful-interactive-playlist-1671742)
- Peloton outdoor — [class library](https://www.onepeloton.com/classes/outdoor-workout) · [guide](https://www.champagneandcoffeestains.com/peloton-outdoors-workout-guide/)
- Runna — [cues at lap boundaries only, terrain gate, ducked music, TTS](https://support.runna.com/en/articles/8159780-setting-up-and-managing-your-audio-cues) · [review](https://www.techradar.com/health-fitness/fitness-apps/runna-review)
- [Strava audio announcements](https://support.strava.com/hc/en-us/articles/216917237-Audio-Announcements) · [RunGo: organizer audio at course points](https://www.rungoapp.com/virtual-races)
- Virtual London Marathon — [crowd audio every half mile, practice 5K](https://www.tcs.com/who-we-are/newsroom/press-release/official-virgin-money-london-marathon-app-powered-by-tcs-launched-for-first-ever-combined-mass-and-virtual-event) · [BCS write-up](https://www.bcs.org/articles-opinion-and-research/the-london-marathon-app/)
- [TCS Amsterdam: binaural cheers from real locals](https://www.tcsamsterdammarathon.nl/virtuele-aanmoedigingen-voor-tcs-amsterdam-marathon-lopers) · [Racefully live commentator](https://sociable.co/mobile/social-fitness-app-racefully/)
- The silent incumbents: [The Conqueror](https://hometechhacker.com/the-conqueror-virtual-challenges-review-motivation-medals-and-miles/) · [Yes.Fit](https://yes.fit/) · [Race At Your Pace](https://www.raceatyourpace.com/)
- [What French marathoners hate hearing](https://reference-trail.fr/top-10-des-pires-encouragements-entendus-en-marathon-le-7e-est-impardonnable/)

---

# Part 2 — What is missing today (audit of the code, 2026-09-13)

Written against the code as of session 7: `shared/src/schemas/audio.ts`, `shared/src/domain/audioTriggers.ts`,
`app/src/audio/*`, `app/src/stores/run.ts`, `api/tools/audio/*`, `api/src/routes/audio.ts`.
Effort scale: S = hours, M = a day, L = several days. "JS" = ships over the air, no native build.

## 2.1 The start: can the run start at second X of the audio, in sync with the UI?

**Not today, and the order is even wrong.** The app runs a *visual* countdown (5 s, `run.start()` in
`app/src/stores/run.ts`) with no sound, then calls `startRun()`. Only then does the trigger function see
`phase = 'running'`, so the three ceremony lines (`start`, and the two `elapsed: 0` lines for the countdown
and the gun) all fire together *at the gun*, queue by priority, and the runner hears "Bienvenue…", then
"Dix, neuf, huit…", then "Partez !" while the clock has already been running for 30 seconds. Playback
also has no notion of *where* in a file it is: `player.ts` only listens to `didJustFinish`.

What is needed (all JS, effort **M**):
- A `prestart` phase in the run store between `idle` and `countdown`. Pressing Start plays the ceremony
  *sequence*; the clock starts when the gun file starts, not when a timer ends.
- In the schema: the `cue` trigger proposed in §4 item 1 (`{ kind: 'cue', at: 'armed' | 'countdown' | 'gun', order }`)
  for lines that play before the gun (intro, ambiance, countdown). The gun cue starts the clock. Sync is at file boundaries, which
  is deterministic: intro → countdown → *gun starts playing ⇒ `startRun(now)`*. No need to know
  the offset of a word inside a file.
- The visual countdown is derived from the countdown *file*: the app shows `ceil(remaining)` from the
  player's `duration - currentTime` (expo-audio reports both), so digits and voice agree. The countdown
  line's text is written to last exactly its number of seconds ("dix, neuf, … un" read at one per second;
  ElevenLabs is close enough, and a 10-second file is measured once at render).
- If the offset of the gun inside a single produced file is ever wanted (a real speaker recording with
  music under it), ElevenLabs `…/with-timestamps` returns character alignment, and the studio can store
  `gunAtMs` per line. Not needed for v1.
- Simulation and Playwright need a fast path (skip or ×60 the sequence), as the countdown has today.
- Safety: if the pack is missing or a file fails to load, fall back to the current visual countdown.

## 2.2 LLM-written text: do we have any?

**No.** The script is a hand-written TypeScript fixture; `AUDIO.md` says "written with Claude from the
brief" but that is a manual session, not code. There is no AI binding in `wrangler.jsonc`, no Gateway,
no call to Claude/Gemini/Workers AI anywhere in `shared/`, `api/` or `app/`. The root `.env` has
`GEMINI_API_KEY` and `CLOUDFLARE_AI_TOKEN`; no Anthropic key.

Where an LLM belongs in a *race* product (decision recorded below, section 2.7):
1. **Authoring time, in the studio** (effort **M**): "Proposer un texte" per landmark from the organizer's
   brief, the landmark name, the distance and the arc of the course; "Réécrire plus court / plus chaud";
   English variant from the French. Human reviews, then the voice is rendered. This is where 90 % of the
   value is and it costs nothing at run time.
2. **Per-runner, at pack time** (effort **M**, after the personal pack of 2.3 exists): one or two lines per
   entrant (name, wave, their previous result, the town they run in, the weather there), written once when
   the runner opens *Préparer*, rendered by the same TTS path and cached. Offline during the run.
3. **Live during the run**: not for v1. It needs network, adds latency and a second voice quality, and
   the old product's experience (`llm.service.ts`, personality presets) was a companion for discovery
   runs, not a race. Keep the *idea* of a personality axis (energy, tourism vs performance) as a script
   parameter for (1), not as a runtime feature.

Plumbing to add for (1): a Worker route behind the organizer session that calls the model through
**Cloudflare AI Gateway** (`gateway.ai.cloudflare.com/v1/<account>/sivoov/…`), so caching, logs, rate
limits and provider switching are configuration. Any provider works behind it; the studio only needs
"text in, text out" with a system prompt kept in `api/src/lib/prompts/`.

## 2.3 Personalization: what do we know, what can we say?

Known today: `me.entrant` has `firstName`, `lastName`, `bib`, `distanceKey`, `slotAt`, and an `address`
(the runner's city); the run has `distanceM`, `elapsedMs`, `paceSecPerKm`, splits, and the GPS position.

Said today: **nothing personal is ever heard.** The two template events (`personal.split` with
`{km} {splitTime}`, `coaching.slow` with `{firstName}`) have no files: `usePlayback.ts` only plays
`source.kind === 'file'`, so templates are caption-only. Nothing renders slot values, on device or in
the pipeline. `AUDIO.md` promises "pre-rendered number fragments or on-device TTS", neither exists.

What is missing, in order of value:
- **Name files per entrant** (effort **S** in the studio's render path): one ~1 s MP3 per first name
  (the *name*, not the entrant, so 2 000 entrants ≈ 600 distinct files), rendered at import time and
  served in a per-entrant manifest (`GET /api/me/pack`, bearer auth). The app plays `name.mp3` before
  a line ("Arthur, mi-course !").
- **Number fragments** (effort **M**): km 1…42, minutes 0…59, seconds, "kilomètre", "minutes",
  "secondes", pace forms. ~150 files, rendered once per voice. The player needs a *sequence* item
  (play N files back to back) — the same mechanism the prestart sequence of 2.1 needs, so build it once.
  Gaps between fragments with one `AudioPlayer` per file are ~100 ms on Android, fine for numbers.
- **On-device TTS** (`expo-speech`) as a fallback is a **native module** (new build, ARCHITECTURE.md
  decision). Android French voices are serviceable but sound nothing like George; keep it out of v1.
- **Weather and place** (effort **S** server-side, once the personal pack exists): the app knows the
  position at *Préparer*. `GOOGLE_MAPS_API_KEY` exists and Google Maps Platform has a Weather API
  (current conditions and daily forecast) and reverse geocoding; Open-Meteo does weather with no key.
  Write one line ("Il fait 9 degrés à Lyon, vent de face sur le retour, prenez un coupe-vent") and one
  about Deauville itself on race day ("À Deauville, la mer est grise et il fait 11 degrés"). Rendered at
  prepare time, so the run stays offline.
- **Previous results / ghost pace**: PRD wants it "if results exist". Requires the organizer's past
  results CSV; no table for it yet. Leave for after the first race.

## 2.4 The old `AUDIO_CONFIG.md`: what to keep

| Old feature | Verdict | Why |
|---|---|---|
| `llm` content type at run time | Keep the *concept* at authoring time and pack time (2.2) | Race audio must be offline, reviewed and one voice |
| `waypoint` trigger (lat, lng, radius) | Drop | The studio projects a map click onto the course; the stored trigger is `distance`. A radius on the *real* course means nothing for a runner in Lyon |
| `periodic` (minutes) | **Add** as `{ kind: 'interval', everySeconds, offsetSeconds }` (effort **S**) | Hydration and "how are you doing" reminders are time-based, not distance-based; `elapsed` today is one-shot |
| `periodic_distance` | Exists (`split`) | |
| `time` | Exists (`elapsed`) | |
| Mix `pause`/`lower`/`interrupt`/`overlay` | Have `wait`/`duck`/`interrupt`; drop `overlay` | Voice over voice is never right |
| `audio_defaults` (voice, speed, model) | Exists as `script.voice`; add `speed`/`style` per line | |
| Local file upload per event (organizer's own MP3) | **Add** to the studio (effort **S**) | The real speaker's voice, the organizer's jingle, crowd ambiance: files, not TTS |
| YAML config + `config:upload` | Replaced by the studio and D1 draft | |
| Personality presets | Keep as an authoring prompt parameter only | |

## 2.5 Polish: download ahead, API, providers, caching, levels

- **Download ahead of time**: partly there. `packStore.load()` downloads every file to the cache dir
  once per (course, version), but it is only called from the *run* screen (`useAudioPack` in
  `run.tsx`), so the download starts when the runner is already on the start line. Missing (effort **S**):
  call it from the race home and *Préparer*, show "Pack audio prêt · 1,9 Mo" or a progress bar in the
  pre-flight (it already has four checks; this is the fifth), verify `sha256` (only `bytes` is compared),
  and delete older versions.
- **API that exposes audio**: exists and is sane — `GET /api/courses/:id/pack` (manifest, 5 min cache)
  and `GET /api/packs/:course/:version/:key` (immutable, one year). Missing: `?locale=en`, `Range`
  requests passed to R2 (`FILES.get(key, { range })`) for seeking, an `ETag`/`If-None-Match` on the
  manifest, and the authenticated per-entrant manifest of 2.3. The public pack carries titles and file
  keys only; the script text stays private (the studio slice keeps it that way).
- **Several TTS providers**: `tts.ts` is ElevenLabs-only, both in the CLI and in the studio. The voice
  object is `{ id, name, model }`; adding `provider: 'elevenlabs' | 'google' | 'openai'` and a
  `render(voice, text)` switch is **S**, and the cache key already includes the voice id and model, so
  files never collide. Google TTS (`GOOGLE_TTS_API_KEY` in `.env`) is the obvious cheap second voice
  for English and for the number fragments.
- **LLM caching**: none, because there is no LLM. When 2.2 lands, put every call behind AI Gateway
  with `cf-aig-cache-ttl` and a stable prompt id; the studio's "Proposer" button is then idempotent
  per (landmark, brief version).
- **Audio levels**: nothing normalizes loudness. ElevenLabs files vary by a few dB between lines and
  a lot against music or crowd beds. The Worker cannot run ffmpeg, so: (a) the CLI path normalizes with
  `ffmpeg loudnorm` (EBU R128, −16 LUFS, true peak −1.5 dB) when it runs on a laptop, (b) the manifest
  gets an optional `gain` per file that the app applies with `player.volume`, (c) any music or ambiance
  bed is mixed and normalized offline once and uploaded as a file (2.4). R2 stores whatever it is
  given; the level is fixed before upload, not by R2.
- **Ducking** works on Android (`interruptionMode: 'duckOthers'`, heard on the S23). iOS untested (no
  iOS build). Interruptions by a phone call: `afterPause()` drops the backlog except `finish` — right.
- **"Less talk"**: categories exist on every event and the run trace logs firings, but there is no
  settings screen and `nextEvents` has no category filter. Effort **S** once a settings screen exists
  (the TODO list wants one for the language anyway).
- **Caption on the run screen**: exists (`nowPlaying` → "🔊 title"). Good enough.

## 2.6 Missing pieces, ranked for the next two months

| # | Gap | Effort | Value | Where |
|---|---|---|---|---|
| 1 | **Done (session 9).** Prestart sequence: intro → countdown in sync with the digits → gun starts the clock (2.1) | M | The first 30 seconds are the product's first impression | shared schema, run store, player, script |
| 2 | Studio: GPX per course, events on the map, listen, render, publish (this session) | L | Content stops needing a laptop | api |
| 3 | **Done (session 9).** Pack download at home/prepare with a visible "ready" state (2.5) | S | A run with no audio is a refund | app |
| 4 | **Done (session 9).** Sequence playback (N files back to back) — shared by 1 and 5 | S | | app player |
| 5 | Number fragments for km splits; name files per entrant; `/api/me/pack` (2.3) | M | "Kilomètre 21, une heure cinquante-deux" is the line runners remember | pipeline, api, app |
| 6 | `interval` trigger and file upload per line in the studio (2.4) | S | Hydration reminders, the organizer's own jingle | shared, api |
| 7 | "Proposer un texte" in the studio through AI Gateway (2.2) | M | Speeds authoring of 40+ landmark lines and the English pack | api |
| 8 | Personal prepare-time lines: weather, place, wave (2.2, 2.3) | M | The "how did it know" moment | api, app |
| 9 | Second TTS provider, loudness `gain`, `Range` on the audio route (2.5) | S each | Polish | api, app |
| 10 | Settings screen with "moins de paroles" and language (2.5) | S | Long-run comfort | app |

Not before the first race: live LLM lines, on-device TTS, ghost pace from past results.

## 2.7 Decisions proposed (recorded in STATUS.md when accepted)
- Race audio is pre-rendered and offline. LLMs write at authoring time and at prepare time, never live.
- Map-placed events are stored as distance along the course; no waypoint/radius trigger.
- The clock starts when the gun file starts playing; everything before it is a `cue`, sequenced by file boundaries.
- One voice per race (George for Deauville), a second provider only for cost or English.
