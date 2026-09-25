import { defineConfig } from 'vitest/config';

/**
 * The build tools run under node (fs, child_process), not workerd: their tests get their own
 * config. Pure helpers under src/ with a test next to them run here too.
 */
export default defineConfig({
  test: { include: ['tools/**/*.test.ts', 'src/**/*.test.ts'], environment: 'node' },
});
