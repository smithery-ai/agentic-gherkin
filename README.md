# Agentic Gherkin

Agentic Gherkin runs `.feature` files through Cucumber and delegates acceptance evaluation to an SDK-backed coding agent. It is intended for internal `git+` installation rather than npm publishing.

## Install

```sh
pnpm add -D git+https://github.com/smithery-ai/agentic-gherkin.git
```

## Use

Create `agentic-gherkin.config.mjs`:

```js
export default {
  features: "tests/features",
  contracts: ["docs/specs", "docs/adr", "docs/testing.md"],
  outputDir: ".context/agentic-gherkin",
  provider: process.env.AGENTIC_GHERKIN_PROVIDER ?? "codex",
  evaluationMode: "batch",
  providerOptions: {
    codex: {
      model: process.env.AGENTIC_GHERKIN_CODEX_MODEL ?? "gpt-5.4-mini",
      sandboxMode: "danger-full-access",
    },
    claude: {
      model: process.env.AGENTIC_GHERKIN_CLAUDE_MODEL ?? "sonnet",
      permissionMode: "dontAsk",
    },
  },
};
```

Run:

```sh
pnpm agentic-gherkin --config agentic-gherkin.config.mjs
pnpm agentic-gherkin --provider claude
pnpm agentic-gherkin --evaluation-mode scenario
```

Reports are written to the configured output directory:

- `summary.md`: readable scenario table with blocking issues
- `report.json`: aggregate machine-readable result
- `report.html`: Cucumber HTML report
- `junit.xml`: CI-friendly JUnit report
- `messages.ndjson`: raw Cucumber messages
- `events.jsonl`: runner events
- `scenarios/**/raw.jsonl`: per-scenario provider stream/log output
- `batch/raw.jsonl`: provider stream/log output when `evaluationMode` is `batch`

`evaluationMode: "batch"` is the default. It performs one SDK-backed agent evaluation for the whole feature set, then projects the result back through Cucumber so HTML/JUnit/per-scenario reports remain readable. Use `scenario` mode when you explicitly want one agent session per scenario.

## Providers

- `codex`: uses the OpenAI Agents SDK with the experimental Codex tool backed by `@openai/codex-sdk`.
- `claude`: uses `@anthropic-ai/claude-agent-sdk` `query()` with structured JSON output.
- `mock`: deterministic in-process evaluator used by this package's own feature tests.
