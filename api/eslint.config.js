import base from '../eslint.config.js';

/** The browser scripts (studio, result page) are plain ES2020 running in a page, not in the Worker. */
const browserGlobals = ['document', 'window', 'fetch', 'File', 'setTimeout', 'Promise', 'console', 'navigator', 'Date', 'JSON', 'Math', 'Number', 'String', 'Array', 'Object'].reduce(
  (globals, name) => ({ ...globals, [name]: 'readonly' }),
  {},
);

export default [
  ...base,
  { ignores: ['worker-configuration.d.ts', 'playwright-report/**', 'test-results/**'] },
  {
    files: ['**/*.client.js'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: browserGlobals },
  },
];
