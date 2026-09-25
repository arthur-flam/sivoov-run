import { describe, expect, it } from 'vitest';
import { decodeSpreadsheet, detectDelimiter, distanceKeyFromLabel, parseEntrantsCsv, planImport, splitCsvLine, toCsv } from './csvEntrants';

describe('parseEntrantsCsv', () => {
  it('reads the canonical comma file', () => {
    const { entrants, rejected, delimiter } = parseEntrantsCsv('bib,email,first_name,last_name,distance_key\n1001,Marc@Example.com,Marc,Dupont,half\n1002,lea@example.com,Léa,Martin,marathon\n');
    expect(delimiter).toBe(',');
    expect(rejected).toEqual([]);
    expect(entrants).toEqual([
      { bib: '1001', email: 'marc@example.com', firstName: 'Marc', lastName: 'Dupont', distanceKey: 'half' },
      { bib: '1002', email: 'lea@example.com', firstName: 'Léa', lastName: 'Martin', distanceKey: 'marathon' },
    ]);
  });

  it('reads a French semicolon export with a BOM, CRLF, accents and quoted fields', () => {
    const text = '\uFEFFDossard;Prénom;Nom;E-mail;Épreuve\r\n12;"Jean-Pierre";"D\'Arc, de";jp@example.com;Semi-marathon\r\n\r\n13;Anna;Roux;anna@example.com;42 km\r\n';
    const { entrants, rejected, delimiter } = parseEntrantsCsv(text);
    expect(delimiter).toBe(';');
    expect(rejected).toEqual([]);
    expect(entrants).toEqual([
      { bib: '12', email: 'jp@example.com', firstName: 'Jean-Pierre', lastName: "D'Arc, de", distanceKey: 'half' },
      { bib: '13', email: 'anna@example.com', firstName: 'Anna', lastName: 'Roux', distanceKey: 'marathon' },
    ]);
  });

  it('rejects bad lines with their number and reason, keeps the good ones', () => {
    const text = ['bib,email,first_name,last_name,distance', '1,ok@example.com,A,B,10k', '2,not-an-email,A,B,10k', '3,ok@example.com,,B,10k', '4,ok@example.com,A,B,ultra', '1,dup@example.com,A,B,10k', '5,ok@example.com,A'].join('\n');
    const { entrants, rejected } = parseEntrantsCsv(text);
    expect(entrants.map((e) => e.bib)).toEqual(['1']);
    expect(rejected).toEqual([
      { line: 3, reason: 'bad_email', detail: 'not-an-email', bib: '2' },
      { line: 4, reason: 'missing_field', detail: 'firstName', bib: '3' },
      { line: 5, reason: 'bad_distance', detail: 'ultra', bib: '4' },
      // The detail of a duplicate is the line where that bib first appears.
      { line: 6, reason: 'duplicate_bib', detail: '2', bib: '1' },
      { line: 7, reason: 'column_count' },
    ]);
  });

  it('reports missing columns instead of guessing', () => {
    const { entrants, rejected } = parseEntrantsCsv('bib,email\n1,a@b.fr');
    expect(entrants).toEqual([]);
    expect(rejected).toEqual([{ line: 1, reason: 'missing_columns', detail: 'firstName, lastName, distanceKey' }]);
    expect(parseEntrantsCsv('').rejected[0]?.reason).toBe('missing_columns');
  });
});

describe('what Excel and ticketing tools produce', () => {
  it('finds the header below a title row, reads a tab-separated paste and ignores empty rows', () => {
    const text = 'Inscrits Marathon de Deauville\n;;;;\nN° dossard\tNom de famille\tPrénom\tAdresse e-mail\tÉpreuve\tClub\n12\tRoux\tAnna\tanna@example.com\tMarathon\tASPTT\n\t\t\t\t\t\n';
    const { entrants, rejected, delimiter, headers } = parseEntrantsCsv(text);
    expect(delimiter).toBe('\t');
    expect(rejected).toEqual([]);
    expect(entrants).toEqual([{ bib: '12', email: 'anna@example.com', firstName: 'Anna', lastName: 'Roux', distanceKey: 'marathon' }]);
    expect(headers.map((h) => h.column)).toEqual(['bib', 'lastName', 'firstName', 'email', 'distanceKey', null]);
  });

  it('reads the optional address columns into the medal address', () => {
    const text = [
      'Dossard;Prénom;Nom;Email;Distance;Adresse;Complément;Code postal;Ville;Pays',
      '1;Léa;Martin;lea@example.com;Semi;12 rue des Planches;Bât. B;14800;Deauville;',
      '2;Paul;Petit;paul@example.com;10 km;1 place;;1000;Bourg-en-Bresse;France',
      '3;Ana;Silva;ana@example.com;10 km;;;;;',
      '4;Tom;Lee;tom@example.com;10 km;3 Main St;;SW1A;London;Royaume-Uni',
    ].join('\r\n');
    const { entrants, warnings } = parseEntrantsCsv(text);
    expect(warnings).toEqual([]);
    expect(entrants.map((e) => e.address)).toEqual([
      { line1: '12 rue des Planches', line2: 'Bât. B', postalCode: '14800', city: 'Deauville', country: 'FR' },
      { line1: '1 place', postalCode: '01000', city: 'Bourg-en-Bresse', country: 'FR' },
      undefined,
      { line1: '3 Main St', postalCode: 'SW1A', city: 'London', country: 'GB' },
    ]);
  });

  it('imports a runner whose address is incomplete without it, and says so', () => {
    const text = 'bib,email,first name,last name,distance,address,city,postal code,country\n1,a@example.com,A,B,Marathon,12 rue,,14800,\n2,b@example.com,C,D,Marathon,1 rue,Oslo,0150,Narnia\n';
    const { entrants, rejected, warnings } = parseEntrantsCsv(text);
    expect(rejected).toEqual([]);
    expect(entrants.map((e) => [e.bib, e.address])).toEqual([['1', undefined], ['2', undefined]]);
    expect(warnings).toEqual([
      { line: 2, reason: 'incomplete_address', detail: 'city', bib: '1' },
      { line: 3, reason: 'unknown_country', detail: 'Narnia', bib: '2' },
    ]);
  });

  it('refuses a distance the race does not offer, when it knows them', () => {
    const text = 'dossard;email;prenom;nom;distance\n1;a@example.com;A;B;Marathon\n2;b@example.com;C;D;5 km\n';
    expect(parseEntrantsCsv(text).rejected).toEqual([]);
    expect(parseEntrantsCsv(text, { distances: ['marathon', 'half'] }).rejected).toEqual([{ line: 3, reason: 'distance_not_offered', detail: '5 km', bib: '2' }]);
  });

  it('says which required cells are empty on a line', () => {
    const { rejected } = parseEntrantsCsv('dossard;email;prenom;nom;distance\n;a@example.com;;B;Semi\n');
    expect(rejected).toEqual([{ line: 2, reason: 'missing_field', detail: 'bib, firstName' }]);
  });
});

describe('reading the uploaded bytes', () => {
  const bytes = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

  it('reads a Windows-1252 file (Excel on Windows) with its accents and curly apostrophes', () => {
    // é = 0xE9, ë = 0xEB, and 0x92 is the typographic apostrophe in Windows-1252 only.
    const decoded = decodeSpreadsheet(bytes('Dossard;Prénom;Nom;Email;Distance\r\n7;Gaël;D\x92Arc;gael@example.com;Semi\r\n'));
    expect(decoded).toMatchObject({ ok: true, encoding: 'windows-1252' });
    const { entrants } = parseEntrantsCsv(decoded.ok ? decoded.text : '');
    expect(entrants).toEqual([{ bib: '7', email: 'gael@example.com', firstName: 'Gaël', lastName: `D${String.fromCharCode(0x2019)}Arc`, distanceKey: 'half' }]);
  });

  it('reads UTF-8 with or without a BOM, and UTF-16', () => {
    const utf8 = new TextEncoder().encode('Prénom');
    expect(decodeSpreadsheet(utf8)).toEqual({ ok: true, text: 'Prénom', encoding: 'utf-8' });
    expect(decodeSpreadsheet(Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8]))).toEqual({ ok: true, text: 'Prénom', encoding: 'utf-8' });
    const utf16 = Uint8Array.from([0xff, 0xfe, ...[...'Né'].flatMap((c) => [c.charCodeAt(0), 0])]);
    expect(decodeSpreadsheet(utf16)).toEqual({ ok: true, text: 'Né', encoding: 'utf-16' });
  });

  it('recognises a workbook sent instead of a CSV, and an empty file', () => {
    expect(decodeSpreadsheet(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14]))).toEqual({ ok: false, reason: 'spreadsheet' });
    expect(decodeSpreadsheet(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1]))).toEqual({ ok: false, reason: 'spreadsheet' });
    expect(decodeSpreadsheet(new Uint8Array())).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('planImport', () => {
  const stored = { bib: '1', email: 'a@example.com', firstName: 'A', lastName: 'B', distanceKey: 'marathon' as const, address: { line1: '1 rue', postalCode: '14800', city: 'Deauville', country: 'FR' } };
  it('tells new bibs from changed and unchanged ones', () => {
    const plan = planImport([stored], [
      { bib: '1', email: 'a@example.com', firstName: 'A', lastName: 'B', distanceKey: 'marathon' },
      { bib: '1', email: 'a@example.com', firstName: 'A', lastName: 'B', distanceKey: 'half' },
      { bib: '2', email: 'b@example.com', firstName: 'C', lastName: 'D', distanceKey: 'half' },
    ]);
    // A file without an address keeps the stored one: not a change.
    expect(plan.map((p) => p.change)).toEqual(['same', 'updated', 'new']);
  });
  it('counts a new address as a change', () => {
    const moved = { ...stored, address: { ...stored.address, city: 'Trouville' } };
    expect(planImport([stored], [moved]).map((p) => p.change)).toEqual(['updated']);
    expect(planImport([stored], [stored]).map((p) => p.change)).toEqual(['same']);
  });
});

describe('helpers', () => {
  it('maps distance labels', () => {
    expect(['Marathon', '42,195', 'SEMI', 'half marathon', '10 km', '5K'].map(distanceKeyFromLabel)).toEqual(['marathon', 'marathon', 'half', 'half', '10k', '5k']);
    expect(distanceKeyFromLabel('trail')).toBeNull();
  });
  it('maps the distance labels race directors actually write', () => {
    const cases: Array<[string, string | null]> = [
      ['Semi', 'half'], ['21 km', 'half'], ['21,1 km', 'half'], ['Semi-marathon', 'half'], ['1/2 marathon', 'half'], ['Demi-marathon', 'half'], ['21097', 'half'],
      ['Marathon', 'marathon'], ['42,195 km', 'marathon'], ['42.195', 'marathon'], ['42 km', 'marathon'], ['Marathon de Deauville 2026', 'marathon'], ['Marathon (42,195 km)', 'marathon'],
      ['10 km', '10k'], ['10K', '10k'], ['10 000 m', '10k'], ['10 kilomètres', '10k'], ['Course 10 km', '10k'],
      ['5 km', '5k'], ['5000 m', '5k'],
      ['20 km', null], ['Trail 30 km', null], ['ultra', null], ['', null],
    ];
    expect(cases.map(([label]) => [label, distanceKeyFromLabel(label)])).toEqual(cases);
  });
  it('detects the delimiter from the header', () => {
    expect(detectDelimiter('a;b;c')).toBe(';');
    expect(detectDelimiter('a,b,c')).toBe(',');
    expect(detectDelimiter('"a, b";c')).toBe(';');
  });
  it('splits quoted fields with doubled quotes', () => {
    expect(splitCsvLine('1,"Say ""hi"", ok",x', ',')).toEqual(['1', 'Say "hi", ok', 'x']);
  });
  it('writes CSV Excel can open and reads it back', () => {
    const csv = toCsv([['bib', 'name'], ['1', 'Du; Pont "JP"']]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('1;"Du; Pont ""JP"""');
    expect(splitCsvLine(csv.split('\r\n')[1]!, ';')).toEqual(['1', 'Du; Pont "JP"']);
  });
});
