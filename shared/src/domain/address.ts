import { AddressSchema } from '../schemas/entrant';
import type { Address } from '../schemas/entrant';

/**
 * Postal addresses for the medal, as a race director types them: in a spreadsheet column or a
 * form. Country names in French or English, or the two-letter code; France when left blank.
 */

/** The countries offered in the admin form, French name first. Any other two-letter code is accepted too. */
export const COUNTRIES: ReadonlyArray<{ code: string; name: string; aliases: readonly string[] }> = [
  { code: 'FR', name: 'France', aliases: ['france', 'fra', 'france metropolitaine'] },
  { code: 'BE', name: 'Belgique', aliases: ['belgique', 'belgium', 'bel', 'belgie'] },
  { code: 'CH', name: 'Suisse', aliases: ['suisse', 'switzerland', 'schweiz', 'che'] },
  { code: 'LU', name: 'Luxembourg', aliases: ['luxembourg', 'lux'] },
  { code: 'MC', name: 'Monaco', aliases: ['monaco'] },
  { code: 'DE', name: 'Allemagne', aliases: ['allemagne', 'germany', 'deutschland', 'deu'] },
  { code: 'ES', name: 'Espagne', aliases: ['espagne', 'spain', 'espana', 'esp'] },
  { code: 'IT', name: 'Italie', aliases: ['italie', 'italy', 'italia', 'ita'] },
  { code: 'PT', name: 'Portugal', aliases: ['portugal', 'prt'] },
  { code: 'NL', name: 'Pays-Bas', aliases: ['pays bas', 'netherlands', 'nederland', 'hollande', 'nld'] },
  { code: 'GB', name: 'Royaume-Uni', aliases: ['royaume uni', 'united kingdom', 'uk', 'angleterre', 'england', 'grande bretagne', 'gbr'] },
  { code: 'IE', name: 'Irlande', aliases: ['irlande', 'ireland', 'irl'] },
  { code: 'AT', name: 'Autriche', aliases: ['autriche', 'austria', 'osterreich', 'aut'] },
  { code: 'CA', name: 'Canada', aliases: ['canada', 'can'] },
  { code: 'US', name: 'États-Unis', aliases: ['etats unis', 'usa', 'united states', 'etats unis d amerique'] },
];

/** Lowercase, no accents, words separated by single spaces: "États-Unis" -> "etats unis". */
export const foldText = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9@]+/g, ' ')
    .trim();

/** "France", "belgium", "fr", "" -> "FR", "BE", "FR", "FR". Null for a name it does not know. */
export const countryCode = (label: string): string | null => {
  const folded = foldText(label);
  if (folded === '') return 'FR';
  const known = COUNTRIES.find((c) => c.code.toLowerCase() === folded || c.aliases.includes(folded));
  if (known) return known.code;
  return /^[a-z]{2}$/.test(folded) ? folded.toUpperCase() : null;
};

/** "FR" -> "France"; an unlisted code is shown as is. */
export const countryName = (code: string): string => COUNTRIES.find((c) => c.code === code)?.name ?? code;

export type AddressParts = { line1: string; line2: string; postalCode: string; city: string; country: string };
export type AddressPart = keyof AddressParts;
export const ADDRESS_PARTS: readonly AddressPart[] = ['line1', 'line2', 'postalCode', 'city', 'country'];
const REQUIRED: readonly AddressPart[] = ['line1', 'postalCode', 'city'];

/**
 * What a set of address fields amounts to. All blank (the country aside) is no address, which is fine. Otherwise
 * the street, postal code and city are needed; `missing` and `badCountry` say what is wrong.
 * French postal codes lose their leading zero in Excel ("1000" for Bourg-en-Bresse): put it back.
 */
export type AddressOutcome = { address?: Address; missing: AddressPart[]; badCountry?: string };

export const addressFromParts = (parts: Partial<AddressParts>): AddressOutcome => {
  const p = Object.fromEntries(ADDRESS_PARTS.map((k) => [k, (parts[k] ?? '').trim()])) as AddressParts;
  // A country alone is not an address: ticketing exports often fill it for everyone.
  if (ADDRESS_PARTS.every((k) => k === 'country' || p[k] === '')) return { missing: [] };
  const missing = REQUIRED.filter((k) => p[k] === '');
  const country = countryCode(p.country);
  if (missing.length > 0 || !country) return { missing, ...(country ? {} : { badCountry: p.country }) };
  const postalCode = country === 'FR' && /^\d{4}$/.test(p.postalCode) ? `0${p.postalCode}` : p.postalCode;
  const address = AddressSchema.parse({ line1: p.line1, ...(p.line2 ? { line2: p.line2 } : {}), postalCode, city: p.city, country });
  return { address, missing: [] };
};

/** The address as it goes on an envelope, one line per entry. */
export const addressLines = (a: Address): string[] => [a.line1, ...(a.line2 ? [a.line2] : []), `${a.postalCode} ${a.city}`, ...(a.country === 'FR' ? [] : [countryName(a.country)])];
