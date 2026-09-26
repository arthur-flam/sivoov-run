import Anthropic from '@anthropic-ai/sdk';
import { stripAudioTags } from '@sivoov/shared';
import { personalLineSystem, personalLineUser } from './prompts/personalLine';
import type { PersonalLineBrief } from './prompts/personalLine';
import { suggestSystem, suggestUser } from './prompts/suggestLine';
import type { SuggestBrief } from './prompts/suggestLine';

/**
 * The few sentences written per runner (an `ai` personal line) and the studio's « Proposer un
 * texte », never during the run. Every call goes through Cloudflare AI Gateway (`AI_GATEWAY`,
 * "sivoov"), never to a provider directly: the gateway logs, caches and rate-limits, and holds
 * the provider keys. The Worker only has `CLOUDFLARE_AI_TOKEN`.
 * - Claude first, on the gateway's Anthropic route. The Worker sends no Anthropic key: the
 *   gateway supplies it (a provider key stored in the gateway, or Cloudflare's unified billing).
 * - When Claude cannot be reached that way (no key in the gateway yet, an outage), a Workers AI
 *   model on the same gateway writes the line instead.
 * Any other failure is null: the caller plays the offline version.
 */
export const CLAUDE_MODEL = 'claude-opus-5';
/** Fast, good French, answers in plain text (the reasoning models tried spent their budget thinking). */
export const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export type Writer = 'claude' | 'workers-ai';
export type Written = { text: string; writer: Writer };

export type LlmDeps = { accountId: string; gateway: string; token: string; fetchImpl?: typeof fetch };

export const gatewayBase = (deps: Pick<LlmDeps, 'accountId' | 'gateway'>): string => `https://gateway.ai.cloudflare.com/v1/${deps.accountId}/${deps.gateway}`;

/** 'refused' is Claude's own no (after its server-side fallbacks): it is not handed to another model. */
type Attempt = { text: string } | 'refused' | 'unavailable';

const viaClaude = async (deps: LlmDeps, system: string, user: string): Promise<Attempt> => {
  const client = new Anthropic({
    apiKey: null,
    baseURL: `${gatewayBase(deps)}/anthropic`,
    // No x-api-key: the gateway adds the key it holds. It only needs to know the call is ours.
    defaultHeaders: { 'x-api-key': null, 'cf-aig-authorization': `Bearer ${deps.token}` },
    ...(deps.fetchImpl ? { fetch: deps.fetchImpl } : {}),
    maxRetries: 1,
    timeout: 25_000,
  });
  try {
    const message = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      // A declined request is re-run on a fallback model inside the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // One or two sentences: low effort keeps it quick without changing the model.
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (message.stop_reason === 'refusal') return 'refused';
    const text = message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim();
    return text.length > 0 ? { text } : 'unavailable';
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.warn('llm claude', error.status, error.message.slice(0, 200));
    else console.warn('llm claude', String(error).slice(0, 200));
    return 'unavailable';
  }
};

/** Workers AI's OpenAI-compatible chat, on the same gateway. */
const viaWorkersAi = async (deps: LlmDeps, system: string, user: string): Promise<string | null> => {
  const call = deps.fetchImpl ?? fetch;
  try {
    const res = await call(`${gatewayBase(deps)}/workers-ai/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${deps.token}`, 'cf-aig-authorization': `Bearer ${deps.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: WORKERS_AI_MODEL,
        max_tokens: 600,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      console.warn('llm workers-ai', res.status, (await res.text().catch(() => '')).slice(0, 200));
      return null;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    const text = body.choices?.[0]?.message?.content?.trim() ?? '';
    return text.length > 0 ? text : null;
  } catch (error) {
    console.warn('llm workers-ai', String(error).slice(0, 200));
    return null;
  }
};

/** One short text, by Claude when the gateway can reach it, by Workers AI otherwise. */
const complete = async (deps: LlmDeps, system: string, user: string): Promise<Written | null> => {
  const claude = await viaClaude(deps, system, user);
  if (claude === 'refused') return null;
  if (claude !== 'unavailable') return { text: claude.text, writer: 'claude' };
  const text = await viaWorkersAi(deps, system, user);
  return text === null ? null : { text, writer: 'workers-ai' };
};

/**
 * What the model wrote, made safe to read aloud: no quotes around it, no braces the voice
 * would read, no tags for a voice that does not take them, and nothing far past the length
 * asked for (a runaway answer is worse than the offline version).
 */
export const cleanLine = (raw: string, brief: Pick<PersonalLineBrief, 'tags' | 'maxChars'>): string | null => {
  const unquoted = raw
    .trim()
    .replace(/^["«“]\s*|\s*["»”]$/g, '')
    .replace(/[{}<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const text = brief.tags ? unquoted : stripAudioTags(unquoted);
  return text.length === 0 || text.length > brief.maxChars * 1.5 ? null : text;
};

const cleaned = (written: Written | null, brief: Pick<PersonalLineBrief, 'tags' | 'maxChars'>): Written | null => {
  const text = written ? cleanLine(written.text, brief) : null;
  return written && text ? { text, writer: written.writer } : null;
};

/** One personal announcement for one runner, or null: the offline version plays. */
export const writePersonalLine = async (deps: LlmDeps, brief: PersonalLineBrief): Promise<Written | null> =>
  cleaned(await complete(deps, personalLineSystem(brief), personalLineUser(brief)), brief);

/** How long an AI line may be: room for a name and a town beyond the offline version, never a speech. */
export const maxCharsFor = (fallback: string): number => Math.max(160, Math.min(420, Math.round(fallback.trim().length * 1.4)));

/** The studio's « Proposer un texte »: a draft for the organizer to edit, or null. */
export const suggestLine = async (deps: LlmDeps, brief: SuggestBrief): Promise<Written | null> =>
  cleaned(await complete(deps, suggestSystem(brief.tags), suggestUser(brief)), { tags: brief.tags, maxChars: 420 });
