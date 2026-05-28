import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AgenticGherkinConfig, ProviderName, ResolvedAgenticGherkinConfig } from "./types.js";

export async function loadConfig(configFile?: string): Promise<AgenticGherkinConfig> {
  if (configFile === undefined) {
    return {};
  }

  const configUrl = pathToFileURL(path.resolve(configFile)).href;
  const imported = (await import(`${configUrl}?t=${Date.now()}`)) as {
    default?: AgenticGherkinConfig;
    config?: AgenticGherkinConfig;
  };
  return imported.default ?? imported.config ?? {};
}

export function resolveConfig(
  config: AgenticGherkinConfig,
  overrides: Partial<AgenticGherkinConfig> = {},
): ResolvedAgenticGherkinConfig {
  const cwd = path.resolve(overrides.cwd ?? config.cwd ?? process.cwd());
  const outputDir = path.resolve(
    cwd,
    overrides.outputDir ??
      config.outputDir ??
      process.env.AGENTIC_GHERKIN_OUTPUT_DIR ??
      ".context/agentic-gherkin",
  );
  const provider = (overrides.provider ??
    config.provider ??
    process.env.AGENTIC_GHERKIN_PROVIDER ??
    "codex") as ProviderName;
  const evaluationMode =
    overrides.evaluationMode ??
    config.evaluationMode ??
    (process.env.AGENTIC_GHERKIN_EVALUATION_MODE as "batch" | "scenario" | undefined) ??
    "batch";
  const timeoutMs = Number(
    overrides.timeoutMs ??
      config.timeoutMs ??
      process.env.AGENTIC_GHERKIN_SCENARIO_TIMEOUT_MS ??
      30 * 60 * 1000,
  );

  return {
    cwd,
    features: overrides.features ?? config.features ?? "tests/features",
    outputDir,
    reportFile:
      overrides.reportFile ??
      config.reportFile ??
      process.env.AGENTIC_GHERKIN_REPORT ??
      path.join(outputDir, "report.json"),
    eventLogFile:
      overrides.eventLogFile ??
      config.eventLogFile ??
      process.env.AGENTIC_GHERKIN_EVENT_LOG ??
      path.join(outputDir, "events.jsonl"),
    provider,
    evaluationMode,
    timeoutMs,
    contracts: overrides.contracts ?? config.contracts ?? [],
    rules: overrides.rules ?? config.rules ?? [],
    forbiddenCommands: overrides.forbiddenCommands ?? config.forbiddenCommands ?? [],
    promptIntro:
      overrides.promptIntro ??
      config.promptIntro ??
      "You are the required BDD feature acceptance tester for this repository.",
    buildPrompt: overrides.buildPrompt ?? config.buildPrompt,
    buildBatchPrompt: overrides.buildBatchPrompt ?? config.buildBatchPrompt,
    providerOptions: {
      codex: {
        ...(config.providerOptions?.codex ?? {}),
        ...(overrides.providerOptions?.codex ?? {}),
      },
      claude: {
        ...(config.providerOptions?.claude ?? {}),
        ...(overrides.providerOptions?.claude ?? {}),
      },
      mock: {
        ...(config.providerOptions?.mock ?? {}),
        ...(overrides.providerOptions?.mock ?? {}),
      },
    },
  };
}

export function parseCliArgs(args: string[]): {
  configFile?: string;
  overrides: Partial<AgenticGherkinConfig>;
} {
  const overrides: Partial<AgenticGherkinConfig> = {};
  let configFile: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => {
      const value = args[index + 1];
      if (value === undefined) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    if (arg === "--config" || arg === "-c") {
      configFile = next();
    } else if (arg === "--provider") {
      overrides.provider = next() as ProviderName;
    } else if (arg === "--evaluation-mode") {
      overrides.evaluationMode = next() as "batch" | "scenario";
    } else if (arg === "--features") {
      overrides.features = next();
    } else if (arg === "--output-dir") {
      overrides.outputDir = next();
    } else if (arg === "--cwd") {
      overrides.cwd = next();
    } else if (arg === "--timeout-ms") {
      overrides.timeoutMs = Number(next());
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { configFile, overrides };
}

function printHelp() {
  console.log(`agentic-gherkin

Usage:
  agentic-gherkin [--config agentic-gherkin.config.mjs] [--provider codex|claude|mock]

Options:
  --config, -c     Config file
  --provider       Evaluator provider
  --evaluation-mode batch or scenario
  --features       Feature directory or file
  --output-dir     Report output directory
  --cwd            Project working directory
  --timeout-ms     Per-scenario timeout in milliseconds
`);
}

export function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}
