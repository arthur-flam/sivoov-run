import { describe, expect, it } from 'vitest';
import { detectDelimiter, distanceKeyFromLabel, parseEntrantsCsv, splitCsvLine, toCsv } from './csvEntrants';

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
      { line: 3, reason: 'bad_email', detail: '2' },
      { line: 4, reason: 'missing_field', detail: '3' },
      { line: 5, reason: 'bad_distance', detail: 'ultra' },
      { line: 6, reason: 'duplicate_bib', detail: '1' },
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

describe('helpers', () => {
  it('maps distance labels', () => {
    expect(['Marathon', '42,195', 'SEMI', 'half marathon', '10 km', '5K'].map(distanceKeyFromLabel)).toEqual(['marathon', 'marathon', 'half', 'half', '10k', '5k']);
    expect(distanceKeyFromLabel('trail')).toBeNull();
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
