import type { ResolvedAgenticGherkinConfig } from "./types.js";

export async function buildScenarioPrompt(
  config: ResolvedAgenticGherkinConfig,
  request: {
    feature: string;
    scenario: string;
    uri: string;
    line: number;
    featureSource: string;
  },
): Promise<string> {
  const rules = [
    "Do not edit files.",
    "You may inspect source, docs, tests, package scripts, CI workflow files, and run targeted local commands.",
    "Passing automated tests alone is not enough. Decide whether the named feature scenario itself is implemented.",
    "Report only the scenario named above. Do not include other scenarios.",
    "Return JSON only, matching the provided schema.",
    'featureResults must contain exactly one item for the scenario under test.',
    "Copy the feature and scenario labels exactly as shown. Do not shorten or paraphrase them.",
    'passed must be true if and only if that scenario status is "pass".',
    "blockingIssues must be empty for a passing scenario and non-empty for a failing or blocked scenario.",
    ...config.rules,
  ];

  if (config.buildPrompt !== undefined) {
    return await config.buildPrompt({
      ...request,
      contracts: config.contracts,
      rules,
      forbiddenCommands: config.forbiddenCommands,
    });
  }

  const contractText =
    config.contracts.length === 0
      ? "Use the repository documentation, tests, and source as the relevant contracts."
      : `Use these project contracts:\n${config.contracts.map((contract) => `- ${contract}`).join("\n")}`;
  const forbiddenText =
    config.forbiddenCommands.length === 0
      ? ""
      : `\nForbidden commands:\n${config.forbiddenCommands
          .map((command) => `- Do not run "${command}"; that would recurse or exceed this check.`)
          .join("\n")}\n`;

  return `${config.promptIntro}

Your job is to manually walk exactly one Cucumber scenario against the local project.

${contractText}

Scenario under test:
- file: ${request.uri}
- feature: ${request.feature}
- scenario: ${request.scenario}
- line: ${request.line}
${forbiddenText}
Rules:
${rules.map((rule) => `- ${rule}`).join("\n")}

Feature file:

\`\`\`gherkin
${request.featureSource}
\`\`\`
`;
}
