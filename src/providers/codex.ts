import { Agent, run } from "@openai/agents";
import { codexTool } from "@openai/agents-extensions/experimental/codex";
import { agenticReportSchema, parseAgenticReport } from "../schema.js";
import type {
  BatchEvaluationRequest,
  CodexProviderOptions,
  ScenarioEvaluationRequest,
  ScenarioEvaluator,
} from "../types.js";

export function createCodexEvaluator(options: CodexProviderOptions = {}): ScenarioEvaluator {
  return {
    name: "codex",
    evaluate: (request) => evaluateWithCodex(options, request, "scenario"),
    evaluateBatch: (request) => evaluateWithCodex(options, request, "batch"),
  };
}

async function evaluateWithCodex(
  options: CodexProviderOptions,
  request: ScenarioEvaluationRequest | BatchEvaluationRequest,
  mode: "batch" | "scenario",
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  timer.unref();

  try {
    const model = options.model ?? process.env.AGENTIC_GHERKIN_CODEX_MODEL ?? "gpt-5.4-mini";
    const agent = new Agent({
      name: "Agentic Gherkin Codex Evaluator",
      model: options.agentModel ?? process.env.AGENTIC_GHERKIN_CODEX_AGENT_MODEL ?? model,
      instructions:
        mode === "batch"
          ? "Use the codex tool to inspect the workspace and evaluate every requested Gherkin scenario. Do not edit files. Return only the structured result."
          : "Use the codex tool to inspect the workspace and evaluate the requested Gherkin scenario. Do not edit files. Return only the structured result.",
      outputType: agenticReportSchema,
      tools: [
        codexTool({
          sandboxMode: options.sandboxMode ?? process.env.AGENTIC_GHERKIN_CODEX_SANDBOX ?? "workspace-write",
          workingDirectory: request.cwd,
          skipGitRepoCheck: options.skipGitRepoCheck,
          defaultThreadOptions: {
            model,
            approvalPolicy: options.approvalPolicy ?? process.env.AGENTIC_GHERKIN_CODEX_APPROVAL_POLICY ?? "never",
            modelReasoningEffort:
              options.reasoningEffort ?? process.env.AGENTIC_GHERKIN_CODEX_REASONING_EFFORT ?? "low",
            networkAccessEnabled: options.networkAccessEnabled ?? true,
            webSearchEnabled: options.webSearchEnabled ?? false,
          } as Record<string, unknown>,
          onStream: (event: unknown) => {
            request.log.write({ provider: "codex", mode, event });
          },
        } as Record<string, unknown>),
      ],
    });

    const result = await run(agent, request.prompt, {
      maxTurns: options.maxTurns ?? (mode === "batch" ? 16 : 8),
      signal: controller.signal,
    });
    request.log.write({
      provider: "codex",
      mode,
      finalOutput: result.finalOutput,
      newItems: result.newItems,
    });
    return parseAgenticReport(result.finalOutput);
  } finally {
    clearTimeout(timer);
  }
}
