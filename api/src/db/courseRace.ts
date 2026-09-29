/**
 * The race whose courses a race runs on, in SQL: its own, or for a demo race the real race's
 * (`races.demo_of`). `param` is the bound race id (`?1`). Runners, runs and results stay keyed on
 * the entrant's own race, so a demo's runners never reach the real race's lists.
 */
export const courseRaceOf = (param: string): string => `COALESCE((SELECT demo_of FROM races WHERE id = ${param}), ${param})`;
