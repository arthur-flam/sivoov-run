import Anthropic from '@anthropic-ai/sdk';
import { stripAudioTags } from '@sivoov/shared';
import { personalLineSystem, personalLineUser } from './prompts/personalLine';
import type { PersonalLineBrief } from './prompts/personalLine';
import { suggestSystem, suggestUser } from './prompts/suggestLine';
import type { SuggestBrief } from './prompts/suggestLine';

/**
 * Claude, for the few sentences that are written per runner (an `ai` personal line) and for
 * the studio's "Proposer un texte". Never during the run: a line is written while the phone
 * still has a network, rendered, downloaded, and its offline version stands behind it.
 * Through Cloudflare AI Gateway when `AI_GATEWAY` names one (logs, rate limits, provider
 * switching are configuration there). Any failure is null: the caller plays the offline version.
 */
export const LLM_MODEL = 'claude-opus-5';

export type LlmDeps = { apiKey: string; accountId?: string; gateway?: string; fetchImpl?: typeof fetch };

const client = (deps: LlmDeps): Anthropic =>
  new Anthropic({
    apiKey: deps.apiKey,
    ...(deps.gateway && deps.accountId ? { baseURL: `https://gateway.ai.cloudflare.com/v1/${deps.accountId}/${deps.gateway}/anthropic` } : {}),
    ...(deps.fetchImpl ? { fetch: deps.fetchImpl } : {}),
    maxRetries: 1,
    timeout: 25_000,
  });

/** One short text from a system prompt and a user message, or null (refusal, error, empty). */
const complete = async (deps: LlmDeps, system: string, user: string): Promise<string | null> => {
  try {
    const message = await client(deps).beta.messages.create({
      model: LLM_MODEL,
      max_tokens: 4000,
      // A declined request is re-run on a fallback model inside the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // One or two sentences: low effort keeps it quick without changing the model.
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (message.stop_reason === 'refusal') return null;
    const text = message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim();
    return text.length > 0 ? text : null;
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.warn('llm', error.status, error.message.slice(0, 200));
    else console.warn('llm', String(error).slice(0, 200));
    return null;
  }
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

/** One personal announcement for one runner, or null: the offline version plays. */
export const writePersonalLine = async (deps: LlmDeps, brief: PersonalLineBrief): Promise<string | null> => {
  const raw = await complete(deps, personalLineSystem(brief), personalLineUser(brief));
  return raw === null ? null : cleanLine(raw, brief);
};

/** How long an AI line may be: room for a name and a town beyond the offline version, never a speech. */
export const maxCharsFor = (fallback: string): number => Math.max(160, Math.min(420, Math.round(fallback.trim().length * 1.4)));

/** The studio's "Proposer un texte": a draft for the organizer to edit, or null. */
export const suggestLine = async (deps: LlmDeps, brief: SuggestBrief): Promise<string | null> => {
  const raw = await complete(deps, suggestSystem(brief.tags), suggestUser(brief));
  return raw === null ? null : cleanLine(raw, { tags: brief.tags, maxChars: 420 });
};
