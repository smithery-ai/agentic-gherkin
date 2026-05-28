import { query } from "@anthropic-ai/claude-agent-sdk";
import { agenticReportJsonSchema, parseAgenticReport } from "../schema.js";
import type { ClaudeProviderOptions, ScenarioEvaluator } from "../types.js";

export function createClaudeEvaluator(options: ClaudeProviderOptions = {}): ScenarioEvaluator {
  return {
    name: "claude",
    async evaluate(request) {
      const abortController = new AbortController();
      const timer = setTimeout(() => abortController.abort(), request.timeoutMs);
      timer.unref();

      try {
        let finalResult: unknown;
        const stream = query({
          prompt: request.prompt,
          options: {
            abortController,
            cwd: request.cwd,
            model: options.model ?? process.env.AGENTIC_GHERKIN_CLAUDE_MODEL ?? "sonnet",
            effort: options.effort ?? "low",
            permissionMode:
              (options.permissionMode ??
                process.env.AGENTIC_GHERKIN_CLAUDE_PERMISSION_MODE ??
                "dontAsk") as never,
            allowedTools: options.allowedTools,
            disallowedTools: options.disallowedTools,
            maxTurns: options.maxTurns ?? 12,
            pathToClaudeCodeExecutable: options.pathToClaudeCodeExecutable,
            settingSources: options.settingSources as never,
            systemPrompt:
              options.systemPromptAppend === undefined
                ? undefined
                : { type: "preset", preset: "claude_code", append: options.systemPromptAppend },
            outputFormat: {
              type: "json_schema",
              schema: agenticReportJsonSchema,
            },
            env: {
              ...process.env,
              CLAUDE_AGENT_SDK_CLIENT_APP: "agentic-gherkin",
            },
            stderr(data: string) {
              request.log.write({ provider: "claude", stream: "stderr", data });
            },
          },
        });

        for await (const message of stream) {
          request.log.write({ provider: "claude", message });
          if (isObject(message) && "result" in message) {
            finalResult = message.result;
          }
        }

        if (finalResult === undefined) {
          throw new Error("Claude Agent SDK did not return a result message.");
        }

        return parseAgenticReport(finalResult);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
