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
