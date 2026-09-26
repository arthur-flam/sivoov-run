import { Hono } from 'hono';
import { IMAGE_MAX_BYTES, RaceSchema } from '@sivoov/shared';
import type { ImageSlot } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { requireCan, requireOrganizer } from '../lib/orgAuth';
import type { OrgVars } from '../lib/orgAuth';
import { storeRaceImage } from '../lib/raceMedia';
import type { StoredImage } from '../lib/raceMedia';
import { SETTINGS_SECTIONS, applySettings } from '../lib/raceSettings';
import type { SettingsFailure } from '../lib/raceSettings';
import { OrgSettingsPage, SETTINGS_DONE } from '../pages/org/settings';
import type { ImageError } from '../pages/org/settingsLook';
import { doneMessage, orgPage } from './orgPage';
import type { OrgContext } from './orgPage';
import { orgTeam } from './orgTeam';

/** The race itself: its settings (this file) and its team (./orgTeam.tsx). Mounted under /org. */
export const orgRace = new Hono<AppEnv & { Variables: OrgVars }>();

type SettingsState = { failure?: SettingsFailure; imageError?: ImageError };

const settingsPage = (c: OrgContext, state: SettingsState = {}) =>
  orgPage(
    c,
    'settings',
    'Réglages',
    <OrgSettingsPage race={c.get('race')} done={doneMessage(c, SETTINGS_DONE) ? c.req.query('done') : undefined} {...state} />,
    { status: state.failure || state.imageError ? 400 : 200 },
  );

orgRace.get('/:slug/settings', requireOrganizer, requireCan('edit_race'), (c) => settingsPage(c));

/**
 * One card's form: the race, the window, the contact, the colors or the status. One route per
 * card: Hono's RegExpRouter does not group an alternation in a param (`:section{a|b}`), so a
 * second one on the same path swallows its neighbours (docs/MEMORY.md).
 */
SETTINGS_SECTIONS.forEach((section) =>
  orgRace.post(`/:slug/settings/${section}`, requireOrganizer, requireCan('edit_race'), async (c) => {
    const race = c.get('race');
    const outcome = applySettings(race, section, await c.req.parseBody());
    if (!outcome.ok) return settingsPage(c, { failure: outcome });
    await db(c.env.DB).upsertRace(outcome.race);
    const done = section === 'contact' && !outcome.race.supportEmail ? 'contact_removed' : section;
    return c.redirect(`/org/${race.slug}/settings?done=${done}#${section === 'colors' ? 'look' : section}`);
  }),
);

const imageMessage = (error: Exclude<StoredImage, { ok: true }>['error'], slot: ImageSlot): string =>
  ({
    empty: 'Choisissez un fichier sur votre ordinateur ou votre téléphone.',
    type: 'Ce fichier n’est pas accepté. Envoyez une image PNG, JPEG ou WebP (le format SVG ne l’est pas).',
    too_big: `Ce fichier dépasse ${IMAGE_MAX_BYTES[slot] / (1024 * 1024)} Mo. Réduisez sa taille et réessayez.`,
  })[error];

const SLOTS: readonly ImageSlot[] = ['logo', 'hero'];

SLOTS.forEach((slot) => {
  /** The logo or the header photo: checked, stored in R2 under the race, and put in the theme as a URL. */
  orgRace.post(`/:slug/settings/${slot}`, requireOrganizer, requireCan('edit_race'), async (c) => {
    const race = c.get('race');
    const file = (await c.req.parseBody()).file;
    const stored: StoredImage = file instanceof File ? await storeRaceImage(c.env, race.id, slot, file) : { ok: false, error: 'empty' };
    if (!stored.ok) return settingsPage(c, { imageError: { slot, message: imageMessage(stored.error, slot) } });
    await db(c.env.DB).upsertRace(RaceSchema.parse({ ...race, theme: { ...race.theme, [slot]: stored.url } }));
    return c.redirect(`/org/${race.slug}/settings?done=${slot}#look`);
  });

  /** "Retirer": the theme forgets the picture. The file stays in R2: sending it again reuses it. */
  orgRace.post(`/:slug/settings/${slot}/remove`, requireOrganizer, requireCan('edit_race'), async (c) => {
    const race = c.get('race');
    const theme = Object.fromEntries(Object.entries(race.theme).filter(([key]) => key !== slot));
    await db(c.env.DB).upsertRace(RaceSchema.parse({ ...race, theme }));
    return c.redirect(`/org/${race.slug}/settings?done=${slot}_removed#look`);
  });
});

orgRace.route('/', orgTeam);
