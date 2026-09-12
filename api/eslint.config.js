import base from '../eslint.config.js';

export default [...base, { ignores: ['worker-configuration.d.ts', 'playwright-report/**', 'test-results/**'] }];
