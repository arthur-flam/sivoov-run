import base from '../eslint.config.js';


export default [...base, { ignores: ['.expo/**', 'dist/**', 'expo-env.d.ts', 'metro.config.js', 'babel.config.js', 'playwright-report/**', 'test-results/**'] }];
