import type { z } from 'zod';
import { EntrantSchema } from '../schemas/entrant';
import type { DistanceKey } from '../schemas/race';

/** One line of the organizer's CSV, validated with the entrant rules. */
export const CsvEntrantSchema = EntrantSchema.pick({ bib: true, email: true, firstName: true, lastName: true, distanceKey: true });
export type CsvEntrant = z.infer<typeof CsvEntrantSchema>;

export type CsvRejection = { line: number; reason: CsvRejectReason; detail?: string };
export type CsvRejectReason = 'missing_columns' | 'bad_distance' | 'bad_email' | 'missing_field' | 'duplicate_bib' | 'column_count';
export type CsvParseResult = { entrants: CsvEntrant[]; rejected: CsvRejection[]; delimiter: ',' | ';' };

type Column = keyof CsvEntrant;

/** Header aliases, French first. Compared after lowercasing, trimming and stripping accents. */
const HEADERS: Record<Column, string[]> = {
  bib: ['bib', 'dossard', 'numero', 'n', 'no', 'num', 'number', 'bib_number'],
  email: ['email', 'e-mail', 'mail', 'courriel', 'adresse email', 'adresse e-mail'],
  firstName: ['first_name', 'firstname', 'prenom', 'first name'],
  lastName: ['last_name', 'lastname', 'nom', 'last name', 'name', 'nom de famille'],
  distanceKey: ['distance_key', 'distance', 'course', 'epreuve', 'parcours', 'race'],
};

const DISTANCES: Array<[DistanceKey, string[]]> = [
  ['marathon', ['marathon', '42', '42k', '42km', '42.195', '42,195']],
  ['half', ['half', 'semi', 'semi-marathon', 'semimarathon', 'halfmarathon', 'half-marathon', '21', '21k', '21km', '21.1', '21,1', '21.097', '21,097']],
  ['10k', ['10k', '10', '10km']],
  ['5k', ['5k', '5', '5km']],
];

const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/^"|"$/g, '').replace(/[.:]+$/, '').trim();

/** Spaces do not matter in a distance label: "42 km", "Semi marathon". */
export const distanceKeyFromLabel = (label: string): DistanceKey | null => {
  const n = normalize(label).replace(/\s+/g, '');
  return DISTANCES.find(([, aliases]) => aliases.includes(n))?.[0] ?? null;
};

/** Semicolon when it yields more header fields than the comma (French spreadsheets), comma otherwise. Quotes respected. */
export const detectDelimiter = (headerLine: string): ',' | ';' => (splitCsvLine(headerLine, ';').length > splitCsvLine(headerLine, ',').length ? ';' : ',');

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

type ParsedLine = { number: number; entrant?: CsvEntrant; rejection?: CsvRejection };

const columnFor = (header: string): Column | null =>
  (Object.keys(HEADERS) as Column[]).find((col) => HEADERS[col].includes(normalize(header))) ?? null;

/**
 * Parses the organizer's entrant list. Tolerates a BOM, CRLF, comma or semicolon, French headers,
 * blank lines and quoted fields. Never throws: every bad line is reported with its 1-based number.
 */
export const parseEntrantsCsv = (text: string): CsvParseResult => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const headerLine = lines.find((l) => l.trim() !== '') ?? '';
  const headerIndex = lines.indexOf(headerLine);
  const delimiter = detectDelimiter(headerLine);
  const columns = splitCsvLine(headerLine, delimiter).map(columnFor);
  const missing = (Object.keys(HEADERS) as Column[]).filter((col) => !columns.includes(col));
  if (headerLine === '' || missing.length > 0) {
    return { entrants: [], rejected: [{ line: headerIndex + 1, reason: 'missing_columns', detail: missing.join(', ') }], delimiter };
  }

  const parsedLines = lines
    .map((line, i) => ({ line, number: i + 1 }))
    .filter(({ line, number }) => number > headerIndex + 1 && line.trim() !== '')
    .map(({ line, number }): ParsedLine => {
      const fields = splitCsvLine(line, delimiter);
      if (fields.length < columns.length) return { number, rejection: { line: number, reason: 'column_count' as const } };
      const raw = Object.fromEntries(columns.flatMap((col, i) => (col ? [[col, fields[i] ?? '']] : []))) as Record<Column, string>;
      const distanceKey = distanceKeyFromLabel(raw.distanceKey);
      if (!distanceKey) return { number, rejection: { line: number, reason: 'bad_distance' as const, detail: raw.distanceKey } };
      const parsed = CsvEntrantSchema.safeParse({ ...raw, distanceKey });
      if (parsed.success) return { number, entrant: parsed.data };
      const emailIssue = parsed.error.issues.some((issue) => issue.path[0] === 'email');
      return { number, rejection: { line: number, reason: emailIssue ? ('bad_email' as const) : ('missing_field' as const), detail: raw.bib } };
    });

  const seen = new Set<string>();
  const withDuplicates = parsedLines.map((p): ParsedLine => {
    if (!p.entrant) return p;
    if (seen.has(p.entrant.bib)) return { number: p.number, rejection: { line: p.number, reason: 'duplicate_bib' as const, detail: p.entrant.bib } };
    seen.add(p.entrant.bib);
    return p;
  });

  return {
    entrants: withDuplicates.flatMap((p) => (p.entrant ? [p.entrant] : [])),
    rejected: withDuplicates.flatMap((p) => (p.rejection ? [p.rejection] : [])),
    delimiter,
  };
};

const escapeCsv = (value: string | number | null | undefined, delimiter: string): string => {
  const s = value === null || value === undefined ? '' : String(value);
  return /["\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Rows to CSV text with a BOM so that Excel opens it as UTF-8. Semicolons by default: French spreadsheets. */
export const toCsv = (rows: Array<Array<string | number | null | undefined>>, delimiter: ',' | ';' = ';'): string =>
  '\uFEFF' + rows.map((row) => row.map((v) => escapeCsv(v, delimiter)).join(delimiter)).join('\r\n') + '\r\n';
