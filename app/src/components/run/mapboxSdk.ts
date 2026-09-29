import { NativeModules, TurboModuleRegistry } from 'react-native';
import type * as MapboxSdk from '@rnmapbox/maps';

/**
 * The native Mapbox SDK, when this build has it. JavaScript reaches phones over the air: a
 * shell built before the SDK was added gets this file without the native half, and must not
 * even load the package (it reads its native module on import). There, `sdk` is null and the
 * run screen draws the course diagram, as before.
 */
const load = (): typeof MapboxSdk | null => {
  const present = NativeModules.RNMBXModule != null || TurboModuleRegistry.get('RNMBXModule') != null;
  if (!present) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@rnmapbox/maps') as typeof MapboxSdk;
  } catch {
    return null;
  }
};

export const sdk = load();
