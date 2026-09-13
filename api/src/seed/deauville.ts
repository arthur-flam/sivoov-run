import { CourseSchema, DISTANCE_METERS, EntrantSchema, OrganizerSchema, RaceSchema, deauvilleMarathonLandmarks } from '@sivoov/shared';
import type { Course, Entrant, Organizer, Race } from '@sivoov/shared';

/**
 * The first race. Theme colors are placeholders until the organizer's kit arrives;
 * dates are the real ones, the window is the PRD assumption (9 to 15 November).
 */
export const deauvilleRace: Race = RaceSchema.parse({
  id: 'deauville-2026',
  slug: 'deauville-2026',
  name: 'Marathon International de Deauville',
  city: 'Deauville',
  country: 'FR',
  dateStart: '2026-11-14',
  dateEnd: '2026-11-15',
  windowStart: '2026-11-09T00:00:00+01:00',
  windowEnd: '2026-11-15T23:59:59+01:00',
  timezone: 'Europe/Paris',
  organizerUrl: 'https://www.marathon-deauville.com',
  theme: { displayName: 'Marathon International de Deauville', primary: '#0f3d6e', onPrimary: '#ffffff' },
  status: 'open',
});

const halfLandmarks = deauvilleMarathonLandmarks
  .filter((l) => l.meters <= 21097.5 || l.id === 'finish-planches')
  .map((l) => (l.id === 'finish-planches' ? { ...l, meters: 21097.5 } : l.id === 'half' ? { ...l, id: 'quarter', name: 'Mi-course', meters: 10548 } : l));

export const deauvilleCourses: Course[] = [
  CourseSchema.parse({
    id: 'deauville-2026-marathon',
    raceId: deauvilleRace.id,
    distanceKey: 'marathon',
    distanceM: DISTANCE_METERS.marathon,
    geometryKey: 'courses/deauville-2026-marathon.json',
    landmarks: deauvilleMarathonLandmarks,
  }),
  CourseSchema.parse({
    id: 'deauville-2026-half',
    raceId: deauvilleRace.id,
    distanceKey: 'half',
    distanceM: DISTANCE_METERS.half,
    geometryKey: 'courses/deauville-2026-marathon.json',
    landmarks: halfLandmarks,
  }),
];

/** Test entrants for local and preview. Production gets the organizer's CSV instead. */
export const deauvilleTestEntrants: Entrant[] = [
  { bib: '1001', email: 'marc@example.com', firstName: 'Marc', lastName: 'Dupont', distanceKey: 'half' },
  { bib: '1002', email: 'lea@example.com', firstName: 'Léa', lastName: 'Martin', distanceKey: 'marathon' },
  { bib: '1003', email: 'arthur.flam@gmail.com', firstName: 'Arthur', lastName: 'Flam', distanceKey: 'half' },
].map((e) => EntrantSchema.parse({ ...e, id: `deauville-2026-${e.bib}`, raceId: deauvilleRace.id, source: 'manual' }));

/** Who may open /org/deauville-2026. The @example.com one signs in with TEST_CODE on local and preview. */
export const deauvilleOrganizers: Organizer[] = ['arthur.flam@gmail.com', 'orga@example.com'].map((email) =>
  OrganizerSchema.parse({ id: `deauville-2026-org-${email.split('@')[0]}`, raceId: deauvilleRace.id, email }),
);
