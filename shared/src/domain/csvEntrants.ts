import type { z } from 'zod';
import { EntrantSchema } from '../schemas/entrant';
import type { Entrant } from '../schemas/entrant';
import { DISTANCE_METERS } from '../schemas/race';
import type { DistanceKey } from '../schemas/race';
import { addressFromParts, foldText } from './address';
import type { AddressPart } from './address';

/**
 * The organizer's runner list, as their ticketing tool or Excel writes it. Tolerant on form
 * (encoding, separator, header names, distance labels, a title row above the headers), strict on
 * content: every line it cannot use comes back with its number and the reason, never a guess.
 */

/** One line of the organizer's file, validated with the entrant rules. */
export const CsvEntrantSchema = EntrantSchema.pick({ bib: true, email: true, firstName: true, lastName: true, distanceKey: true, address: true });
export type CsvEntrant = z.infer<typeof CsvEntrantSchema>;

export type RequiredColumn = 'bib' | 'email' | 'firstName' | 'lastName' | 'distanceKey';
export type CsvColumn = RequiredColumn | AddressPart;

export type CsvRejectReason = 'missing_columns' | 'bad_distance' | 'distance_not_offered' | 'bad_email' | 'missing_field' | 'duplicate_bib' | 'column_count';
/** `detail`: the missing columns, the value that is wrong, or for a duplicate the line where the bib first appears. */
export type CsvRejection = { line: number; reason: CsvRejectReason; detail?: string; bib?: string };
/** A line that is imported, but not entirely: the runner comes in without an address. */
export type CsvWarning = { line: number; reason: 'incomplete_address' | 'unknown_country'; detail: string; bib: string };
export type CsvDelimiter = ',' | ';' | '\t';
export type CsvHeader = { header: string; column: CsvColumn | null };
export type CsvParseResult = { entrants: CsvEntrant[]; rejected: CsvRejection[]; warnings: CsvWarning[]; delimiter: CsvDelimiter; headers: CsvHeader[] };
/** `distances`: the race's own distances. A line for another one is refused rather than imported with no course. */
export type CsvParseOptions = { distances?: readonly DistanceKey[] };

export const REQUIRED_COLUMNS: readonly RequiredColumn[] = ['bib', 'email', 'firstName', 'lastName', 'distanceKey'];

/** Header names, French and English, compared folded: lowercase, no accents, punctuation as spaces. */
const HEADERS: Record<CsvColumn, readonly string[]> = {
  bib: ['dossard', 'n dossard', 'no dossard', 'num dossard', 'numero dossard', 'numero de dossard', 'bib', 'bib number'],
  email: ['email', 'e mail', 'mail', 'courriel', 'adresse email', 'adresse e mail', 'adresse mail', 'email address', 'e mail address'],
  firstName: ['prenom', 'first name', 'firstname', 'given name'],
  lastName: ['nom', 'nom de famille', 'last name', 'lastname', 'surname', 'family name'],
  distanceKey: ['distance', 'course', 'epreuve', 'parcours', 'race', 'distance key'],
  line1: ['adresse', 'adresse postale', 'adresse 1', 'adresse ligne 1', 'rue', 'address', 'address 1', 'address line 1', 'street', 'line1'],
  line2: ['complement', 'complement d adresse', 'complement adresse', 'adresse 2', 'adresse ligne 2', 'address 2', 'address line 2', 'line2'],
  postalCode: ['code postal', 'cp', 'postal code', 'postalcode', 'zip', 'zip code', 'postcode'],
  city: ['ville', 'commune', 'city', 'town'],
  country: ['pays', 'country'],
};

/**
 * Names that only say "a number" or "a name": a registration export often starts with a "N°"
 * line number, and "Name" can be the full name. They count only when no column has one of the
 * names above for the same thing, wherever it stands in the file.
 */
const GENERIC_HEADERS: Partial<Record<CsvColumn, readonly string[]>> = {
  bib: ['numero', 'n', 'no', 'num', 'number'],
  lastName: ['name'],
};

const COLUMNS = Object.keys(HEADERS) as CsvColumn[];

type HeaderMatch = { column: CsvColumn; generic: boolean };

const matchHeader = (header: string): HeaderMatch | null => {
  const folded = foldText(header);
  const named = COLUMNS.find((col) => HEADERS[col].includes(folded));
  if (named) return { column: named, generic: false };
  const generic = COLUMNS.find((col) => GENERIC_HEADERS[col]?.includes(folded));
  return generic ? { column: generic, generic: true } : null;
};

export const columnForHeader = (header: string): CsvColumn | null => matchHeader(header)?.column ?? null;

/** How far a written distance may be from the real one: "42 km" is the marathon, "20 km" is not. */
const TOLERANCE = 0.01;
const KEYS = Object.keys(DISTANCE_METERS) as DistanceKey[];

const keyForMeters = (meters: number): DistanceKey | null => KEYS.find((k) => Math.abs(meters - DISTANCE_METERS[k]) <= DISTANCE_METERS[k] * TOLERANCE) ?? null;

/** Every number in the label, in meters: "42,195 km", "21.1", "10 000 m", "10K", "21097". */
const metersIn = (folded: string): number[] =>
  [...folded.replace(/(\d) (?=\d{3}(?!\d))/g, '$1').matchAll(/(\d+(?:[.,]\d+)?) ?(kilometres?|kms?|k|metres?|m)?(?![a-z])/g)].map(([, n = '', unit]) => {
    const value = Number(n.replace(',', '.'));
    if (unit?.startsWith('m')) return value;
    return unit || value < 1000 ? value * 1000 : value;
  });

/**
 * "Marathon", "Semi", "Semi-marathon", "1/2 marathon", "21 km", "42,195 km", "10 km", "10K", "5000 m"...
 * A number that is a known distance wins, then the words. Null when neither says.
 */
export const distanceKeyFromLabel = (label: string): DistanceKey | null => {
  const folded = foldText(label.replace(/(\d)[.,](\d)/g, '$1d$2')).replace(/(\d)d(\d)/g, '$1.$2');
  if (/\b1 2 marathon\b/.test(folded)) return 'half';
  const byNumber = metersIn(folded).map(keyForMeters).find((k) => k !== null);
  if (byNumber) return byNumber;
  if (/\b(semi|half|demi)/.test(folded)) return 'half';
  if (/marathon/.test(folded)) return 'marathon';
  return null;
};

/** Splits one line, honouring double quotes and doubled quotes inside them. */
export const splitCsvLine = (line: string, delimiter: string): string[] => {
  const { fields, current } = [...line].reduce(
    (acc, ch, i) => {
      if (ch === '"') {
        if (acc.quoted && line[i + 1] === '"') return acc.skip ? { ...acc, skip: false } : { ...acc, current: acc.current + '"', skip: true };
        return acc.skip ? { ...acc, skip: false } : { ...acc, quoted: !acc.quoted };
      }
      if (acc.skip) return { ...acc, skip: false };
      if (ch === delimiter && !acc.quoted) return { ...acc, fields: [...acc.fields, acc.current], current: '' };
      return { ...acc, current: acc.current + ch };
    },
    { fields: [] as string[], current: '', quoted: false, skip: false },
  );
  return [...fields, current].map((f) => f.trim());
};

/** The separator that splits the header into the most fields: semicolon (French Excel), tab (pasted cells) or comma. */
export const detectDelimiter = (headerLine: string): CsvDelimiter =>
  ([';', '\t', ','] as const).reduce<CsvDelimiter>((best, d) => (splitCsvLine(headerLine, d).length > splitCsvLine(headerLine, best).length ? d : best), ',');

const BOM = String.fromCharCode(0xfeff);
/** A title row or two above the headers is common in exports: look this far for the real header line. */
const HEADER_SEARCH = 10;

type Line = { number: number; text: string };
type Header = { line: Line; delimiter: CsvDelimiter; columns: Array<CsvColumn | null>; cells: string[] };

/** Each column is read from one cell: the first with a specific name for it, else the first with a generic one. */
const readHeader = (line: Line): Header => {
  const delimiter = detectDelimiter(line.text);
  const cells = splitCsvLine(line.text, delimiter);
  const matches = cells.map(matchHeader);
  const chosen = (col: CsvColumn): number => {
    const named = matches.findIndex((m) => m?.column === col && !m.generic);
    return named !== -1 ? named : matches.findIndex((m) => m?.column === col);
  };
  return { line, delimiter, cells, columns: matches.map((m, i) => (m && chosen(m.column) === i ? m.column : null)) };
};

const missingColumns = (h: Header): RequiredColumn[] => REQUIRED_COLUMNS.filter((col) => !h.columns.includes(col));

type Parsed = { line: number; entrant?: CsvEntrant; rejection?: CsvRejection; warning?: CsvWarning };

const EmailSchema = EntrantSchema.shape.email;

const parseLine = (h: Header, line: Line, options: CsvParseOptions): Parsed => {
  const number = line.number;
  const fields = splitCsvLine(line.text, h.delimiter);
  const lastRequired = Math.max(...REQUIRED_COLUMNS.map((col) => h.columns.indexOf(col)));
  if (fields.length <= lastRequired) return { line: number, rejection: { line: number, reason: 'column_count' } };
  const raw = Object.fromEntries(COLUMNS.map((col) => [col, h.columns.includes(col) ? (fields[h.columns.indexOf(col)] ?? '') : ''])) as Record<CsvColumn, string>;
  const bib = raw.bib === '' ? {} : { bib: raw.bib };
  const reject = (reason: CsvRejectReason, detail?: string): Parsed => ({ line: number, rejection: { line: number, reason, ...(detail !== undefined ? { detail } : {}), ...bib } });

  const empty = REQUIRED_COLUMNS.filter((col) => raw[col] === '');
  if (empty.length > 0) return reject('missing_field', empty.join(', '));
  const distanceKey = distanceKeyFromLabel(raw.distanceKey);
  if (!distanceKey) return reject('bad_distance', raw.distanceKey);
  if (options.distances && options.distances.length > 0 && !options.distances.includes(distanceKey)) return reject('distance_not_offered', raw.distanceKey);
  if (!EmailSchema.safeParse(raw.email).success) return reject('bad_email', raw.email);

  const address = addressFromParts(raw);
  const warning: CsvWarning | undefined =
    address.missing.length > 0
      ? { line: number, reason: 'incomplete_address', detail: address.missing.join(', '), bib: raw.bib }
      : address.badCountry !== undefined
        ? { line: number, reason: 'unknown_country', detail: address.badCountry, bib: raw.bib }
        : undefined;
  const entrant = CsvEntrantSchema.safeParse({ bib: raw.bib, email: raw.email, firstName: raw.firstName, lastName: raw.lastName, distanceKey, ...(address.address ? { address: address.address } : {}) });
  if (!entrant.success) return reject('missing_field', entrant.error.issues.map((issue) => String(issue.path[0])).join(', '));
  return { line: number, entrant: entrant.data, ...(warning ? { warning } : {}) };
};

/**
 * The second line with a bib already seen is refused, pointing at the first. One pass over the
 * lines: a file of 20 000 runners is read twice (preview, then confirmation) within the Worker's CPU limit.
 */
const refuseDuplicates = (parsed: Parsed[]): Parsed[] => {
  // Built from the end, so each bib is left with the line where it first appears.
  const firstLine = new Map(parsed.flatMap((p) => (p.entrant ? [[p.entrant.bib, p.line] as const] : [])).reverse());
  return parsed.map((p) => {
    if (!p.entrant) return p;
    const first = firstLine.get(p.entrant.bib) ?? p.line;
    return first === p.line ? p : { line: p.line, rejection: { line: p.line, reason: 'duplicate_bib', detail: String(first), bib: p.entrant.bib } };
  });
};

/**
 * Parses the organizer's runner list. Never throws: every line it cannot import is reported with
 * its 1-based line number, and lines imported without their address come back as warnings.
 */
export const parseEntrantsCsv = (text: string, options: CsvParseOptions = {}): CsvParseResult => {
  const lines: Line[] = text
    .replace(new RegExp(`^${BOM}`), '')
    .split(/\r\n|\n|\r/)
    .map((t, i) => ({ number: i + 1, text: t }));
  const filled = lines.filter((l) => l.text.replace(/[,;\t"]/g, '').trim() !== '');
  const candidates = filled.slice(0, HEADER_SEARCH).map(readHeader);
  const header = candidates.find((h) => missingColumns(h).length === 0) ?? candidates[0];
  const headers = header ? header.cells.map((cell, i) => ({ header: cell, column: header.columns[i] ?? null })) : [];
  const missing = header ? missingColumns(header) : REQUIRED_COLUMNS;
  if (!header || missing.length > 0) {
    return { entrants: [], rejected: [{ line: header?.line.number ?? 1, reason: 'missing_columns', detail: missing.join(', ') }], warnings: [], delimiter: header?.delimiter ?? ',', headers };
  }
  const parsed = refuseDuplicates(filled.filter((l) => l.number > header.line.number).map((l) => parseLine(header, l, options)));
  return {
    entrants: parsed.flatMap((p) => (p.entrant ? [p.entrant] : [])),
    rejected: parsed.flatMap((p) => (p.rejection ? [p.rejection] : [])),
    warnings: parsed.flatMap((p) => (p.warning && p.entrant ? [p.warning] : [])),
    delimiter: header.delimiter,
    headers,
  };
};

/** What sending a file would do to one runner: a new bib, a change to an existing one, or nothing. */
export type ImportChange = 'new' | 'updated' | 'same';
export type PlannedEntrant = { entrant: CsvEntrant; change: ImportChange };

const sameAddress = (a: Entrant['address'], b: Entrant['address']): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Compares the file with the runners already there, on the bib. A file without an address
 * keeps the one already stored, so that alone is not a change.
 */
export const planImport = (existing: ReadonlyArray<Pick<Entrant, 'bib' | 'email' | 'firstName' | 'lastName' | 'distanceKey' | 'address'>>, incoming: readonly CsvEntrant[]): PlannedEntrant[] => {
  const byBib = new Map(existing.map((e) => [e.bib, e]));
  return incoming.map((entrant) => {
    const before = byBib.get(entrant.bib);
    if (!before) return { entrant, change: 'new' };
    const same =
      before.email === entrant.email &&
      before.firstName === entrant.firstName &&
      before.lastName === entrant.lastName &&
      before.distanceKey === entrant.distanceKey &&
      (entrant.address === undefined || sameAddress(before.address, entrant.address));
    return { entrant, change: same ? 'same' : 'updated' };
  });
};

export type DecodedFile = { ok: true; text: string; encoding: 'utf-8' | 'utf-16' | 'windows-1252' } | { ok: false; reason: 'empty' | 'spreadsheet' };

const startsWith = (bytes: Uint8Array, prefix: readonly number[]): boolean => prefix.every((b, i) => bytes[i] === b);

/**
 * The bytes of an uploaded file -> text. UTF-8 (with or without a BOM), UTF-16 (Excel's
 * "Unicode text"), and anything that is not valid UTF-8 is read as Windows-1252, which is what
 * Excel on Windows writes for "CSV (séparateur : point-virgule)". An .xlsx or .xls workbook
 * is recognised so the page can say how to save it as CSV instead of showing garbage.
 */
export const decodeSpreadsheet = (bytes: Uint8Array): DecodedFile => {
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return { ok: false, reason: 'spreadsheet' };
  if (startsWith(bytes, [0xff, 0xfe])) return { ok: true, text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16' };
  if (startsWith(bytes, [0xfe, 0xff])) return { ok: true, text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16' };
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { ok: true, text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
};

const escapeCsv = (value: string | number | null | undefined, delimiter: string): string => {
  const s = value === null || value === undefined ? '' : String(value);
  return /["\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Rows to CSV text with a BOM so that Excel opens it as UTF-8. Semicolons by default: French spreadsheets. */
export const toCsv = (rows: Array<Array<string | number | null | undefined>>, delimiter: ',' | ';' = ';'): string =>
  BOM + rows.map((row) => row.map((v) => escapeCsv(v, delimiter)).join(delimiter)).join('\r\n') + '\r\n';
