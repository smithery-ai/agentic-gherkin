import type { AgenticReport } from "./schema.js";

export type ProviderName = "codex" | "claude" | "mock";

export type ScenarioDescriptor = {
  feature: string;
  scenario: string;
  path: string;
  line: number;
};

export type ProviderLogWriter = {
  write: (event: unknown) => void;
};

export type ScenarioEvaluationRequest = ScenarioDescriptor & {
  cwd: string;
  featureSource: string;
  prompt: string;
  timeoutMs: number;
  log: ProviderLogWriter;
};

export type BatchEvaluationRequest = {
  cwd: string;
  scenarios: ScenarioDescriptor[];
  featureSources: Record<string, string>;
  prompt: string;
  timeoutMs: number;
  log: ProviderLogWriter;
};

export type ScenarioEvaluator = {
  name: string;
  evaluate: (request: ScenarioEvaluationRequest) => Promise<AgenticReport>;
  evaluateBatch?: (request: BatchEvaluationRequest) => Promise<AgenticReport>;
};

export type CodexProviderOptions = {
  agentModel?: string;
  model?: string;
  reasoningEffort?: string;
  sandboxMode?: string;
  approvalPolicy?: string;
  networkAccessEnabled?: boolean;
  webSearchEnabled?: boolean;
  skipGitRepoCheck?: boolean;
  maxTurns?: number;
};

export type ClaudeProviderOptions = {
  model?: string;
  effort?: "low" | "medium" | "high" | "max";
  permissionMode?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
  settingSources?: string[];
  pathToClaudeCodeExecutable?: string;
  systemPromptAppend?: string;
};

export type MockProviderOptions = {
  defaultStatus?: "pass" | "fail" | "blocked";
  results?: Array<{
    feature?: string;
    scenario?: string;
    status: "pass" | "fail" | "blocked";
    evidence?: string;
    reason?: string;
  }>;
};

export type AgenticGherkinConfig = {
  cwd?: string;
  features?: string | string[];
  outputDir?: string;
  reportFile?: string;
  eventLogFile?: string;
  provider?: ProviderName;
  evaluationMode?: "batch" | "scenario";
  timeoutMs?: number;
  contracts?: string[];
  rules?: string[];
  forbiddenCommands?: string[];
  promptIntro?: string;
  buildPrompt?: (request: {
    feature: string;
    scenario: string;
    uri: string;
    line: number;
    featureSource: string;
    contracts: string[];
    rules: string[];
    forbiddenCommands: string[];
  }) => string | Promise<string>;
  buildBatchPrompt?: (request: {
    scenarios: ScenarioDescriptor[];
    featureSources: Record<string, string>;
    contracts: string[];
    rules: string[];
    forbiddenCommands: string[];
  }) => string | Promise<string>;
  providerOptions?: {
    codex?: CodexProviderOptions;
    claude?: ClaudeProviderOptions;
    mock?: MockProviderOptions;
  };
};

export type ResolvedAgenticGherkinConfig = Required<
  Pick<
    AgenticGherkinConfig,
    | "cwd"
    | "features"
    | "outputDir"
    | "reportFile"
    | "eventLogFile"
    | "provider"
    | "evaluationMode"
    | "timeoutMs"
    | "contracts"
    | "rules"
    | "forbiddenCommands"
    | "promptIntro"
    | "providerOptions"
  >
> & {
  buildPrompt?: AgenticGherkinConfig["buildPrompt"];
  buildBatchPrompt?: AgenticGherkinConfig["buildBatchPrompt"];
};

export type RunSummary = {
  passed: boolean;
  reportFile: string;
  summaryFile: string;
  htmlReportFile: string;
  junitReportFile: string;
  eventLogFile: string;
  report: AgenticReport;
};
