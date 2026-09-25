import { addressLines, can, formatOfficialTime } from '@sivoov/shared';
import type { Access, Race } from '@sivoov/shared';
import type { InstructionsSent, RunnerDetail } from '../../db/runnerQueries';
import { MAX_INSTRUCTIONS_PER_DAY, sentInLastDay } from '../../db/runnerQueries';
import { ago, dateFr, dateTimeFr, distanceName, plural } from './format';
import { deviceText, presenceView } from './runnerPresence';
import type { FlashMessage } from './runners';
import { runnerHref } from './runners';
import { runStatusView } from './runStatus';
import { Badge, Card, ConfirmButton, Empty, Flash, Icon, KeyValues, PageHead } from './ui';

type Props = { race: Race; access: Access; runner: RunnerDetail; sent: InstructionsSent[]; flash?: FlashMessage; now?: Date };

const NBSP = String.fromCharCode(160);
const km = (m: number) => `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${NBSP}km`;

/** The one sentence that says where the runner is, and what to do about it. */
const whereText = (runner: RunnerDetail): string => {
  if (runner.presence.appSessions > 0) return 'Connecté dans l’application : il a ce qu’il faut pour courir.';
  if (runner.presence.sessions > 0) return 'Connecté sur le site, pas encore dans l’application. Pour courir, il doit installer l’application et s’y connecter.';
  return 'Pas encore connecté. Envoyez-lui les instructions : il recevra son dossard et la marche à suivre.';
};

/** One runner: who, where they stand with the app, their runs, and what the team can do. */
export const OrgRunnerPage = ({ race, access, runner, sent, flash, now = new Date() }: Props) => {
  const { entrant, presence } = runner;
  const base = `/org/${race.slug}`;
  const self = runnerHref(race.slug, entrant.bib);
  const editable = can(access, 'edit_runners');
  const p = presenceView(presence, now, race.timezone);
  const firstSeen = runner.sessions.map((s) => s.createdAt).sort()[0];
  const appVersion = presence.device?.appVersion;
  const sentToday = sentInLastDay(sent, now);
  return (
    <>
      {flash ? <Flash tone={flash.tone}>{flash.text}</Flash> : null}
      <PageHead
        back={{ href: `${base}/runners`, label: 'Coureurs' }}
        title={`${entrant.firstName} ${entrant.lastName.toUpperCase()}`}
        sub={
          <>
            Dossard <b class="num">{entrant.bib}</b> · {distanceName(entrant.distanceKey)}
          </>
        }
        actions={
          editable ? (
            <a class="btn" href={`${self}/edit`}>
              Modifier
            </a>
          ) : undefined
        }
      />
      <div class="grid main-side">
        <div>
          <Card title="Connexion" actions={<Badge tone={p.tone}>{p.label}</Badge>}>
            <p>{whereText(runner)}</p>
            {presence.sessions > 0 ? (
              <KeyValues
                rows={[
                  ['Téléphone', presence.device ? deviceText(presence.device) : presence.appSessions > 0 ? 'Pas encore connu' : 'Pas encore dans l’application'],
                  ...(appVersion ? ([['Version de l’application', appVersion]] as Array<[string, string]>) : []),
                  ['Dernière visite', presence.lastSeenAt ? ago(presence.lastSeenAt, now, race.timezone) : ''],
                  ['Première connexion', firstSeen ? dateTimeFr(firstSeen, race.timezone) : ''],
                ]}
              />
            ) : null}
          </Card>
          <Card title="Activités" sub={runner.runs.length > 0 ? plural(runner.runs.length, 'activité', 'activités') : undefined} flush>
            {runner.runs.length === 0 ? (
              <Empty title="Pas encore d’activité.">Ses courses apparaîtront ici dès qu’il aura couru ou envoyé son fichier.</Empty>
            ) : (
              <ul class="list">
                {runner.runs.map((r) => {
                  const status = runStatusView(r);
                  return (
                    <li>
                      <a href={`${base}/runs/${encodeURIComponent(r.id)}`}>
                        <div class="main">
                          <b>{dateTimeFr(r.at, race.timezone)}</b>
                          <span>
                            {distanceName(r.distanceKey)} · {km(r.distanceM)}
                          </span>
                        </div>
                        <div class="side">
                          {r.elapsedMs > 0 ? <span class="num">{formatOfficialTime(r.elapsedMs)}</span> : null}
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
        <div>
          <Card title="Coureur">
            <KeyValues
              rows={[
                ['Dossard', <span class="num">{entrant.bib}</span>],
                ['Nom', `${entrant.firstName} ${entrant.lastName.toUpperCase()}`],
                ['Email', <a href={`mailto:${entrant.email}`}>{entrant.email.split('@')[0]}@<wbr />{entrant.email.split('@').slice(1).join('@')}</a>],
                ['Distance', distanceName(entrant.distanceKey)],
                [entrant.source === 'import' ? 'Importé le' : 'Ajouté à la main le', dateFr(runner.createdAt, race.timezone)],
              ]}
            />
            {editable && runner.runs.length > 0 ? <p class="muted small">Ce coureur a une activité : il ne peut plus être supprimé. Pour qu’un temps ne compte pas, écartez l’activité depuis sa page.</p> : null}
          </Card>
          <Card
            title="Adresse pour la médaille"
            actions={editable ? <a href={`${self}/edit#adresse`}>{entrant.address ? 'Modifier' : 'Ajouter'}</a> : undefined}
          >
            {entrant.address ? (
              <p>
                {addressLines(entrant.address).map((line, i) => (
                  <>
                    {i > 0 ? <br /> : null}
                    {line}
                  </>
                ))}
              </p>
            ) : (
              <p class="muted">Pas encore d’adresse.</p>
            )}
          </Card>
          <Card title="Instructions par email" sub="Son dossard, l’adresse de la page de la course et comment se connecter.">
            {sent.length > 0 ? (
              <ul class="issues">
                {sent.slice(0, 5).map((s) => (
                  <li>
                    Envoyées {ago(s.at, now, race.timezone)} <span class="muted">par {s.by}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p class="muted">Pas encore envoyées depuis cette page.</p>
            )}
            {editable ? (
              <form method="post" action={`${self}/instructions`} class="form-actions">
                <button class={presence.sessions === 0 ? 'btn btn-primary' : 'btn'} type="submit" disabled={sentToday >= MAX_INSTRUCTIONS_PER_DAY}>
                  <Icon name="inbox" /> Envoyer les instructions
                </button>
                {sentToday >= MAX_INSTRUCTIONS_PER_DAY ? <span class="muted small">Déjà {MAX_INSTRUCTIONS_PER_DAY} envois aujourd’hui. Réessayez demain.</span> : null}
              </form>
            ) : null}
          </Card>
          {editable && runner.runs.length === 0 ? (
            <Card title="Supprimer ce coureur">
              <form method="post" action={`${self}/delete`}>
                <p>Il disparaît de la liste et ne peut plus se connecter. Pour une inscription en double ou annulée.</p>
                <div class="form-actions">
                  <ConfirmButton message={`Supprimer ${entrant.firstName} ${entrant.lastName.toUpperCase()}, dossard ${entrant.bib} ?`}>Supprimer</ConfirmButton>
                </div>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
};
