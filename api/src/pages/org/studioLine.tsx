import { describeTrigger } from '@sivoov/shared';
import type { AudioCategory, MixMode, ScriptLine } from '@sivoov/shared';
import type { LineStatus } from '../../lib/studio';

export const CATEGORIES: { key: AudioCategory; label: string }[] = [
  { key: 'ceremony', label: 'Cérémonie' },
  { key: 'course', label: 'Parcours' },
  { key: 'coaching', label: 'Coaching' },
  { key: 'personal', label: 'Personnel' },
  { key: 'safety', label: 'Sécurité' },
];

export const MIXES: { key: MixMode; label: string }[] = [
  { key: 'duck', label: 'Baisser la musique' },
  { key: 'wait', label: 'Attendre son tour' },
  { key: 'interrupt', label: 'Interrompre' },
];

export const TRIGGERS: { key: string; label: string }[] = [
  { key: 'start', label: 'Au départ' },
  { key: 'distance', label: 'À une distance' },
  { key: 'elapsed', label: 'Après un temps' },
  { key: 'split', label: 'À chaque intervalle' },
  { key: 'pace', label: 'Selon l’allure' },
  { key: 'finish', label: 'À l’arrivée' },
];

const num = (v: number | undefined) => (v === undefined ? '' : String(v));

type Props = { line: ScriptLine; status: LineStatus; when: string; ttsReady: boolean };

/**
 * One event: the collapsed row, then the editor. Plain inputs, no framework — the client
 * script reads them by name, rebuilds the line and saves the whole script.
 */
export const StudioLine = ({ line, status, when, ttsReady }: Props) => {
  const t = line.trigger;
  const kind = t.kind;
  const f = (shown: boolean) => `f${shown ? '' : ' hide'}`;
  return (
    <div class="ev" data-line={line.id}>
      <div class="ev-top" data-role="toggle">
        <span class="ev-when" data-role="when">{when}</span>
        <span class="ev-name" data-role="name">{line.title || line.id}</span>
        <span class={`ev-flag${status.template || status.rendered ? '' : ' miss'}`} data-role="flag">
          {status.template ? 'modèle' : status.rendered ? 'voix prête' : 'voix à générer'}
        </span>
        <span class="ev-sub" data-role="sub">
          {describeTrigger(line.trigger, 'fr')} · {CATEGORIES.find((c) => c.key === line.category)?.label ?? line.category} · priorité {line.priority}
        </span>
      </div>
      <div class="ev-body">
        <div class="f">
          <span>Titre</span>
          <input name="title" type="text" value={line.title} />
        </div>
        <div class="grid2">
          <div class="f">
            <span>Déclencheur</span>
            <select name="trigger.kind">
              {TRIGGERS.map((o) => (
                <option value={o.key} selected={o.key === kind}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div class={f(kind === 'distance')} data-when="distance">
            <span>Distance (m)</span>
            <input name="trigger.meters" type="number" min="0" step="10" value={t.kind === 'distance' ? String(t.meters) : ''} />
          </div>
          <div class={f(kind === 'elapsed')} data-when="elapsed">
            <span>Temps (s)</span>
            <input name="trigger.seconds" type="number" min="0" step="1" value={t.kind === 'elapsed' ? String(t.seconds) : ''} />
          </div>
          <div class={f(kind === 'split')} data-when="split">
            <span>Intervalle (m)</span>
            <input name="trigger.everyMeters" type="number" min="100" step="100" value={t.kind === 'split' ? String(t.everyMeters) : '1000'} />
          </div>
          <div class={f(kind === 'pace')} data-when="pace">
            <span>Plus lent que (s/km)</span>
            <input name="trigger.slowerThan" type="number" min="0" step="5" value={t.kind === 'pace' ? num(t.slowerThan) : ''} />
          </div>
          <div class={f(kind === 'pace')} data-when="pace">
            <span>Plus rapide que (s/km)</span>
            <input name="trigger.fasterThan" type="number" min="0" step="5" value={t.kind === 'pace' ? num(t.fasterThan) : ''} />
          </div>
          <div class={f(kind === 'pace')} data-when="pace">
            <span>À partir de (m)</span>
            <input name="trigger.afterMeters" type="number" min="0" step="100" value={t.kind === 'pace' ? String(t.afterMeters) : '1000'} />
          </div>
        </div>
        <div class="f">
          <span>Texte lu par la voix</span>
          <textarea name="text">{line.text}</textarea>
        </div>
        <div class="grid2">
          <div class="f">
            <span>Catégorie</span>
            <select name="category">
              {CATEGORIES.map((o) => (
                <option value={o.key} selected={o.key === line.category}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div class="f">
            <span>Mixage</span>
            <select name="mix">
              {MIXES.map((o) => (
                <option value={o.key} selected={o.key === line.mix}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div class="f">
            <span>Priorité (0-10)</span>
            <input name="priority" type="number" min="0" max="10" step="1" value={String(line.priority)} />
          </div>
          <div class="f">
            <span>Fichier</span>
            <input name="key" type="text" value={line.key} />
          </div>
          <div class="f">
            <span>Variables (modèle)</span>
            <input name="slots" type="text" value={(line.slots ?? []).join(', ')} placeholder="km, splitTime" />
          </div>
          <div class="f">
            <span>Répétition</span>
            <label class="check">
              <input name="once" type="checkbox" checked={line.once} /> une seule fois
            </label>
          </div>
        </div>
        <div class="row">
          <button class="btn btn-ghost" type="button" data-role="listen">Écouter</button>
          <button class="btn btn-ghost" type="button" data-role="render" disabled={!ttsReady}>
            Générer la voix
          </button>
          <button class="btn btn-ghost" type="button" data-role="duplicate">Dupliquer</button>
          <button class="btn btn-ghost" type="button" data-role="delete">Supprimer</button>
          <span class="ev-flag" data-role="id">{line.id}</span>
        </div>
      </div>
    </div>
  );
};
