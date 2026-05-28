import { z } from "zod";

export const scenarioStatusSchema = z.enum(["pass", "fail", "blocked"]);

export const featureResultSchema = z.object({
  feature: z.string(),
  scenario: z.string(),
  status: scenarioStatusSchema,
  evidence: z.string(),
});

export const blockingIssueSchema = z.object({
  scenario: z.string(),
  reason: z.string(),
  evidence: z.string(),
});

export const agenticReportSchema = z.object({
  passed: z.boolean(),
  summary: z.string(),
  featureResults: z.array(featureResultSchema),
  blockingIssues: z.array(blockingIssueSchema),
});

export type ScenarioStatus = z.infer<typeof scenarioStatusSchema>;
export type FeatureResult = z.infer<typeof featureResultSchema>;
export type BlockingIssue = z.infer<typeof blockingIssueSchema>;
export type AgenticReport = z.infer<typeof agenticReportSchema>;

export const agenticReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["passed", "summary", "featureResults", "blockingIssues"],
  properties: {
    passed: {
      type: "boolean",
    },
    summary: {
      type: "string",
    },
    featureResults: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["feature", "scenario", "status", "evidence"],
        properties: {
          feature: {
            type: "string",
          },
          scenario: {
            type: "string",
          },
          status: {
            type: "string",
            enum: ["pass", "fail", "blocked"],
          },
          evidence: {
            type: "string",
          },
        },
      },
    },
    blockingIssues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["scenario", "reason", "evidence"],
        properties: {
          scenario: {
            type: "string",
          },
          reason: {
            type: "string",
          },
          evidence: {
            type: "string",
          },
        },
      },
    },
  },
} as const;

export function parseAgenticReport(value: unknown): AgenticReport {
  if (typeof value === "string") {
    return agenticReportSchema.parse(JSON.parse(value));
  }

  return agenticReportSchema.parse(value);
}
