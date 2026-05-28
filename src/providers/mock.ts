import type { AgenticReport } from "../schema.js";
import type { MockProviderOptions, ScenarioEvaluator } from "../types.js";

export function createMockEvaluator(options: MockProviderOptions = {}): ScenarioEvaluator {
  return {
    name: "mock",
    async evaluate(request) {
      request.log.write({
        provider: "mock",
        feature: request.feature,
        scenario: request.scenario,
      });

      const configured = options.results?.find((result) => {
        return (
          (result.feature === undefined || result.feature === request.feature) &&
          (result.scenario === undefined || result.scenario === request.scenario)
        );
      });
      const status = configured?.status ?? options.defaultStatus ?? "pass";
      const evidence =
        configured?.evidence ??
        (status === "pass"
          ? `Mock evaluator accepted ${request.scenario}.`
          : `Mock evaluator marked ${request.scenario} as ${status}.`);

      const report: AgenticReport = {
        passed: status === "pass",
        summary: status === "pass" ? "Mock scenario passed." : "Mock scenario did not pass.",
        featureResults: [
          {
            feature: request.feature,
            scenario: request.scenario,
            status,
            evidence,
          },
        ],
        blockingIssues:
          status === "pass"
            ? []
            : [
                {
                  scenario: request.scenario,
                  reason: configured?.reason ?? `Mock ${status} result.`,
                  evidence,
                },
              ],
      };

      request.log.write({ provider: "mock", report });
      return report;
    },
  };
}
