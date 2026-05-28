import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AgenticReport, FeatureResult } from "./schema.js";
import type { ScenarioDescriptor } from "./types.js";

export function scenarioKey({ feature, scenario }: Pick<ScenarioDescriptor, "feature" | "scenario">) {
  return `${feature}\u0000${scenario}`;
}

export async function buildAggregateReport(
  scenarios: ScenarioDescriptor[],
  scenarioRoot: string,
): Promise<AgenticReport> {
  const scenarioReports = await readScenarioReports(scenarioRoot);
  const featureResults = scenarioReports.map(({ report }) => report.featureResults[0]).filter(Boolean);
  const missingReports = scenarios.filter((scenario) => {
    const key = scenarioKey(scenario);
    return !featureResults.some((result) => scenarioKey(result) === key);
  });
  const blockingIssues = [
    ...scenarioReports.flatMap(({ report }) => report.blockingIssues),
    ...missingReports.map(({ feature, scenario }) => ({
      scenario,
      reason: "Cucumber did not produce an agent report for this scenario.",
      evidence: `Feature: ${feature}`,
    })),
  ];
  const passed =
    featureResults.length === scenarios.length &&
    featureResults.every((result) => result.status === "pass");
  const passCount = featureResults.filter((result) => result.status === "pass").length;

  return {
    passed,
    summary: `${passCount}/${scenarios.length} Cucumber scenarios passed through an agent evaluator.`,
    featureResults,
    blockingIssues,
  };
}

export async function readScenarioReports(dir: string): Promise<Array<{ path: string; report: AgenticReport }>> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const reports: Array<{ path: string; report: AgenticReport }> = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      reports.push(...(await readScenarioReports(entryPath)));
      continue;
    }
    if (entry.name !== "report.json") {
      continue;
    }

    const report = JSON.parse(await readFile(entryPath, "utf8")) as AgenticReport;
    reports.push({ path: entryPath, report });
  }

  return reports.sort((left, right) => left.path.localeCompare(right.path));
}

export function renderSummary(report: AgenticReport, files: {
  htmlReportFile: string;
  jsonReportFile: string;
  junitReportFile: string;
  messageReportFile: string;
  eventLogFile: string;
}) {
  const rows = report.featureResults.map((result) => {
    return `| ${escapeTable(result.status.toUpperCase())} | ${escapeTable(result.scenario)} | ${escapeTable(
      result.evidence,
    )} |`;
  });

  return `# Agentic Gherkin Results

${report.summary}

## Reports

- Cucumber HTML: ${files.htmlReportFile}
- Aggregate JSON: ${files.jsonReportFile}
- JUnit XML: ${files.junitReportFile}
- Cucumber messages: ${files.messageReportFile}
- Runner events: ${files.eventLogFile}

## Scenarios

| Status | Scenario | Evidence |
| --- | --- | --- |
${rows.join("\n")}

## Blocking Issues

${
  report.blockingIssues.length === 0
    ? "- None"
    : report.blockingIssues
        .map((issue) => `- ${issue.scenario}: ${issue.reason}\n  Evidence: ${issue.evidence}`)
        .join("\n")
}
`;
}

export function validateCoverage(scenarios: ScenarioDescriptor[], featureResults: FeatureResult[]): string[] {
  const expectedKeys = scenarios.map(scenarioKey);
  const covered = new Map(featureResults.map((result) => [scenarioKey(result), result]));
  const duplicateResults = featureResults
    .map(scenarioKey)
    .filter((key, index, reportedScenarios) => reportedScenarios.indexOf(key) !== index);
  const missingScenarios = scenarios.filter((scenario) => !covered.has(scenarioKey(scenario)));
  const extraScenarios = featureResults.filter((result) => !expectedKeys.includes(scenarioKey(result)));

  return [
    ...missingScenarios.map(({ feature, scenario }) => `missing: ${feature} / ${scenario}`),
    ...extraScenarios.map(({ feature, scenario }) => `unexpected: ${feature} / ${scenario}`),
    ...duplicateResults.map((key) => `duplicate: ${key.replace("\u0000", " / ")}`),
  ];
}

function escapeTable(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
