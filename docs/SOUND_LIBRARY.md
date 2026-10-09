# Sound library

Every sound we generate, download or record is kept in one place, with how it was made and what
people thought of it. A pack is then assembled from scored sounds, not from whatever a
production run happened to fetch. Written 2026-10-09 (proposal, not built). The brief it serves
is `PRODUCTION.md`.

## Why

- The 10K draft's crowds came from the BBC archive. Many were poor (old tapes, wrong crowd, wrong
  country) and nothing recorded that, so the next session would have tried them again.
- Lyria music cannot be regenerated: the same prompt gives another piece. Today the kept pieces
  sit in R2 with their prompt in `api/tools/produce/sources.ts`. That works for five files, not
  for hundreds of voice takes, cheers and stings.
- People's ears are the judge (`PRODUCTION.md`). Their verdicts must be stored next to the sound
  and reused, not lost in a chat.

## What is kept

**Asset**: one file, identified by its content hash.
- `id` (sha256), `kind`: `voice` | `sfx` | `music` | `ambiance` | `recording` | `mix`.
- File: R2 key (`library/<sha256>.<ext>`), format, bytes, duration, integrated loudness (LUFS),
  peak.
- **Origin**, one of:
  - generated: provider, model, voice, prompt or text, direction, parameters, seed when there
    is one, date, who asked (session or person);
  - archive: source, URL, credit, licence;
  - recorded: who, where, when, device;
  - mix: the parent assets and the recipe (`api/tools/produce/mix.ts` steps), so it can be remade.
- **Licence status**: `draft-only` (BBC RemArc, unclear terms), `cleared` (bought or
  confirmed), `ours` (recorded by us, generated under terms that allow commercial use).
- Tags: place (`concorde`, `champs-climb`, `finish`…), mood, intensity 1-5, crowd size,
  language, voice (speaker / close / crowd).
- Status: `candidate` → `approved` | `rejected`; `retired` when replaced.

**Review**: one person's verdict on one asset.
- Reviewer (a signed-in staff or organizer account), date.
- Score 1-5 and a verdict: keep / cut / maybe.
- A short note ("too 1970s", "the crowd is English", "perfect under the climb").
- **Context**: alone, under a voice, or in a full-run render at a given km and pace. A crowd can
  be fine alone and wrong under the speaker; the context is part of the score.

**Use**: which race, course, line and pack version an asset went into.

**Automatic metrics** sit beside the reviews but never replace them:
- duration against the text (`plausibleSeconds`);
- loudness;
- for voice, optionally a Gemini transcription and its match to the text.

## The listening page

An admin page, « Sonothèque » (`/org/library`), built so a person can score fifty sounds in ten
minutes on a phone:
- a queue: candidates with no review from this person, filtered by race, kind, place or tag;
- play, then one tap for 1-5, an optional note, next. Keyboard on a laptop: space, 1-5, n;
- **A/B for one slot**: the candidates for one place in the script, side by side, ideally
  played under the line they will sit under;
- the full-run renders appear here too, with a timestamped note field, so the owner's notes on
  a 50-minute listen land on the moments they are about.

The owner, the owner's family and friends, and the race director can all score. Their scores
are kept apart (filter by reviewer), so the owner's ear can decide.

## How the tools use it

- `npm run produce` stops downloading from a source list. It **adds** to the library:
  - every new generation is stored with its origin, as a `candidate`;
  - packs are built only from `approved` assets, or from what the script names explicitly.
- The studio shows, for each line, the asset it uses and its scores, and offers the other
  approved assets with the same tags.
- A Claude Code session can query the library (the admin JSON, or D1 locally) to find what is
  approved, what was rejected and why, and what is missing. It does not regenerate what was
  already tried and cut.
- The BBC files used in the 10K draft are imported once as `candidate`, `draft-only`, so they
  get scored like everything else rather than silently reused.

## Storage

D1 tables `library_assets`, `library_reviews` and `library_uses` (a new migration), and files
in the existing `FILES` R2 bucket under `library/`. One library for all races: a good Paris
crowd serves every Paris race. Zod schemas in `shared/` as usual.
Production holds the real library. Local and preview start from a small seed.

## Not now

- Automatic taste scoring by a model. A model that listens can catch faults; deciding what
  sounds good is the people's job here.
- Public sharing of library sounds, or organizer uploads straight into the library. The
  studio's « Votre fichier » stays the organizer's path; those files could be imported later.
