import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "../src/config.js";
import { runFeatureExecutor, selectFeatureExecutor } from "../src/feature-executors.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

{
  const config = resolveConfig({
    cwd: repoRoot,
    features: "tests/features/agentic-gherkin-runner.feature",
    featureExecutors: [
      {
        name: "runner-feature-e2e",
        features: "./tests/features/agentic-gherkin-runner.feature",
        command: ["node", "-e", "process.exit(0)"],
      },
    ],
  });

  const selection = selectFeatureExecutor(config);
  assert.equal(selection?.displayName, "runner-feature-e2e");
}

{
  const config = resolveConfig({
    cwd: repoRoot,
    features: "tests/features",
    featureExecutors: [
      {
        name: "runner-feature-e2e",
        features: "tests/features/agentic-gherkin-runner.feature",
        command: ["node", "-e", "process.exit(0)"],
      },
    ],
  });

  assert.equal(selectFeatureExecutor(config), undefined);
}

{
  const outputDir = mkdtempSync(path.join(tmpdir(), "agentic-gherkin-executor-"));
  const markerFile = path.join(outputDir, "marker.txt");
  const config = resolveConfig({
    cwd: repoRoot,
    features: "tests/features/agentic-gherkin-runner.feature",
    featureExecutors: [
      {
        name: "marker-writer",
        features: "tests/features/agentic-gherkin-runner.feature",
        command: [
          "node",
          "-e",
          `require("node:fs").writeFileSync(${JSON.stringify(markerFile)}, "executed")`,
        ],
      },
    ],
  });

  const selection = selectFeatureExecutor(config);
  assert.ok(selection);
  runFeatureExecutor(config, selection);
  assert.equal(existsSync(markerFile), true);
  assert.equal(readFileSync(markerFile, "utf8"), "executed");
}

console.log("Feature executor tests passed.");
