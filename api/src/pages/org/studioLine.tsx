import { AUDIO_TAGS, CUE_WORDS, CueMomentSchema, PLACEHOLDERS, editorFromTrigger, speechSeconds, stripAudioTags } from '@sivoov/shared';
import type { ScriptLine } from '@sivoov/shared';
import type { LineStatus } from '../../lib/studio';
import {
  ADVANCED_HINTS,
  AI_PROMPT_PLACEHOLDER,
  CATEGORY_OPTIONS,
  FALLBACK_HINT,
  PERSONAL_OPTIONS,
  PHASE_COPY,
  PRIORITY_OPTIONS,
  SOUND_OPTIONS,
  TEMPLATE_PLACEHOLDER,
  WHEN_OPTIONS,
  textMeasure,
} from './studioCopy';
import { Field, Icon } from './ui';

type Props = { line: ScriptLine; status: LineStatus; canEdit: boolean; ttsReady: boolean; aiReady: boolean; tags: boolean };

/** What the runner hears, as the editor offers it: the voice, a personal line, or the organizer's file. */
export type SoundMode = 'voice' | 'personal' | 'file';
export const soundModeOf = (line: Pick<ScriptLine, 'audio' | 'personal'>): SoundMode => (line.audio ? 'file' : line.personal ? 'personal' : 'voice');

/** What the collapsed row says under the title: the first words everyone hears, the personal sentence, or the file. */
export const excerptOf = (line: ScriptLine): string => {
  if (line.audio) return `Votre fichier : ${line.audio.name || 'son importé'}`;
  if (line.personal?.kind === 'template') return line.personal.template;
  if (line.personal?.kind === 'ai') return `IA : ${line.personal.prompt}`;
  return stripAudioTags(line.text);
};

/** The start ceremony's moments, in the order they play. */
const CUE_MOMENTS = CueMomentSchema.options;

const ACCEPT = '.mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav';

/** Buttons that insert a placeholder or a tag at the caret; the client script does the inserting. */
const Inserts = ({ role, groups, off }: { role: string; groups: { title: string; items: { insert: string; label: string; hint: string }[] }[]; off: boolean }) => (
  <div class="inserts" data-role={role}>
    {groups.map((g) => (
      <div class="ins-group">
        <span class="ins-h">{g.title}</span>
        {g.items.map((i) => (
          <button type="button" class="ins" data-insert={i.insert} title={i.hint} disabled={off}>
            {i.label}
          </button>
        ))}
      </div>
    ))}
  </div>
);

const FIELD_GROUPS = [
  { title: 'Connus avant le départ', items: PLACEHOLDERS.filter((p) => p.phase === 'prepare').map((p) => ({ insert: `{${p.key}}`, label: `{${p.key}}`, hint: `${p.label} : ${p.hint}` })) },
  { title: 'Connus pendant la course', items: PLACEHOLDERS.filter((p) => p.phase === 'live').map((p) => ({ insert: `{${p.key}}`, label: `{${p.key}}`, hint: `${p.label} : ${p.hint}` })) },
];

const TAG_GROUPS = [
  {
    title: 'Jeu de la voix',
    items: [...AUDIO_TAGS.map((t) => ({ insert: `[${t.tag}] `, label: t.label, hint: `[${t.tag}] : la voix joue la suite ainsi` })), { insert: '… ', label: 'Pause', hint: 'Les points de suspension marquent un temps.' }],
  },
];

/** Shown only for the modes listed (space-separated): the client toggles them when the mode changes. */
const forModes = (modes: string, mode: SoundMode): string => (modes.split(' ').includes(mode) ? '' : 'hide');

/**
 * One announcement: the row (when, title, first words, status, a play button), then the
 * editor, simple first: Quand, then what the runner hears (the voice, personalised, or your
 * file), the text with its chips, then everything else under "Réglages avancés". Plain inputs,
 * no framework: the client script reads them by name, turns km and minutes into the meters and
 * seconds the script stores, and saves the whole script. Field ids are prefixed with the line
 * id; the client rewrites them when it clones the template for a new line.
 */
export const StudioLine = ({ line, status, canEdit, ttsReady, aiReady, tags }: Props) => {
  const when = editorFromTrigger(line.trigger);
  const p = `${line.id}-`;
  const off = !canEdit;
  const mode = soundModeOf(line);
  const pkind = line.personal?.kind ?? 'template';
  const phase = status.personal ? (status.personal.kind === 'ai' ? 'ai' : status.personal.phase) : 'prepare';
  const show = (kind: string | string[]) => ([kind].flat().includes(line.trigger.kind) ? '' : 'hide');
  return (
    <div class="ev" data-line={line.id} data-audio={line.audio ? JSON.stringify(line.audio) : ''} data-mode={mode}>
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
          <div data-when="cue" class={show('cue')}>
            <Field label="Moment" hint="sur la ligne, puis le compte à rebours ; le coup de pistolet lance le chrono" for={`${p}cueAt`}>
              <select id={`${p}cueAt`} name="when.cueAt" disabled={off}>
                {CUE_MOMENTS.map((m) => (
                  <option value={m} selected={m === when.cueAt}>
                    {CUE_WORDS[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ordre" hint="dans ce moment : 1, 2, 3…" for={`${p}cueOrder`}>
              <input id={`${p}cueOrder`} name="when.cueOrder" type="text" inputmode="numeric" value={when.cueOrder} disabled={off} />
            </Field>
          </div>
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

        <fieldset class="ev-sound">
          <legend>Ce que le coureur entend</legend>
          <div class="seg" role="radiogroup" aria-label="Ce que le coureur entend">
            {SOUND_OPTIONS.map((o) => (
              <label class="seg-opt" title={o.hint}>
                <input type="radio" name={`${p}sound`} data-role="sound" value={o.key} checked={o.key === mode} disabled={off} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
          <p class="hint" data-role="sound-hint">
            {SOUND_OPTIONS.find((o) => o.key === mode)?.hint}
          </p>
        </fieldset>

        <div data-sound="personal" class={forModes('personal', mode)}>
          <div class="seg seg-sm" role="radiogroup" aria-label="Comment la phrase est faite">
            {PERSONAL_OPTIONS.map((o) => (
              <label class="seg-opt" title={o.hint}>
                <input type="radio" name={`${p}pkind`} data-role="pkind" value={o.key} checked={o.key === pkind} disabled={off} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
          <div data-pkind="template" class={pkind === 'template' ? '' : 'hide'}>
            <Field label="Phrase personnalisée" hint="les champs entre accolades sont remplis pour chaque coureur" for={`${p}template`}>
              <textarea id={`${p}template`} name="personal.template" placeholder={TEMPLATE_PLACEHOLDER} disabled={off}>
                {line.personal?.kind === 'template' ? line.personal.template : ''}
              </textarea>
            </Field>
            <Inserts role="fields" groups={FIELD_GROUPS} off={off} />
          </div>
          <div data-pkind="ai" class={pkind === 'ai' ? '' : 'hide'}>
            <Field label="Consigne pour l’IA" hint="ce qu’elle doit dire, le ton, la longueur" for={`${p}prompt`}>
              <textarea id={`${p}prompt`} name="personal.prompt" placeholder={AI_PROMPT_PLACEHOLDER} disabled={off}>
                {line.personal?.kind === 'ai' ? line.personal.prompt : ''}
              </textarea>
            </Field>
            {aiReady ? null : <p class="hint">L’IA n’est pas configurée sur ce serveur : chaque coureur entendra la version hors ligne.</p>}
          </div>
          <p class="ev-phase" data-role="phase">
            {PHASE_COPY[phase]}
          </p>
          <div class="ev-sample" data-role="sample" hidden>
            <span class="ev-sample-h">Camille Martin, dossard 1247, de Lyon, entend :</span>
            <q data-role="sample-text"></q>
          </div>
          <div class="ev-actions">
            <button type="button" class="btn btn-sm" data-role="sample-play">
              <Icon name="play" /> Écouter un exemple
            </button>
          </div>
        </div>

        <div data-sound="file" class={forModes('file', mode)}>
          <div class="ev-file" data-role="file" hidden={!line.audio}>
            <p>
              <b data-role="file-name">{line.audio?.name || 'Votre fichier'}</b> est joué à la place de la voix.
            </p>
          </div>
          {canEdit ? (
            <label class="btn btn-sm" data-role="upload-label">
              <Icon name="upload" /> <span data-role="upload-word">{line.audio ? 'Remplacer le fichier' : 'Choisir un fichier audio'}</span>
              <input class="sr" type="file" data-role="upload" accept={ACCEPT} />
            </label>
          ) : null}
          <p class="hint">MP3, M4A ou WAV, 5 Mo au plus. Le son est joué tel quel, du début à la fin.</p>
        </div>

        <div data-sound="voice personal" class={forModes('voice personal', mode)}>
          <Field
            label={<span data-role="text-label">{mode === 'personal' ? 'Version hors ligne' : 'Texte lu'}</span>}
            hint={<span data-role="text-hint">{mode === 'personal' ? FALLBACK_HINT : 'écrivez comme vous parlez'}</span>}
            for={`${p}text`}
          >
            <textarea id={`${p}text`} name="text" disabled={off}>
              {line.text}
            </textarea>
          </Field>
          {tags ? <Inserts role="tags" groups={TAG_GROUPS} off={off} /> : null}
          <p class="ev-measure" data-role="measure">
            {textMeasure(stripAudioTags(line.text).length, speechSeconds(line.text))}
          </p>
        </div>

        <ul class="ev-issues" data-role="issues">
          {status.problems.map((problem) => (
            <li>{problem}</li>
          ))}
        </ul>

        <div class="ev-suggest" data-role="suggestion" hidden>
          <span class="ev-sample-h">Proposition de l’IA, à relire :</span>
          <p data-role="suggestion-text"></p>
          <div class="ev-actions">
            <button type="button" class="btn btn-sm btn-primary" data-role="suggestion-use">
              Utiliser ce texte
            </button>
            <button type="button" class="btn btn-sm btn-quiet" data-role="suggestion-drop">
              Ignorer
            </button>
          </div>
        </div>

        <div class="ev-actions">
          <button type="button" class="btn btn-sm" data-role="listen">
            <Icon name="play" /> <span data-role="listen-word">{mode === 'personal' ? 'Écouter hors ligne' : 'Écouter'}</span>
          </button>
          {canEdit ? (
            <>
              <button type="button" class="btn btn-sm" data-role="render" hidden={mode === 'file'} disabled={!ttsReady || status.rendered}>
                {status.rendered ? 'Voix enregistrée' : 'Enregistrer la voix'}
              </button>
              {aiReady ? (
                <button type="button" class="btn btn-sm" data-role="suggest" hidden={mode === 'file'}>
                  Proposer un texte
                </button>
              ) : null}
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
            <Field label="Nom du fichier" hint={ADVANCED_HINTS.key} for={`${p}key`}>
              <input id={`${p}key`} name="key" type="text" value={line.key} disabled={off} />
            </Field>
          </div>
        </details>
      </div>
    </div>
  );
};
