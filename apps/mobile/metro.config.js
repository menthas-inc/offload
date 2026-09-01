// Metro, taught two things about this repository.
//
// It is a pnpm monorepo, so dependencies are symlinked out of a store rather
// than copied into each package. Metro resolves from a single project root by
// default and silently fails to find anything hoisted, which reads as a missing
// module in a package that is plainly installed.

const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Both roots: this package, and the workspace where pnpm keeps the store.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// disableHierarchicalLookup stays OFF, deliberately. Expo's monorepo guide
// turns it on, but that guide assumes a hoisted layout: every dependency
// present in one of the two roots above. pnpm does the opposite. A package
// resolves its own dependencies through symlinks inside the store, which is
// exactly the upward walk that flag switches off, so turning it on here makes
// Metro stall trying to resolve modules that are plainly installed.

module.exports = withNativeWind(config, { input: "./global.css" });
