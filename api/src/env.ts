/** Worker bindings: generated Env (wrangler types) plus optional vars/secrets. */
export type Bindings = Env & {
  EMAIL_FROM?: string;
  /** Fixed sign-in code accepted for test accounts only (local and preview). See docs/ACCESS.md. */
  TEST_CODE?: string;
  /** Mapbox public token (pk.) for the Static Images API, `wrangler secret put MAPBOX_TOKEN`. */
  MAPBOX_TOKEN?: string;
  /**
   * ElevenLabs key used by the organizer studio to render script lines to MP3
   * (`wrangler secret put ELEVENLABS_API_TOKEN`, and `.dev.vars` locally). Optional: without
   * it the studio still writes, plays back with the browser voice and refuses to render.
   */
  ELEVENLABS_API_TOKEN?: string;
  /**
   * Google Gemini API key, for Gemini voices (native French TTS), called through the AI Gateway
   * like every model (`wrangler secret put GEMINI_API_KEY`). Optional: without it a script on a
   * Gemini voice plays its recorded files and the offline versions of personal lines.
   */
  GEMINI_API_KEY?: string;
  /**
   * Cloudflare API token with Workers AI (and AI Gateway run) rights, for every LLM call: the AI
   * personal lines and the studio's « Proposer un texte » go through the AI Gateway below, never
   * to a provider directly (lib/llm.ts). `wrangler secret put CLOUDFLARE_AI_TOKEN`. Optional:
   * without it those lines play their offline version and the studio says why.
   */
  CLOUDFLARE_AI_TOKEN?: string;
  /** The Cloudflare AI Gateway every LLM call goes through ("sivoov"). A wrangler var. */
  AI_GATEWAY?: string;
  /** Comma-separated emails of Sivoov staff: every race in /org, and race creation. A wrangler var. */
  STAFF_EMAILS?: string;
  /**
   * When set (preview), real email goes only to these addresses or `@domains`, comma-separated;
   * everything else is logged. Production leaves it unset.
   */
  MAIL_ALLOWLIST?: string;
  /**
   * Cloudflare Browser Rendering, which photographs the share cards into PNGs (lib/cards.ts).
   * A token with the "Browser Rendering - Edit" permission, `wrangler secret put
   * BROWSER_RENDERING_TOKEN`. Optional: without it link previews use the course map.
   */
  BROWSER_RENDERING_TOKEN?: string;
};

export type AppEnv = { Bindings: Bindings };
