import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc', environment: 'local' },
        // The pool also reads api/.dev.vars, which CI does not have: every secret a test depends
        // on is set here, so a laptop's .dev.vars changes nothing. Fake ElevenLabs, Gemini and Cloudflare AI
        // tokens (the studio and voice tests stub fetch, AI Gateway included); no Mapbox token and no card
        // renderer (the pages fall back to the SVG trace, the PNGs answer 404). A blank secret
        // counts as no secret in the Worker.
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            ELEVENLABS_API_TOKEN: 'test-elevenlabs-key',
            GEMINI_API_KEY: 'test-gemini-key',
            CLOUDFLARE_AI_TOKEN: 'test-cf-ai-token',
            MAPBOX_TOKEN: '',
            BROWSER_RENDERING_TOKEN: '',
            // App Review's fixed code (lib/testCode.ts), unlike TEST_CODE so a test can tell them apart.
            REVIEW_CODE: '424242',
          },
        },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/apply-migrations.ts'],
      // Each of these tests drives a real workerd with D1 behind it; the sign-in walk alone is
      // six round trips and took 5.19 s on a CI runner against vitest's 5 s default, which is
      // how main stayed red. The suite is not slow because anything is wrong with it.
      testTimeout: 20_000,
    },
  };
});
