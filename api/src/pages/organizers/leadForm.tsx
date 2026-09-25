import type { Child } from 'hono/jsx';
import { translator } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';

export const LEAD_FIELDS = ['name', 'email', 'race', 'message'] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];

/** The contact form, empty, sent back with what was typed and what is wrong, or sent. */
export type LeadFormState =
  | { step: 'form'; values: Partial<Record<LeadField, string>>; errors: LeadField[]; tooMany?: boolean }
  | { step: 'sent'; name: string };

type Props = { locale: Locale; state: LeadFormState; action: string; examplePath: string };

export const LeadForm = ({ locale, state, action, examplePath }: Props) => {
  const t = translator(locale);
  if (state.step === 'sent') {
    return (
      <div class="lead-sent" role="status">
        <h3>{t('organizers.contact.thanks.title', { name: state.name })}</h3>
        <p>{t('organizers.contact.thanks.body')}</p>
        <p>
          <a href={examplePath}>{t('organizers.contact.thanks.example')}</a>
        </p>
      </div>
    );
  }
  const invalid = (field: LeadField) => state.errors.includes(field);
  /** Label, control, and the field's own error under it, wired together for screen readers. */
  const field = (name: LeadField, label: string, control: (attrs: Record<string, string | undefined>) => Child) => (
    <div class={invalid(name) ? 'field invalid' : 'field'}>
      <label for={`lead-${name}`}>{label}</label>
      {control({ id: `lead-${name}`, name, 'aria-invalid': invalid(name) ? 'true' : undefined, 'aria-describedby': invalid(name) ? `lead-${name}-error` : undefined })}
      {invalid(name) ? (
        <p class="field-error" id={`lead-${name}-error`}>
          {t(`organizers.contact.error.${name}`)}
        </p>
      ) : null}
    </div>
  );
  return (
    <form class="lead-form" method="post" action={action}>
      {state.tooMany ? (
        <div class="error" role="alert">
          {t('organizers.contact.tooMany')}
        </div>
      ) : state.errors.length > 0 ? (
        <div class="error" role="alert">
          {t('organizers.contact.error')}
        </div>
      ) : null}
      <div class="field-row">
        {field('name', t('organizers.contact.name'), (a) => <input {...a} autocomplete="name" required maxlength={120} value={state.values.name ?? ''} />)}
        {field('email', t('organizers.contact.email'), (a) => <input {...a} type="email" autocomplete="email" required value={state.values.email ?? ''} />)}
      </div>
      {field('race', t('organizers.contact.race'), (a) => <input {...a} autocomplete="organization" required maxlength={160} value={state.values.race ?? ''} />)}
      {field('message', t('organizers.contact.message'), (a) => (
        <textarea {...a} rows={4} maxlength={4000} placeholder={t('organizers.contact.messageHint')}>
          {state.values.message ?? ''}
        </textarea>
      ))}
      {/* Left empty by people, filled in by bots: a filled one is thanked and dropped. */}
      <div class="hp" aria-hidden="true">
        <label for="lead-website">{t('organizers.contact.honeypot')}</label>
        <input id="lead-website" name="website" tabindex={-1} autocomplete="off" />
      </div>
      <button class="btn btn-ink" type="submit">
        {t('organizers.contact.send')}
      </button>
      <p class="hint">{t('organizers.contact.privacy')}</p>
    </form>
  );
};
