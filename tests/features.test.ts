import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAgenticGherkin } from "../src/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, ".context", "self-test");

const summary = await runAgenticGherkin({
  cwd: repoRoot,
  features: "tests/features",
  outputDir,
  provider: "mock",
  contracts: ["README.md"],
  forbiddenCommands: ["pnpm agentic-gherkin"],
  providerOptions: {
    mock: {
      defaultStatus: "pass",
    },
  },
});

assert.equal(summary.passed, true);
assert.equal(summary.report.featureResults.length, 2);
assert.ok(existsSync(summary.summaryFile), "summary.md should exist");
assert.ok(existsSync(summary.htmlReportFile), "report.html should exist");
assert.ok(existsSync(summary.junitReportFile), "junit.xml should exist");
assert.ok(existsSync(path.join(outputDir, "messages.ndjson")), "messages.ndjson should exist");

const summaryText = await readFile(summary.summaryFile, "utf8");
assert.match(summaryText, /Agentic Gherkin Results/);
assert.match(summaryText, /Passing scenarios produce readable and raw reports/);
assert.match(summaryText, /Cucumber HTML/);

const scenarioDirs = await readdir(path.join(outputDir, "scenarios"));
assert.equal(scenarioDirs.length, 2);
for (const scenarioDir of scenarioDirs) {
  const rawLog = await readFile(path.join(outputDir, "scenarios", scenarioDir, "raw.jsonl"), "utf8");
  assert.match(rawLog, /"provider":"mock"/);
}

console.log(`Self feature test passed. Summary: ${summary.summaryFile}`);
