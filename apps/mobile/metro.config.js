// Monorepo-aware Metro config: watch the workspace root so edits to
// @whalex/shared and @whalex/client-core dist output invalidate the bundle,
// and resolve modules from both the app's and the root node_modules.
// Metro only loads CommonJS config, hence require().
/* eslint-disable @typescript-eslint/no-require-imports */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
