import { create } from 'zustand';

/**
 * Whether the phone is short of battery (`isLow`), from the run's battery readings: the GPS
 * switches to its saver pace and the run screen lets the display sleep.
 */
export const usePower = create<{ low: boolean }>(() => ({ low: false }));
