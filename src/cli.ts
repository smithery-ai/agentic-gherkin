#!/usr/bin/env node
import { loadConfig, parseCliArgs, resolveConfig } from "./config.js";
import { runAgenticGherkin } from "./runner.js";

try {
  const { configFile, overrides } = parseCliArgs(process.argv.slice(2));
  const loadedConfig = await loadConfig(configFile);
  const config = resolveConfig(loadedConfig, overrides);
  const summary = await runAgenticGherkin(config);
  console.log("Agentic Gherkin passed.");
  console.log(`Summary: ${summary.summaryFile}`);
  console.log(`Report: ${summary.reportFile}`);
  console.log(`HTML report: ${summary.htmlReportFile}`);
  console.log(`JUnit report: ${summary.junitReportFile}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
