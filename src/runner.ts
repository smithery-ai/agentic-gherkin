import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import {
  Before,
  defineStep,
  setDefaultTimeout,
  supportCodeLibraryBuilder,
} from "@cucumber/cucumber";
import { loadSources, runCucumber as runCucumberApi } from "@cucumber/cucumber/api";
import { toArray } from "./config.js";
import { buildBatchPrompt, buildScenarioPrompt } from "./prompt.js";
import { buildAggregateReport, renderSummary, scenarioKey, validateCoverage } from "./report.js";
import { agenticReportSchema, parseAgenticReport, type AgenticReport, type FeatureResult } from "./schema.js";
import { createEvaluator } from "./providers/index.js";
import type {
  AgenticGherkinConfig,
  ResolvedAgenticGherkinConfig,
  RunSummary,
  ScenarioDescriptor,
  ScenarioEvaluator,
} from "./types.js";
import { resolveConfig } from "./config.js";

export async function runAgenticGherkin(configInput: AgenticGherkinConfig = {}): Promise<RunSummary> {
  assertSupportedNode();
  const config = resolveConfig(configInput);
  const evaluator = createEvaluator(config);

  await rm(config.outputDir, { recursive: true, force: true });
  await mkdir(config.outputDir, { recursive: true });

  const scenarios = await readFeatureScenarios(config);
  assertUniqueScenarios(scenarios);

  const batch = config.evaluationMode === "batch" ? await evaluateBatch(config, evaluator, scenarios) : undefined;
  const cucumberExitCode = await runCucumber(config, evaluator, batch);
  const scenarioRoot = path.join(config.outputDir, "scenarios");
  const report = await buildAggregateReport(scenarios, scenarioRoot);
  agenticReportSchema.parse(report);

  await writeFile(config.reportFile, JSON.stringify(report, null, 2) + "\n", "utf8");

  const files = reportFiles(config);
  const summaryFile = path.join(config.outputDir, "summary.md");
  await writeFile(summaryFile, renderSummary(report, files), "utf8");

  const coverageErrors = validateCoverage(scenarios, report.featureResults);
  if (coverageErrors.length > 0) {
    throw new Error(
      `Agentic Gherkin did not cover the scenario set exactly once:\n${coverageErrors
        .map((error) => `- ${error}`)
        .join("\n")}\nReport: ${config.reportFile}`,
    );
  }

  const nonPassingResults = report.featureResults.filter((result) => result.status !== "pass");
  if (report.passed && nonPassingResults.length > 0) {
    throw new Error(
      `Agentic Gherkin report marked passed=true while scenarios were not passing:\n${nonPassingResults
        .map((result) => `- ${result.scenario}: ${result.status}`)
        .join("\n")}`,
    );
  }

  if (!report.passed && report.blockingIssues.length === 0) {
    throw new Error("Agentic Gherkin report marked passed=false without blocking issues.");
  }

  const summary = {
    passed: cucumberExitCode === 0 && report.passed,
    reportFile: config.reportFile,
    summaryFile,
    htmlReportFile: files.htmlReportFile,
    junitReportFile: files.junitReportFile,
    eventLogFile: config.eventLogFile,
    report,
  };

  if (!summary.passed) {
    const issues = report.blockingIssues.map((issue) => `- ${issue.scenario}: ${issue.reason}`).join("\n");
    throw new Error(`Agentic Gherkin failed.\nReport: ${config.reportFile}\n${issues}`);
  }

  return summary;
}

function assertSupportedNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major !== 22 && major < 24) {
    throw new Error(
      `agentic-gherkin requires Node 22 or 24 or newer; current runtime is ${process.version}.`,
    );
  }
}

async function readFeatureScenarios(config: ResolvedAgenticGherkinConfig): Promise<ScenarioDescriptor[]> {
  const featurePaths = await readFeaturePaths(config);
  if (featurePaths.length === 0) {
    throw new Error(`No BDD feature files found in ${toArray(config.features).join(", ")}`);
  }

  const sources = await loadSources(cucumberSourceOptions(config), {
    cwd: config.cwd,
  });

  if (sources.errors.length > 0) {
    throw new Error(
      `Could not load Cucumber feature sources:\n${sources.errors
        .map((error) => `- ${error.message ?? String(error)}`)
        .join("\n")}`,
    );
  }

  const featureNames = new Map<string, string>();
  for (const featurePath of featurePaths) {
    const featureFile = await readFile(path.resolve(config.cwd, featurePath), "utf8");
    const featureMatch = featureFile.match(/^Feature:\s+(.+)$/m);
    if (featureMatch === null) {
      throw new Error(`Feature header not found in ${featurePath}`);
    }
    featureNames.set(normalizeUri(featurePath), featureMatch[1].trim());
  }

  return sources.plan.map(({ name, uri, location }) => {
    const feature = featureNames.get(normalizeUri(uri));
    if (feature === undefined) {
      throw new Error(`Cucumber returned a scenario for unknown feature file ${uri}`);
    }

    return {
      feature,
      scenario: name,
      path: uri,
      line: location?.line ?? 0,
    };
  });
}

async function readFeaturePaths(config: ResolvedAgenticGherkinConfig): Promise<string[]> {
  const paths = toArray(config.features);
  const featurePaths: string[] = [];

  for (const candidate of paths) {
    const resolved = path.resolve(config.cwd, candidate);
    let candidateStat;
    try {
      candidateStat = await stat(resolved);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }

    if (candidateStat.isDirectory()) {
      featurePaths.push(...(await readFeatureDir(config.cwd, candidate)));
    } else if (candidate.endsWith(".feature")) {
      featurePaths.push(candidate);
    }
  }

  return featurePaths.sort();
}

async function readFeatureDir(cwd: string, dir: string): Promise<string[]> {
  const resolved = path.resolve(cwd, dir);
  const entries = await readdir(resolved, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readFeatureDir(cwd, relativePath)));
    } else if (entry.name.endsWith(".feature")) {
      files.push(relativePath);
    }
  }

  return files;
}

function cucumberSourceOptions(config: ResolvedAgenticGherkinConfig) {
  return {
    defaultDialect: "en",
    paths: toArray(config.features),
    names: [],
    tagExpression: "",
    order: "defined" as const,
  };
}

type BatchEvaluation = {
  rawLogFile: string;
  reportsByScenario: Map<string, AgenticReport>;
};

async function evaluateBatch(
  config: ResolvedAgenticGherkinConfig,
  evaluator: ScenarioEvaluator,
  scenarios: ScenarioDescriptor[],
): Promise<BatchEvaluation> {
  if (evaluator.evaluateBatch === undefined) {
    throw new Error(`Provider "${evaluator.name}" does not support batch evaluation.`);
  }

  const batchDir = path.join(config.outputDir, "batch");
  await mkdir(batchDir, { recursive: true });
  const rawLogFile = path.join(batchDir, "raw.jsonl");
  const promptFile = path.join(batchDir, "prompt.md");
  const reportFile = path.join(batchDir, "report.json");
  const featureSources = await readFeatureSources(config);
  const prompt = await buildBatchPrompt(config, {
    scenarios,
    featureSources,
  });

  await writeFile(promptFile, prompt, "utf8");

  const rawLog = createWriteStream(rawLogFile);
  const log = {
    write(event: unknown) {
      rawLog.write(`${JSON.stringify({ time: new Date().toISOString(), event })}\n`);
    },
  };

  try {
    const report = parseAgenticReport(
      await evaluator.evaluateBatch({
        cwd: config.cwd,
        scenarios,
        featureSources,
        prompt,
        timeoutMs: Math.max(1, config.timeoutMs - 1000),
        log,
      }),
    );
    agenticReportSchema.parse(report);
    const coverageErrors = validateCoverage(scenarios, report.featureResults);
    if (coverageErrors.length > 0) {
      throw new Error(
        `Agentic Gherkin batch evaluation did not cover the scenario set exactly once:\n${coverageErrors
          .map((error) => `- ${error}`)
          .join("\n")}\nReport: ${reportFile}`,
      );
    }

    await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n", "utf8");

    return {
      rawLogFile,
      reportsByScenario: new Map(
        report.featureResults.map((result) => [
          scenarioKey(result),
          scenarioReportFromBatch(report, result),
        ]),
      ),
    };
  } finally {
    rawLog.end();
  }
}

async function readFeatureSources(config: ResolvedAgenticGherkinConfig): Promise<Record<string, string>> {
  const featurePaths = await readFeaturePaths(config);
  const entries = await Promise.all(
    featurePaths.map(async (featurePath) => [
      normalizeUri(featurePath),
      await readFile(path.resolve(config.cwd, featurePath), "utf8"),
    ]),
  );

  return Object.fromEntries(entries);
}

function scenarioReportFromBatch(report: AgenticReport, result: FeatureResult): AgenticReport {
  const blockingIssues = report.blockingIssues.filter((issue) => issue.scenario === result.scenario);
  const passed = result.status === "pass";
  return {
    passed,
    summary: `${result.scenario}: ${result.status}`,
    featureResults: [{ ...result }],
    blockingIssues:
      passed || blockingIssues.length > 0
        ? blockingIssues
        : [
            {
              scenario: result.scenario,
              reason: result.evidence,
              evidence: result.evidence,
            },
          ],
  };
}

async function runCucumber(
  config: ResolvedAgenticGherkinConfig,
  evaluator: ScenarioEvaluator,
  batch?: BatchEvaluation,
) {
  const eventLog = createWriteStream(config.eventLogFile);
  const support = buildSupportCodeLibrary(config, evaluator, batch);
  const files = reportFiles(config);

  try {
    const result = await runCucumberApi(
      {
        sources: cucumberSourceOptions(config),
        support,
        runtime: {
          dryRun: false,
          failFast: false,
          filterStacktraces: true,
          parallel: 0,
          retry: 0,
          retryTagFilter: "",
          strict: true,
          worldParameters: {},
        },
        formats: {
          stdout: "progress",
          files: {
            [files.htmlReportFile]: "html",
            [files.cucumberJsonFile]: "json",
            [files.junitReportFile]: "junit",
            [files.messageReportFile]: "message",
          },
          publish: false,
          options: {},
        },
      },
      {
        cwd: config.cwd,
        stdout: tee(process.stdout, eventLog),
        stderr: tee(process.stderr, eventLog),
        env: {
          ...process.env,
          CUCUMBER_PUBLISH_QUIET: "true",
        },
      },
    );

    return result.success ? 0 : 1;
  } finally {
    eventLog.end();
  }
}

function buildSupportCodeLibrary(
  config: ResolvedAgenticGherkinConfig,
  evaluator: ScenarioEvaluator,
  batch?: BatchEvaluation,
) {
  supportCodeLibraryBuilder.reset(config.cwd, randomUUID, {
    requireModules: [],
    requirePaths: [],
    importPaths: [],
    loaders: [],
  });

  setDefaultTimeout(config.timeoutMs);

  Before({ timeout: config.timeoutMs }, async function (this: Record<string, unknown>, { gherkinDocument, pickle }) {
    const feature = gherkinDocument.feature?.name;
    if (feature === undefined || feature.length === 0) {
      throw new Error(`Could not determine feature name for ${pickle.uri}`);
    }

    const scenario = pickle.name;
    const line = pickle.location?.line ?? 0;
    const scenarioDir = path.join(
      config.outputDir,
      "scenarios",
      safePathSegment(`${pickle.uri}-${line}-${feature}-${scenario}`),
    );
    const scenarioReportFile = path.join(scenarioDir, "report.json");
    const scenarioRawLogFile = path.join(scenarioDir, "raw.jsonl");
    const promptFile = path.join(scenarioDir, "prompt.md");
    const featureSource = await readFile(path.resolve(config.cwd, pickle.uri), "utf8");
    const prompt = await buildScenarioPrompt(config, {
      feature,
      scenario,
      uri: pickle.uri,
      line,
      featureSource,
    });

    await mkdir(scenarioDir, { recursive: true });
    await writeFile(promptFile, prompt, "utf8");

    let parsedReport: AgenticReport;
    if (batch !== undefined) {
      const report = batch.reportsByScenario.get(scenarioKey({ feature, scenario }));
      if (report === undefined) {
        throw new Error(`Batch evaluator did not produce a report for ${feature} / ${scenario}.`);
      }
      parsedReport = report;
      await writeFile(
        scenarioRawLogFile,
        `${JSON.stringify({
          time: new Date().toISOString(),
          event: {
            provider: evaluator.name,
            mode: "batch",
            rawLogFile: batch.rawLogFile,
          },
        })}\n`,
        "utf8",
      );
    } else {
      const rawLog = createWriteStream(scenarioRawLogFile);
      const log = {
        write(event: unknown) {
          rawLog.write(`${JSON.stringify({ time: new Date().toISOString(), event })}\n`);
        },
      };

      try {
        parsedReport = parseAgenticReport(
          await evaluator.evaluate({
            cwd: config.cwd,
            feature,
            scenario,
            path: pickle.uri,
            line,
            featureSource,
            prompt,
            timeoutMs: Math.max(1, config.timeoutMs - 1000),
            log,
          }),
        );
      } finally {
        rawLog.end();
      }
    }

    const result = validateScenarioReport(parsedReport, { feature, scenario });
    await writeFile(scenarioReportFile, JSON.stringify(parsedReport, null, 2) + "\n", "utf8");
    this.agenticGherkinResult = {
      feature,
      scenario,
      result,
      report: parsedReport,
      reportFile: scenarioReportFile,
      rawLogFile: scenarioRawLogFile,
    };

    const world = this as {
      attach?: (data: string, mediaType: string) => Promise<void>;
      agenticGherkinResult?: {
        report: unknown;
        reportFile: string;
        rawLogFile: string;
      };
    };
    if (world.attach !== undefined && world.agenticGherkinResult !== undefined) {
      await world.attach(JSON.stringify(world.agenticGherkinResult.report, null, 2), "application/json");
      await world.attach(
        `Agent report: ${world.agenticGherkinResult.reportFile}\nRaw log: ${world.agenticGherkinResult.rawLogFile}`,
        "text/plain",
      );
    }
  });

  defineStep(/.*/, function (this: Record<string, unknown>) {
    const scenarioResult = this.agenticGherkinResult as
      | {
          feature: string;
          scenario: string;
          result: { status: string; evidence: string };
          report: { blockingIssues: Array<{ reason: string }> };
        }
      | undefined;
    if (scenarioResult === undefined) {
      throw new Error("Agent evaluator did not produce a scenario result before this step ran.");
    }

    if (scenarioResult.result.status === "pass") {
      return;
    }

    const issue = scenarioResult.report.blockingIssues[0];
    const reason = issue?.reason ?? scenarioResult.result.evidence;
    throw new Error(
      `${scenarioResult.result.status.toUpperCase()} ${scenarioResult.feature} / ${scenarioResult.scenario}: ${reason}`,
    );
  });

  return supportCodeLibraryBuilder.finalize();
}

function reportFiles(config: ResolvedAgenticGherkinConfig) {
  return {
    htmlReportFile: path.join(config.outputDir, "report.html"),
    cucumberJsonFile: path.join(config.outputDir, "cucumber.json"),
    jsonReportFile: config.reportFile,
    junitReportFile: path.join(config.outputDir, "junit.xml"),
    messageReportFile: path.join(config.outputDir, "messages.ndjson"),
    eventLogFile: config.eventLogFile,
  };
}

function assertUniqueScenarios(scenarios: ScenarioDescriptor[]) {
  const duplicateScenarioKeys = scenarios
    .map(scenarioKey)
    .filter((key, index, keys) => keys.indexOf(key) !== index);

  if (duplicateScenarioKeys.length > 0) {
    throw new Error(
      `Duplicate feature/scenario pairs found:\n${duplicateScenarioKeys
        .map((key) => `- ${key.replace("\u0000", " / ")}`)
        .join("\n")}`,
    );
  }
}

function validateScenarioReport(report: unknown, expected: { feature: string; scenario: string }) {
  const parsed = parseAgenticReport(report);
  if (parsed.featureResults.length !== 1) {
    throw new Error("Agent scenario report must include exactly one featureResults item.");
  }

  const result = parsed.featureResults[0];
  if (result.feature !== expected.feature) {
    throw new Error(`Agent reported feature ${result.feature}, expected ${expected.feature}.`);
  }

  if (result.scenario !== expected.scenario) {
    const reportedScenario = result.scenario;
    result.scenario = expected.scenario;
    result.evidence = appendEvidence(
      result.evidence,
      `Agent reported scenario label "${reportedScenario}"; Cucumber scenario under test is "${expected.scenario}".`,
    );

    for (const issue of parsed.blockingIssues) {
      if (issue.scenario === reportedScenario) {
        issue.scenario = expected.scenario;
      }
    }
  }

  const passedByStatus = result.status === "pass";
  if (parsed.passed !== passedByStatus) {
    throw new Error("Agent scenario report passed flag does not match scenario status.");
  }

  if (!passedByStatus && parsed.blockingIssues.length === 0) {
    throw new Error("Agent scenario report did not include a blocking issue for a non-passing scenario.");
  }

  if (passedByStatus && parsed.blockingIssues.length > 0) {
    throw new Error("Agent scenario report included blocking issues for a passing scenario.");
  }

  return result;
}

function tee(target: NodeJS.WriteStream, log: NodeJS.WritableStream) {
  return new Writable({
    write(chunk, encoding, callback) {
      let pending = 2;
      let finished = false;
      const done = (error?: Error | null) => {
        if (finished) {
          return;
        }
        if (error !== undefined && error !== null) {
          finished = true;
          callback(error);
          return;
        }
        pending -= 1;
        if (pending === 0) {
          finished = true;
          callback();
        }
      };

      target.write(chunk, encoding, done);
      log.write(chunk, encoding, done);
    },
  });
}

function normalizeUri(uri: string) {
  return uri.split(path.sep).join("/");
}

function appendEvidence(evidence: string, note: string) {
  if (evidence.length > 0) {
    return `${evidence}\n${note}`;
  }

  return note;
}

function safePathSegment(value: string) {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
