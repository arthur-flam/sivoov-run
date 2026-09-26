/**
 * Numbers and times the way a French race speaker says them, in words, so the voice never
 * has to guess how to read "1247" or "3:46:19". Written out here rather than left to the TTS
 * because one misread number discredits every other line in the pack (AUDIO_EXPERIENCE.md).
 * Traditional spelling ("vingt et un", "quatre-vingts"); the voice only hears the sounds.
 */

const UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/** 0-99. */
const belowHundred = (n: number): string => {
  if (n < 20) return UNITS[n]!;
  if (n < 70) {
    const unit = n % 10;
    const tens = TENS[Math.floor(n / 10)]!;
    return unit === 0 ? tens : unit === 1 ? `${tens} et un` : `${tens}-${UNITS[unit]}`;
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${UNITS[n - 60]}`;
  return n === 80 ? 'quatre-vingts' : `quatre-vingt-${UNITS[n - 80]}`;
};

/** 0-999. `final`: nothing follows, so "deux cents" and "quatre-vingts" take their s. */
const belowThousand = (n: number, final: boolean): string => {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const tail = rest === 0 ? '' : belowHundred(rest);
  const restWords = !final && rest === 80 ? 'quatre-vingt' : tail;
  if (hundreds === 0) return restWords;
  const head = hundreds === 1 ? 'cent' : `${UNITS[hundreds]} cent${rest === 0 && final ? 's' : ''}`;
  return rest === 0 ? head : `${head} ${restWords}`;
};

/**
 * A whole number in French words, 0 to 999 999 999. `feminine` for "une heure", "vingt et une
 * minutes". Anything else (negative, fractional, too large) comes back as digits.
 */
export const frenchNumber = (n: number, opts: { feminine?: boolean } = {}): string => {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) return String(n);
  if (n === 0) return 'zéro';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const words = [
    millions === 0 ? '' : `${millions === 1 ? 'un' : belowThousand(millions, true)} million${millions > 1 ? 's' : ''}`,
    thousands === 0 ? '' : thousands === 1 ? 'mille' : `${belowThousand(thousands, false)} mille`,
    rest === 0 ? '' : belowThousand(rest, true),
  ]
    .filter((w) => w.length > 0)
    .join(' ');
  return opts.feminine ? words.replace(/(^|[\s-])un$/, '$1une') : words;
};

/** "une heure", "deux heures", "zéro minute": the number agreeing with its unit. */
const counted = (n: number, unit: string, feminine: boolean): string => `${frenchNumber(n, { feminine })} ${unit}${n > 1 ? 's' : ''}`;

const parts = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
};

/**
 * A time the way a speaker calls it on the course: "une heure cinquante-deux", "trois heures",
 * "cinq minutes vingt-huit", "quarante secondes". Seconds are dropped past the hour.
 */
export const spokenClock = (seconds: number): string => {
  const { h, m, s } = parts(seconds);
  if (h > 0) return m === 0 ? counted(h, 'heure', true) : `${counted(h, 'heure', true)} ${frenchNumber(m, { feminine: true })}`;
  if (m > 0) return s === 0 ? counted(m, 'minute', true) : `${counted(m, 'minute', true)} ${frenchNumber(s, { feminine: true })}`;
  return counted(s, 'seconde', true);
};

/** The official time, every unit said: "trois heures, quarante-six minutes et dix-neuf secondes". */
export const spokenDuration = (seconds: number): string => {
  const { h, m, s } = parts(seconds);
  const said = [h > 0 ? counted(h, 'heure', true) : '', m > 0 ? counted(m, 'minute', true) : '', s > 0 || (h === 0 && m === 0) ? counted(s, 'seconde', true) : ''].filter(
    (p) => p.length > 0,
  );
  return said.length === 1 ? said[0]! : `${said.slice(0, -1).join(', ')} et ${said[said.length - 1]}`;
};

/** "cinq minutes trente au kilomètre". */
export const spokenPace = (secPerKm: number): string => `${spokenClock(secPerKm)} au kilomètre`;

/** A bib as the speaker calls it: numbers in words, anything else as written ("A12"). */
export const spokenBib = (bib: string): string => (/^\d{1,9}$/.test(bib.trim()) ? frenchNumber(Number(bib.trim())) : bib.trim());
