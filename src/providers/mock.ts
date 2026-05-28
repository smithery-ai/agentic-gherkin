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
    async evaluateBatch(request) {
      request.log.write({
        provider: "mock",
        mode: "batch",
        scenarios: request.scenarios.length,
      });

      const featureResults = request.scenarios.map((scenario) => {
        const configured = options.results?.find((result) => {
          return (
            (result.feature === undefined || result.feature === scenario.feature) &&
            (result.scenario === undefined || result.scenario === scenario.scenario)
          );
        });
        const status = configured?.status ?? options.defaultStatus ?? "pass";
        const evidence =
          configured?.evidence ??
          (status === "pass"
            ? `Mock evaluator accepted ${scenario.scenario}.`
            : `Mock evaluator marked ${scenario.scenario} as ${status}.`);

        return {
          feature: scenario.feature,
          scenario: scenario.scenario,
          status,
          evidence,
          reason: configured?.reason,
        };
      });

      const report: AgenticReport = {
        passed: featureResults.every((result) => result.status === "pass"),
        summary: "Mock batch evaluation complete.",
        featureResults: featureResults.map(({ reason: _reason, ...result }) => result),
        blockingIssues: featureResults.flatMap((result) =>
          result.status === "pass"
            ? []
            : [
                {
                  scenario: result.scenario,
                  reason: result.reason ?? `Mock ${result.status} result.`,
                  evidence: result.evidence,
                },
              ],
        ),
      };

      request.log.write({ provider: "mock", mode: "batch", report });
      return report;
    },
  };
}
