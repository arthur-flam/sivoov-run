// Monorepo: resolve @sivoov/shared (TypeScript source, symlinked) and hoisted node_modules.
// Sentry's Expo config is Expo's own plus a debug id in each bundle, which is how an OTA update's
// source maps find their bundle in Sentry (docs/WORKFLOW.md, Secrets: SENTRY_AUTH_TOKEN).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const config = getSentryExpoConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')];

module.exports = config;
