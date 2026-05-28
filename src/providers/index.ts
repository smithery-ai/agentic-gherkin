import { createClaudeEvaluator } from "./claude.js";
import { createCodexEvaluator } from "./codex.js";
import { createMockEvaluator } from "./mock.js";
import type { ResolvedAgenticGherkinConfig, ScenarioEvaluator } from "../types.js";

export function createEvaluator(config: ResolvedAgenticGherkinConfig): ScenarioEvaluator {
  if (config.provider === "codex") {
    return createCodexEvaluator(config.providerOptions.codex);
  }

  if (config.provider === "claude") {
    return createClaudeEvaluator(config.providerOptions.claude);
  }

  if (config.provider === "mock") {
    return createMockEvaluator(config.providerOptions.mock);
  }

  throw new Error(`Unsupported provider: ${config.provider}`);
}
