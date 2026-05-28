import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs } from "../src/config.js";
import { runAgenticGherkin } from "../src/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, ".context", "cucumber-support-test");

const parsed = parseCliArgs(["--", "--features", "tests/features/agentic-gherkin-runner.feature"]);
assert.equal(parsed.overrides.features, "tests/features/agentic-gherkin-runner.feature");

const summary = await runAgenticGherkin({
  cwd: repoRoot,
  features: "tests/features/agentic-gherkin-runner.feature",
  outputDir,
  provider: "mock",
  cucumberSupport: [
    {
      name: "native-pass-steps",
      features: "tests/features/agentic-gherkin-runner.feature",
      importPaths: ["tests/support/pass-steps.mjs"],
    },
  ],
});

assert.equal(summary.passed, true);
assert.equal(summary.report.featureResults.length, 2);
assert.ok(summary.report.featureResults.every((result) => result.status === "pass"));
assert.ok(existsSync(summary.summaryFile), "summary.md should exist");
assert.ok(existsSync(summary.htmlReportFile), "report.html should exist");
assert.ok(existsSync(summary.junitReportFile), "junit.xml should exist");

const summaryText = await readFile(summary.summaryFile, "utf8");
assert.match(summaryText, /native-pass-steps/);
assert.match(summaryText, /PASS/);

console.log(`Cucumber support test passed. Summary: ${summary.summaryFile}`);
