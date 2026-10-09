import { champsElysees10kPairs } from './champs-elysees-10k';
import { deauvilleMarathonPairs } from './deauville-marathon';
import { CourseGeometrySchema } from '../schemas/course';
import type { Landmark } from '../schemas/course';
import { buildTrack, trackFrom, trackMetersForRun } from '../domain/course';

/** The real 2024 Deauville marathon trace (GPStraces export), used by tests, seeds and the simulator. */
export const deauvilleMarathonGeometry = CourseGeometrySchema.parse({
  courseId: 'deauville-2026-marathon',
  points: deauvilleMarathonPairs.map(([lat, lng]) => ({ lat, lng })),
});

/** Landmarks by official distance, from the organizer's brief. Placeholder copy until the brief arrives. */
export const deauvilleMarathonLandmarks: Landmark[] = [
  { id: 'planches', name: 'Les Planches', meters: 200, description: 'La promenade en bois face à la mer, cabines aux noms des stars.' },
  { id: 'normandy', name: 'Hôtel Le Normandy', meters: 900, description: 'Palace Belle Époque de 1912.' },
  { id: 'touques', name: 'Touques', meters: 3900, description: 'On quitte le front de mer pour la campagne.' },
  { id: 'saint-arnoult', name: 'Saint-Arnoult', meters: 7700, description: 'Terre de haras.' },
  { id: 'tourgeville', name: 'Tourgéville', meters: 11600, description: 'Villas et bocage.' },
  { id: 'half', name: 'Mi-course', meters: 21097, description: 'La moitié. Le retour vers la mer.' },
  { id: 'hippodrome', name: 'Hippodrome de la Touques', meters: 30000, description: 'Tradition équestre de Deauville.' },
  { id: 'sunset', name: 'Sunset Beach', meters: 38000, description: 'Vue sur la Manche.' },
  { id: 'finish-planches', name: 'Arrivée sur les Planches', meters: 42195, description: 'La ligne, face à la mer.' },
];

/** The official 10 km des Champs-Élysées course (2025 onwards), for seeds, tests and the simulator. */
export const champsElysees10kGeometry = CourseGeometrySchema.parse({
  courseId: '10km-champs-elysees-2027-10k',
  points: champsElysees10kPairs.map(([lat, lng]) => ({ lat, lng })),
});

/**
 * Its places by official distance, measured on the GPX (2026-09-27): the loop runs Concorde,
 * Madeleine, Malesherbes, Parc Monceau, Haussmann, the Champs-Élysées up to a U-turn below the
 * Arc de Triomphe and back, Avenue Montaigne, the Seine, and up to the line by the Ledoyen.
 */
export const champsElysees10kLandmarks: Landmark[] = [
  { id: 'depart', name: 'Départ, bas des Champs-Élysées', meters: 0, description: 'Devant le Pavillon Ledoyen, entre le Petit Palais et la Concorde.' },
  { id: 'concorde', name: 'Place de la Concorde', meters: 250, description: 'L’Obélisque de Louxor, trois mille ans, sur les pavés.' },
  { id: 'madeleine', name: 'La Madeleine', meters: 650, description: 'Cinquante-deux colonnes, puis le boulevard Malesherbes.' },
  { id: 'monceau', name: 'Parc Monceau', meters: 2100, description: 'Grilles dorées, la Rotonde, le premier saut en parachute (1797).' },
  { id: 'lisbonne', name: 'Rue de Lisbonne', meters: 3300, description: 'Le point haut de la première boucle, puis la descente.' },
  { id: 'haussmann', name: 'Boulevard Haussmann', meters: 4150, description: 'Saint-Augustin, puis le musée Jacquemart-André.' },
  { id: 'rond-point', name: 'Rond-Point des Champs-Élysées', meters: 5950, description: 'La montée des Champs sur les pavés, l’Arc en face.' },
  { id: 'arc', name: 'Demi-tour sous l’Arc de Triomphe', meters: 6900, description: 'Le point le plus haut, et toute la descente des Champs.' },
  { id: 'montaigne', name: 'Avenue Montaigne', meters: 7950, description: 'Les maisons de couture, le Théâtre des Champs-Élysées.' },
  { id: 'alma', name: 'Place de l’Alma et la Seine', meters: 8600, description: 'La tour Eiffel de l’autre côté de l’eau.' },
  { id: 'golden', name: 'Le Golden km', meters: 9000, description: 'Le dernier kilomètre, chronométré à part.' },
  { id: 'alexandre-iii', name: 'Pont Alexandre-III', meters: 9450, description: 'Les Renommées dorées, le Grand Palais au-dessus.' },
  { id: 'arrivee', name: 'Arrivée, bas des Champs-Élysées', meters: 10000, description: 'La ligne, là où tout a commencé.' },
];

/**
 * The 5 km demo of the Champs-Élysées: the 10 km's second half, from its official 5th km on
 * boulevard Haussmann to the same line. What a race director tries in a lunch break: the climb of
 * the Champs, the U-turn under the Arc, Montaigne, the Seine, the Golden km (PRODUCTION.md).
 */
const CHAMPS_5K_FROM_M = 5000;
const champs10kTrack = buildTrack(champsElysees10kGeometry.points);

export const champsElysees5kGeometry = CourseGeometrySchema.parse({
  courseId: '10km-champs-elysees-2027-5k',
  points: trackFrom(champs10kTrack, trackMetersForRun(champs10kTrack, 10_000, CHAMPS_5K_FROM_M)),
});

/** Its places: the 10 km's, 5 km earlier, and a start of its own on boulevard Haussmann. */
export const champsElysees5kLandmarks: Landmark[] = [
  { id: 'depart', name: 'Départ, boulevard Haussmann', meters: 0, description: 'Le haut du boulevard, puis le faubourg Saint-Honoré et l’avenue Franklin-Roosevelt.' },
  ...champsElysees10kLandmarks.filter((l) => l.meters >= 5950).map((l) => ({ ...l, meters: l.meters - CHAMPS_5K_FROM_M })),
];
