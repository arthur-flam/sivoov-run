/**
 * The sounds a production is made of, other than the voice: crowds and places from the BBC
 * Sound Effects archive (RemArc licence: fine for a draft, to license before selling), and
 * music composed for the race with Google's Lyria. Downloaded once into `api/.produce/sources/`.
 *
 * Lyria is not repeatable (the same prompt gives another piece), and the recipes are cut to
 * the exact second of the pieces we kept (the drop at 45.0 s of `start`), so the kept files
 * live in R2 (`produce-sources/`, production bucket) and are fetched from there; `sha256`
 * says they are the same files. `prompt` is how they were made, to make new ones.
 */
export type Source =
  | { kind: 'url'; url: string; credit: string }
  | { kind: 'r2'; key: string; sha256: string; credit: string; prompt: string };

const bbc = (id: string, what: string): Source => ({
  kind: 'url',
  url: `https://sound-effects-media.bbcrewind.co.uk/mp3/${id}.mp3`,
  credit: `BBC Sound Effects ${id}: ${what}`,
});

const lyria = (name: string, sha256: string, prompt: string): Source => ({
  kind: 'r2',
  key: `produce-sources/lyria-${name}.mp3`,
  sha256,
  credit: 'Composed with Google Lyria 3 (lyria-3-pro-preview), 2026-09-27',
  prompt,
});

export const SOURCES = {
  // Crowds and races.
  'london-start': bbc('07043081', 'London Marathon, atmosphere near start'),
  'london-cheers': bbc('07043082', 'London Marathon, cheers & applause'),
  'crowd-long': bbc('07035075', 'Large crowd cheering continuously'),
  'crowd-burst': bbc('07035073', 'Large crowd cheering'),
  'crowd-burst-2': bbc('07035074', 'Large crowd cheering'),
  'crowd-whistles': bbc('07038112', 'Athletics meeting, cheers, shouts, whistles'),
  'crowd-build': bbc('07057040', 'Build up of cheering and whistling'),
  'french-crowd': bbc('07039027', 'French crowd, mixed, cheerful'),
  'applause': bbc('07043048', 'Continuous cheering & applause'),
  // Signals.
  'air-horn': bbc('07058150', 'Air horn, long blast'),
  'air-horn-short': bbc('07058151', 'Air horn, 5 short blasts'),
  drums: bbc('07011247', 'Tattoo on drums'),
  // Paris.
  pigeons: bbc('07037493', 'Pigeons cooing'),
  fountain: bbc('07012133', 'Large fountain'),
  'church-bells': bbc('07049100', 'St. Gervais church bells, Sunday morning, Paris'),
  // Music composed for the race.
  'lyria-village': lyria(
    'village',
    'f50cffde41d5c0fe',
    'Instrumental, about 2 minutes, no vocals. The warm-up DJ set in the start village of a 10 km race on the Champs-Élysées on a winter Sunday morning. French touch filtered house in the spirit of late-90s Paris, 118 bpm, groovy bass, filtered disco chords, handclaps, warm and happy but not climactic, steady energy all the way, no big drops, loop-friendly.',
  ),
  'lyria-start': lyria(
    'start',
    'f333197ecc2cb0e5',
    'Instrumental track, 40 seconds: a race-start anthem for 20,000 runners on the Champs-Élysées in Paris. Starts with a tense ticking pulse and low strings, builds with French-touch filtered house synths and a big kick at 124 bpm, then a euphoric drop with brass stabs. No vocals.',
  ),
  'lyria-descent': lyria(
    'descent',
    '5632f0c4736b90bb',
    'Instrumental, about 90 seconds, no vocals. Euphoric soundtrack for thousands of runners turning under the Arc de Triomphe and flying back down the Champs-Élysées. Opens immediately at full energy: soaring strings, bright brass, driving electronic drums at 160 bpm, a feeling of freedom and speed, cinematic sports broadcast anthem, French elegance, stays high until a gentle fade at the end.',
  ),
  'lyria-golden': lyria(
    'golden',
    '28ac946ebb8116b2',
    'Instrumental, about 3 minutes, no vocals. The last kilometre of a race in Paris. Starts quiet and tense: a low heartbeat kick and a ticking pulse. Builds relentlessly and slowly minute after minute, adding strings, choir pads, big drums, each section more intense, reaching a huge triumphant climax at the very end. Epic sports cinematic trailer style, 128 bpm.',
  ),
  'lyria-finish': lyria(
    'finish',
    'cb44bea9e12fd013',
    'Instrumental, about 45 seconds, no vocals. Triumphant finish-line fanfare for runners crossing the line on the Champs-Élysées: bright French horns and trumpets, timpani, cymbal swell, a joyful orchestral theme with a modern beat underneath, ending on a big held chord that rings out.',
  ),
} satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;
