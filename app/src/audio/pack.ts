import { AudioPackSchema } from '@sivoov/shared';
import type { AudioPack, Course } from '@sivoov/shared';

/**
 * Pack version 1 ("v0" content): the event list a course gets before its produced audio exists. Ceremony at the
 * start and the finish, one course event per landmark, a split every kilometer, one coaching
 * line when the pace drops. Files arrive with the audio pipeline; until then the app shows
 * the event as a caption and logs it to the trace.
 */
export const packV0 = (course: Course): AudioPack =>
  AudioPackSchema.parse({
    courseId: course.id,
    version: 1,
    locale: 'fr',
    events: [
      { id: 'ceremony.start', trigger: { kind: 'start' }, source: { kind: 'file', key: 'start.mp3' }, mix: 'interrupt', priority: 10, category: 'ceremony', title: 'Le départ' },
      ...course.landmarks
        .filter((l) => l.meters > 0 && l.meters < course.distanceM)
        .map((l) => ({
          id: `course.${l.id}`,
          trigger: { kind: 'distance', meters: l.meters },
          source: { kind: 'file', key: `landmark-${l.id}.mp3` },
          mix: 'duck',
          priority: 6,
          category: 'course',
          title: l.name,
        })),
      { id: 'personal.split', trigger: { kind: 'split', everyMeters: 1000 }, source: { kind: 'template', key: 'split', slots: ['km', 'splitTime'] }, mix: 'duck', priority: 4, category: 'personal', once: false, title: 'Passage' },
      { id: 'coaching.slow', trigger: { kind: 'pace', slowerThan: 420, afterMeters: 2000 }, source: { kind: 'template', key: 'encourage', slots: ['firstName'] }, mix: 'duck', priority: 3, category: 'coaching', once: false, title: 'Encouragement' },
      { id: 'ceremony.finish', trigger: { kind: 'finish' }, source: { kind: 'file', key: 'finish.mp3' }, mix: 'interrupt', priority: 10, category: 'ceremony', title: 'L’arrivée' },
    ],
    files: {},
  });
