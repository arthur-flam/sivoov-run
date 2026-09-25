import { editorFromTrigger, speechSeconds } from '@sivoov/shared';
import type { ScriptLine } from '@sivoov/shared';
import type { LineStatus } from '../../lib/studio';
import { ADVANCED_HINTS, CATEGORY_OPTIONS, PRIORITY_OPTIONS, WHEN_OPTIONS, textMeasure } from './studioCopy';
import { Field, Icon } from './ui';

type Props = { line: ScriptLine; status: LineStatus; canEdit: boolean; ttsReady: boolean };

/** What the collapsed row says under the title: the first words of the text, or the file played instead. */
export const excerptOf = (line: ScriptLine): string => (line.audio ? `Votre fichier : ${line.audio.name || 'son importé'}` : line.text);

const ACCEPT = '.mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav';

/**
 * One announcement: the row (when, title, first words, status, a play button), then the
 * editor, simple first (Quand, Texte lu, the sound), everything else under "Réglages avancés".
 * Plain inputs, no framework: the client script reads them by name, turns km and minutes into
 * the meters and seconds the script stores, and saves the whole script. Field ids are prefixed
 * with the line id; the client rewrites them when it clones the template for a new line.
 */
export const StudioLine = ({ line, status, canEdit, ttsReady }: Props) => {
  const when = editorFromTrigger(line.trigger);
  const p = `${line.id}-`;
  const off = !canEdit;
  const show = (kind: string | string[]) => ([kind].flat().includes(line.trigger.kind) ? '' : 'hide');
  return (
    <div class="ev" data-line={line.id} data-audio={line.audio ? JSON.stringify(line.audio) : ''}>
      <div class="ev-top">
        <button type="button" class="ev-open" data-role="toggle" aria-expanded="false">
          <span class="ev-when" data-role="when">
            {status.when}
          </span>
          <span class="ev-main">
            <b class="ev-name" data-role="name">
              {line.title || 'Sans titre'}
            </b>
            <span class="ev-excerpt" data-role="excerpt">
              {excerptOf(line)}
            </span>
          </span>
        </button>
        <span class={`badge ${status.tone}`} data-role="flag">
          {status.label}
        </span>
        <button type="button" class="ev-play" data-role="listen" aria-label="Écouter" title="Écouter">
          <Icon name="play" />
        </button>
      </div>
      <div class="ev-body">
        <Field label="Titre" hint="pour vous repérer dans la liste" for={`${p}title`}>
          <input id={`${p}title`} name="title" type="text" value={line.title} disabled={off} />
        </Field>
        <div class="form-grid two">
          <Field label="Quand" for={`${p}kind`}>
            <select id={`${p}kind`} name="when.kind" disabled={off}>
              {WHEN_OPTIONS.map((o) => (
                <option value={o.key} selected={o.key === line.trigger.kind}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <div data-when="distance" class={show('distance')}>
            <Field label="Au kilomètre" hint="par exemple 5,2" for={`${p}km`}>
              <input id={`${p}km`} name="when.km" type="text" inputmode="decimal" value={when.km} disabled={off} />
            </Field>
          </div>
          <div data-when="elapsed" class={show('elapsed')}>
            <Field label="Après combien de minutes" hint="par exemple 90" for={`${p}minutes`}>
              <input id={`${p}minutes`} name="when.minutes" type="text" inputmode="decimal" value={when.minutes} disabled={off} />
            </Field>
          </div>
          <div data-when="split" class={show('split')}>
            <Field label="Tous les combien de km" hint="1 pour chaque km" for={`${p}every`}>
              <input id={`${p}every`} name="when.everyKm" type="text" inputmode="decimal" value={when.everyKm} disabled={off} />
            </Field>
          </div>
          <div data-when="pace" class={show('pace')}>
            <Field label="S’il court plus lentement que" hint="en min/km, par exemple 6:30" for={`${p}slower`}>
              <input id={`${p}slower`} name="when.slowerThan" type="text" inputmode="numeric" value={when.slowerThan} disabled={off} />
            </Field>
          </div>
          <div data-when="pace" class={show('pace')}>
            <Field label="Ou plus vite que" hint="en min/km, facultatif" for={`${p}faster`}>
              <input id={`${p}faster`} name="when.fasterThan" type="text" inputmode="numeric" value={when.fasterThan} disabled={off} />
            </Field>
          </div>
          <div data-when="pace" class={show('pace')}>
            <Field label="À partir du km" for={`${p}after`}>
              <input id={`${p}after`} name="when.afterKm" type="text" inputmode="decimal" value={when.afterKm} disabled={off} />
            </Field>
          </div>
        </div>
        <p class="ev-err" data-role="when-error" hidden></p>
        <div class="ev-file" data-role="file" hidden={!line.audio}>
          <p>
            <b data-role="file-name">{line.audio?.name || 'Votre fichier'}</b> est joué à la place de la voix. Le texte ci-dessous sert seulement de repère.
          </p>
          {canEdit ? (
            <button type="button" class="btn btn-sm" data-role="unfile">
              Revenir à la voix
            </button>
          ) : null}
        </div>
        <Field label="Texte lu" hint="écrivez comme vous parlez" for={`${p}text`}>
          <textarea id={`${p}text`} name="text" disabled={off}>
            {line.text}
          </textarea>
        </Field>
        <p class="ev-measure" data-role="measure">
          {textMeasure(line.text.trim().length, speechSeconds(line.text))}
        </p>
        <div class="ev-actions">
          <button type="button" class="btn btn-sm" data-role="listen">
            <Icon name="play" /> Écouter
          </button>
          {canEdit ? (
            <>
              <button type="button" class="btn btn-sm" data-role="render" hidden={status.source !== 'voice'} disabled={!ttsReady || status.rendered}>
                {status.rendered ? 'Voix enregistrée' : 'Enregistrer la voix'}
              </button>
              <label class="btn btn-sm" data-role="upload-label" hidden={Boolean(line.audio)}>
                <Icon name="upload" /> Utiliser un fichier audio
                <input class="sr" type="file" data-role="upload" accept={ACCEPT} />
              </label>
              <button type="button" class="btn btn-sm btn-quiet" data-role="duplicate">
                Dupliquer
              </button>
              <button type="button" class="btn btn-sm btn-quiet ev-delete" data-role="delete">
                Supprimer
              </button>
            </>
          ) : null}
        </div>
        <details class="disclose ev-adv">
          <summary>Réglages avancés</summary>
          <div>
            <Field label="Type d’annonce" hint={ADVANCED_HINTS.category} for={`${p}category`}>
              <select id={`${p}category`} name="category" disabled={off}>
                {CATEGORY_OPTIONS.map((o) => (
                  <option value={o.key} selected={o.key === line.category}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Si une autre annonce joue déjà" hint={ADVANCED_HINTS.mix} for={`${p}mix`}>
              <select id={`${p}mix`} name="mix" disabled={off}>
                {/* Queued behind the current one: 'duck' and 'wait' play the same way today, so one choice keeps whichever is stored. */}
                <option value={line.mix === 'wait' ? 'wait' : 'duck'} selected={line.mix !== 'interrupt'}>
                  Attendre qu’elle se termine
                </option>
                <option value="interrupt" selected={line.mix === 'interrupt'}>
                  La couper et passer tout de suite
                </option>
              </select>
            </Field>
            <Field label="Importance" hint={ADVANCED_HINTS.priority} for={`${p}priority`}>
              <select id={`${p}priority`} name="priority" disabled={off}>
                {PRIORITY_OPTIONS.map((o) => (
                  <option value={String(o.value)} selected={o.value === line.priority}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <div data-when="pace" class={show('pace')}>
              <div class="field">
                <label class="check">
                  <input name="repeat" type="checkbox" checked={!line.once} disabled={off} /> Répéter le conseil à chaque km tant que l’allure reste hors limites
                </label>
                <span class="hint">{ADVANCED_HINTS.repeat}</span>
              </div>
            </div>
            <Field label="Parties variables" hint={ADVANCED_HINTS.slots} for={`${p}slots`}>
              <input id={`${p}slots`} name="slots" type="text" value={(line.slots ?? []).join(', ')} placeholder="Aucune" disabled={off} />
            </Field>
            <Field label="Nom du fichier" hint={ADVANCED_HINTS.key} for={`${p}key`}>
              <input id={`${p}key`} name="key" type="text" value={line.key} disabled={off} />
            </Field>
          </div>
        </details>
      </div>
    </div>
  );
};
