import type { Child } from 'hono/jsx';

/**
 * The admin's building blocks. A screen is a PageHead and a few Cards; it should not need
 * CSS of its own (adminStyles.ts holds it all, colors come from tokens.ts).
 */

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  runners: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7',
  activity: 'M3 12h4l3 8 4-16 3 8h4',
  audio: 'M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1',
  team: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  races: 'M4 21V4M4 4h13l-2 4 2 4H4',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11',
  check: 'M20 6 9 17l-5-5',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  plus: 'M12 5v14M5 12h14',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  play: 'M6 4l14 8-14 8z',
} as const;
export type IconName = keyof typeof ICONS;

export const Icon = ({ name }: { name: IconName }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={ICONS[name]} />
  </svg>
);

export const PageHead = ({ title, sub, back, actions }: { title: Child; sub?: Child; back?: { href: string; label: string }; actions?: Child }) => (
  <div class="ph">
    <div>
      {back ? (
        <a class="back" href={back.href}>
          ← {back.label}
        </a>
      ) : null}
      <h1>{title}</h1>
      {sub ? <p>{sub}</p> : null}
    </div>
    {actions ? <div class="actions">{actions}</div> : null}
  </div>
);

export const Card = ({ title, sub, actions, flush, id, children }: { title?: Child; sub?: Child; actions?: Child; flush?: boolean; id?: string; children: Child }) => (
  <section class={flush ? 'card flush' : 'card'} id={id}>
    {title || actions ? (
      <div class="card-h">
        <div>
          {title ? <h2>{title}</h2> : null}
          {sub ? <p>{sub}</p> : null}
        </div>
        {actions ?? null}
      </div>
    ) : null}
    {children}
  </section>
);

export const Stat = ({ label, value, hint, href, share }: { label: Child; value: Child; hint?: Child; href?: string; share?: number }) => {
  const body = (
    <>
      <div class="l">{label}</div>
      <div class="v">{value}</div>
      {hint ? <div class="h">{hint}</div> : null}
      {share !== undefined ? (
        <div class="bar" aria-hidden="true">
          <i style={`width:${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`}></i>
        </div>
      ) : null}
    </>
  );
  return href ? (
    <a class="stat" href={href}>
      {body}
    </a>
  ) : (
    <div class="stat">{body}</div>
  );
};

export const Badge = ({ tone = 'neutral', children }: { tone?: Tone; children: Child }) => <span class={`badge ${tone}`}>{children}</span>;

export const Flash = ({ tone = 'info', children }: { tone?: Tone; children: Child }) => (
  <div class={`flash ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
    {children}
  </div>
);

export const Empty = ({ title, children, action }: { title: Child; children?: Child; action?: Child }) => (
  <div class="empty-state">
    <b>{title}</b>
    {children ? <p>{children}</p> : null}
    {action ?? null}
  </div>
);

export const Field = ({ label, hint, error, for: htmlFor, children }: { label: Child; hint?: Child; error?: Child; for?: string; children: Child }) => (
  <div class={error ? 'field bad' : 'field'}>
    <label for={htmlFor}>
      {label} {hint ? <span class="hint">{hint}</span> : null}
    </label>
    {children}
    {error ? <span class="err">{error}</span> : null}
  </div>
);

export type Chip = { label: Child; href: string; on?: boolean; count?: number };

export const Chips = ({ items, label }: { items: Chip[]; label: string }) => (
  <nav class="chips" aria-label={label}>
    {items.map((i) => (
      <a href={i.href} class={i.on ? 'on' : ''} aria-current={i.on ? 'true' : undefined}>
        {i.label}
        {i.count !== undefined ? <span class="n">{i.count}</span> : null}
      </a>
    ))}
  </nav>
);

export type TodoItem = { done: boolean; label: Child; hint?: Child; action?: Child };

export const Checklist = ({ items }: { items: TodoItem[] }) => (
  <ul class="todo">
    {items.map((i) => (
      <li class={i.done ? 'done' : ''}>
        <span class="tick">{i.done ? <Icon name="check" /> : null}</span>
        <div>
          <b>{i.label}</b>
          {i.hint ? <span>{i.hint}</span> : null}
        </div>
        <div>{i.done ? null : (i.action ?? null)}</div>
      </li>
    ))}
  </ul>
);

export const KeyValues = ({ rows }: { rows: Array<[Child, Child]> }) => (
  <dl class="kv">
    {rows.map(([k, v]) => (
      <>
        <dt>{k}</dt>
        <dd>{v}</dd>
      </>
    ))}
  </dl>
);

/** A form button that asks before doing something that cannot be undone. */
export const ConfirmButton = ({ message, class: cls = 'btn btn-danger', children }: { message: string; class?: string; children: Child }) => (
  <button class={cls} type="submit" onclick={`return confirm(${JSON.stringify(message)})`}>
    {children}
  </button>
);
