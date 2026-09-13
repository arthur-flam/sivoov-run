import { defineConfig } from 'vitest/config';

/** The build tools run under node (fs, child_process), not workerd: their tests get their own config. */
export default defineConfig({
  test: { include: ['tools/**/*.test.ts'], environment: 'node' },
});
