import { AudioScriptSchema, CourseSchema, DISTANCE_METERS, EntrantSchema, OrganizerSchema, RaceSchema, champsElysees10kLandmarks } from '@sivoov/shared';
import type { AudioScript, Course, Entrant, Organizer, Race } from '@sivoov/shared';
import { champsElysees2027Script } from './champsElyseesScript';

/**
 * The 10 km des Champs-Élysées, 5th edition (Sunday 7 February 2027, stage 1 of the Paris
 * Masters Circuit), run by Sport Concept Organisation, who also run Deauville. The virtual
 * window is the race week. Colours, logo and photo are the organizer's own (their site's
 * assets, until they send the kit): navy from the logo's stripes, the start dot's orange.
 */
export const champsElyseesRace: Race = RaceSchema.parse({
  id: '10km-champs-elysees-2027',
  slug: '10km-champs-elysees-2027',
  name: '10 km des Champs-Élysées',
  city: 'Paris',
  country: 'FR',
  dateStart: '2027-02-07',
  dateEnd: '2027-02-07',
  windowStart: '2027-02-01T00:00:00+01:00',
  windowEnd: '2027-02-07T23:59:59+01:00',
  timezone: 'Europe/Paris',
  organizerUrl: 'https://www.10kmchampselysees.fr/',
  theme: {
    displayName: '10 km des Champs-Élysées',
    primary: '#003767',
    onPrimary: '#ffffff',
    accent: '#ea5b1a',
    logo: 'https://static.wixstatic.com/media/2b8b4e_e5553556cac04d798551f6dcb2750bb9~mv2.png/v1/fill/w_280,h_336,al_c,q_90/logo.png',
    hero: 'https://static.wixstatic.com/media/2b8b4e_ecc62b98c9c446d6892af09ee4c3991c~mv2.jpg/v1/fill/w_2000,h_1334,al_c,q_85/hero.jpg',
    series: {
      name: 'Paris Masters Circuit',
      url: 'https://www.parismasterscircuit.fr/',
      stages: [
        { name: '10 km des Champs-Élysées', date: '2027-02-07', place: 'Avenue des Champs-Élysées', current: true },
        {
          name: '10 km Hexagone Trocadéro',
          date: '2027-09-05',
          place: 'Trocadéro',
          logo: 'https://static.wixstatic.com/media/2b8b4e_147b94b223e448379d2b871815248413~mv2.jpg/v1/fill/w_320,h_210,al_c,q_85/trocadero.jpg',
        },
        {
          name: '10 km de la Tour Eiffel',
          date: '2027-12-05',
          place: 'Champ-de-Mars',
          logo: 'https://static.wixstatic.com/media/2b8b4e_fc626ba13eed4e369092b59a14736abf~mv2.jpg/v1/fill/w_320,h_210,al_c,q_85/tour-eiffel.jpg',
        },
      ],
      reward: 'Les trois médailles, et le support collector qui les réunit.',
    },
  },
  status: 'open',
});

export const champsElyseesCourses: Course[] = [
  CourseSchema.parse({
    id: '10km-champs-elysees-2027-10k',
    raceId: champsElyseesRace.id,
    distanceKey: '10k',
    distanceM: DISTANCE_METERS['10k'],
    geometryKey: 'courses/10km-champs-elysees-2027-10k.json',
    landmarks: champsElysees10kLandmarks,
  }),
];

/** Test entrants for local and preview (bibs 2001-2003). Production gets the organizer's list. */
export const champsElyseesTestEntrants: Entrant[] = [
  { bib: '2001', email: 'marc@example.com', firstName: 'Marc', lastName: 'Dupont' },
  { bib: '2002', email: 'lea@example.com', firstName: 'Léa', lastName: 'Martin' },
  { bib: '2003', email: 'arthur.flam@gmail.com', firstName: 'Arthur', lastName: 'Flam' },
].map((e) => EntrantSchema.parse({ ...e, distanceKey: '10k', id: `${champsElyseesRace.id}-${e.bib}`, raceId: champsElyseesRace.id, source: 'manual' }));

/** The same team as Deauville: the @example.com ones are test accounts, not seeded on production. */
export const champsElyseesOrganizers: Organizer[] = (
  [
    ['arthur.flam@gmail.com', 'owner'],
    ['orga@example.com', 'owner'],
    ['equipe@example.com', 'editor'],
    ['lecture@example.com', 'viewer'],
  ] as const
).map(([email, role]) => OrganizerSchema.parse({ id: `${champsElyseesRace.id}-org-${email.split('@')[0]}`, raceId: champsElyseesRace.id, email, role }));

export const champsElyseesScripts: AudioScript[] = [AudioScriptSchema.parse(champsElysees2027Script)];
