import type { RunVerdict } from '@sivoov/shared';
import type { Exclusion } from '../../db/runQueries';
import { dateTimeFr } from './format';
import { EXCLUDE_REASONS } from './runsCopy';
import { Card, Choices, ConfirmButton, Field } from './ui';

/** The card's anchor: on a phone it sits far down the page, so the header links to it. */
export const REVIEW_ID = 'revue';

/** Whether the review card has something to offer: bring an excluded time back, or set a counting one aside. */
export const hasReview = (verdict: RunVerdict, exclusion: Exclusion | null): boolean => exclusion !== null || verdict === 'counts';

/** What the set-aside form sends back when it has to be shown again. */
export type ReviewForm = { reason?: string; note: string; errors: { reason?: string; note?: string } };

type Props = {
  action: string;
  verdict: RunVerdict;
  exclusion: Exclusion | null;
  /** Whether the run reached the line for real, so that bringing it back puts it in the results. */
  countsIfRestored: boolean;
  timezone: string;
  form?: ReviewForm;
};

/**
 * Set a time aside, or bring it back. Only for people who may review runs (the route checks
 * too). A time that does not count anyway (a test, a stop before the line) has nothing to review.
 */
export const ReviewCard = ({ action, verdict, exclusion, countsIfRestored, timezone, form }: Props) => {
  if (exclusion) {
    return (
      <Card id={REVIEW_ID} title="Temps écarté" sub={`Le ${dateTimeFr(exclusion.at, timezone)} par ${exclusion.by}.`}>
        <p class="small" style="margin-bottom:14px">
          Motif : {exclusion.reason}
        </p>
        <form method="post" action={`${action}/restore`}>
          <button class="btn btn-primary btn-block" type="submit">
            Rétablir ce temps
          </button>
        </form>
        {countsIfRestored ? (
          <p class="small muted" style="margin-top:10px">
            Il comptera de nouveau dans les résultats et les téléchargements.
          </p>
        ) : null}
      </Card>
    );
  }
  if (!hasReview(verdict, exclusion)) return null;
  return (
    <Card id={REVIEW_ID} title="Écarter ce temps" sub="S’il n’est pas valable, retirez-le des résultats. Vous pourrez le rétablir.">
      <form method="post" action={`${action}/exclude`}>
        <Choices
          legend="Motif"
          name="reason"
          options={EXCLUDE_REASONS.map((r) => ({ value: r.value, label: r.label }))}
          value={form?.reason}
          error={form?.errors.reason}
        />
        <Field label="Note" hint="facultatif, pour votre équipe" for="exclude-note" error={form?.errors.note}>
          <textarea id="exclude-note" name="note" maxlength={500} rows={3} style="min-height:80px">
            {form?.note ?? ''}
          </textarea>
        </Field>
        <ConfirmButton message="Ce temps va disparaître des résultats publics. Vous pourrez le rétablir." class="btn btn-danger btn-block">
          Écarter ce temps
        </ConfirmButton>
      </form>
    </Card>
  );
};
