import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc', environment: 'local' },
        // A fake ElevenLabs key: the studio tests stub fetch, and CI has no .dev.vars.
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, ELEVENLABS_API_TOKEN: 'test-elevenlabs-key' } },
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
