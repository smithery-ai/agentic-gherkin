import { spawnSync } from "node:child_process";
import path from "node:path";
import { toArray } from "./config.js";
import type { FeatureExecutorConfig, ResolvedAgenticGherkinConfig } from "./types.js";

export type FeatureExecutorSelection = {
  executor: FeatureExecutorConfig;
  displayName: string;
};

export function selectFeatureExecutor(
  config: ResolvedAgenticGherkinConfig,
): FeatureExecutorSelection | undefined {
  if (config.featureExecutors.length === 0) {
    return undefined;
  }

  const selectedFeatures = normalizeFeatureSet(config.cwd, config.features);
  const matchingExecutors = config.featureExecutors.filter((executor) =>
    sameFeatureSet(selectedFeatures, normalizeFeatureSet(config.cwd, executor.features)),
  );

  if (matchingExecutors.length > 1) {
    throw new Error(
      `Multiple feature executors match ${selectedFeatures.join(", ")}: ${matchingExecutors
        .map((executor) => executor.name ?? commandDisplayName(executor.command))
        .join(", ")}`,
    );
  }

  const executor = matchingExecutors[0];
  if (executor === undefined) {
    return undefined;
  }

  return {
    executor,
    displayName: executor.name ?? commandDisplayName(executor.command),
  };
}

export function runFeatureExecutor(config: ResolvedAgenticGherkinConfig, selection: FeatureExecutorSelection) {
  const { command, args, shell } = normalizeCommand(selection.executor.command);
  console.log(`Agentic Gherkin running feature executor: ${selection.displayName}`);

  const result = spawnSync(command, args, {
    cwd: path.resolve(config.cwd, selection.executor.cwd ?? "."),
    env: {
      ...process.env,
      ...(selection.executor.env ?? {}),
    },
    shell,
    stdio: "inherit",
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.signal !== null) {
    throw new Error(`Feature executor "${selection.displayName}" exited from signal ${result.signal}`);
  }

  if (result.status !== 0) {
    throw new Error(`Feature executor "${selection.displayName}" failed with exit code ${result.status ?? 1}`);
  }
}

function normalizeCommand(command: string | string[]) {
  if (Array.isArray(command)) {
    const [binary, ...args] = command;
    if (binary === undefined || binary.length === 0) {
      throw new Error("Feature executor command array must include a binary.");
    }
    return { command: binary, args, shell: false };
  }

  if (command.length === 0) {
    throw new Error("Feature executor command must not be empty.");
  }

  return { command, args: [], shell: true };
}

function commandDisplayName(command: string | string[]) {
  return Array.isArray(command) ? command.join(" ") : command;
}

function normalizeFeatureSet(cwd: string, features: string | string[]) {
  return toArray(features)
    .map((feature) => normalizeFeaturePath(cwd, feature))
    .sort();
}

function normalizeFeaturePath(cwd: string, feature: string) {
  return path.relative(cwd, path.resolve(cwd, feature)).split(path.sep).join("/");
}

function sameFeatureSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((feature, index) => feature === right[index]);
}
