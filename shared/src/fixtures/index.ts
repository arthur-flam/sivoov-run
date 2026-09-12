import deauvilleMarathonJson from './deauville-marathon.json';
import { CourseGeometrySchema } from '../schemas/course';
import type { Landmark } from '../schemas/course';

/** The real 2024 Deauville marathon trace (GPStraces export), used by tests, seeds and the simulator. */
export const deauvilleMarathonGeometry = CourseGeometrySchema.parse(deauvilleMarathonJson);

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
