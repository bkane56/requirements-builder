import { requirementIdNumber } from "../requirements-content";

export const ANALYSIS_LIMITS = {
  findings: 12,
  explanation: 400,
  question: 240,
  suggestedAction: 240,
  uncertainty: 240,
  relatedIds: 20,
} as const;

export const ANALYSIS_OUTPUT_TOKEN_BUDGET = 2000;

export const ANALYSIS_REQUEST_MAX_BYTES = 64 * 1024;

export const ANALYSIS_SCHEMA_NAME = "requirements_analysis";

export const ANALYSIS_CATEGORIES = [
  "missing_detail",
  "ambiguity",
  "contradiction",
  "stack_conflict",
  "error_handling",
  "acceptance_criteria",
  "external_dependency",
  "security_privacy",
  "nonfunctional",
] as const;

export const ANALYSIS_SEVERITIES = ["high", "medium", "low"] as const;

export type AnalysisCategory = (typeof ANALYSIS_CATEGORIES)[number];
export type AnalysisSeverity = (typeof ANALYSIS_SEVERITIES)[number];

export type AnalysisFinding = {
  id: string;
  category: AnalysisCategory;
  severity: AnalysisSeverity;
  explanation: string;
  relatedRequirementIds: string[];
  question: string | null;
  suggestedAction: string | null;
  uncertainty: string | null;
};

export type AnalysisResult = {
  findings: AnalysisFinding[];
};

const MODEL_KEYS = [
  "category",
  "severity",
  "explanation",
  "relatedRequirementIds",
  "question",
  "suggestedAction",
  "uncertainty",
] as const;

const RESULT_KEYS = ["id", ...MODEL_KEYS] as const;

// OpenAI strict structured outputs accept pattern and maxItems. They do not accept maxLength.
// The pattern below is the provider constraint. parseAnalysisResult enforces the same limits
// and rejects an over-length string instead of truncating it.
function lengthPattern(min: number, max: number): string {
  return `^[\\s\\S]{${min},${max}}$`;
}

function requiredText(max: number) {
  return { type: "string", pattern: lengthPattern(1, max) };
}

function optionalText(max: number) {
  return { anyOf: [requiredText(max), { type: "null" }] };
}

export const ANALYSIS_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      maxItems: ANALYSIS_LIMITS.findings,
      items: {
        type: "object",
        additionalProperties: false,
        required: [...MODEL_KEYS],
        properties: {
          category: { type: "string", enum: [...ANALYSIS_CATEGORIES] },
          severity: { type: "string", enum: [...ANALYSIS_SEVERITIES] },
          explanation: requiredText(ANALYSIS_LIMITS.explanation),
          relatedRequirementIds: {
            type: "array",
            maxItems: ANALYSIS_LIMITS.relatedIds,
            items: { type: "string", pattern: "^(FR|AC)-[0-9]{3,}$" },
          },
          question: optionalText(ANALYSIS_LIMITS.question),
          suggestedAction: optionalText(ANALYSIS_LIMITS.suggestedAction),
          uncertainty: optionalText(ANALYSIS_LIMITS.uncertainty),
        },
      },
    },
  },
};

export function parseAnalysisResult(value: unknown, knownIds: ReadonlySet<string>): AnalysisResult | null {
  const findings = readFindings(value, knownIds, false);
  if (!findings) return null;
  return {
    findings: findings.map((finding, index) => ({ ...finding, id: formatFindingId(index + 1) })),
  };
}

export function readAnalysisResult(value: unknown): AnalysisResult | null {
  const findings = readFindings(value, null, true);
  if (!findings) return null;
  if (new Set(findings.map((finding) => finding.id)).size !== findings.length) return null;
  return { findings };
}

export function formatFindingId(number: number): string {
  return `F-${String(number).padStart(3, "0")}`;
}

function readFindings(
  value: unknown,
  knownIds: ReadonlySet<string> | null,
  expectId: boolean,
): AnalysisFinding[] | null {
  if (!isRecord(value) || !sameKeys(value, ["findings"]) || !Array.isArray(value.findings)) return null;
  if (value.findings.length > ANALYSIS_LIMITS.findings) return null;
  const findings: AnalysisFinding[] = [];
  for (const entry of value.findings) {
    const finding = readFinding(entry, knownIds, expectId);
    if (!finding) return null;
    findings.push(finding);
  }
  return findings;
}

function readFinding(entry: unknown, knownIds: ReadonlySet<string> | null, expectId: boolean): AnalysisFinding | null {
  if (!isRecord(entry) || !sameKeys(entry, expectId ? RESULT_KEYS : MODEL_KEYS)) return null;
  if (!includes(ANALYSIS_CATEGORIES, entry.category) || !includes(ANALYSIS_SEVERITIES, entry.severity)) return null;
  const explanation = readBoundedText(entry.explanation, ANALYSIS_LIMITS.explanation);
  const question = readNullableText(entry.question, ANALYSIS_LIMITS.question);
  const suggestedAction = readNullableText(entry.suggestedAction, ANALYSIS_LIMITS.suggestedAction);
  const uncertainty = readNullableText(entry.uncertainty, ANALYSIS_LIMITS.uncertainty);
  const relatedRequirementIds = readRelatedIds(entry.relatedRequirementIds, knownIds);
  if (explanation === null || question === undefined || suggestedAction === undefined || uncertainty === undefined) {
    return null;
  }
  if (!relatedRequirementIds) return null;
  if (!expectId) {
    return {
      id: "",
      category: entry.category,
      severity: entry.severity,
      explanation,
      relatedRequirementIds,
      question,
      suggestedAction,
      uncertainty,
    };
  }
  if (typeof entry.id !== "string" || findingIdNumber(entry.id) === null) return null;
  return {
    id: entry.id,
    category: entry.category,
    severity: entry.severity,
    explanation,
    relatedRequirementIds,
    question,
    suggestedAction,
    uncertainty,
  };
}

function readBoundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > max) return null;
  return value;
}

function readNullableText(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > max) return undefined;
  return value;
}

function readRelatedIds(value: unknown, knownIds: ReadonlySet<string> | null): string[] | null {
  if (!Array.isArray(value) || value.length > ANALYSIS_LIMITS.relatedIds) return null;
  const ids: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || !isRequirementId(id)) return null;
    if (knownIds && !knownIds.has(id)) return null;
    ids.push(id);
  }
  if (new Set(ids).size !== ids.length) return null;
  return ids;
}

function isRequirementId(id: string): boolean {
  return requirementIdNumber("FR", id) !== null || requirementIdNumber("AC", id) !== null;
}

function findingIdNumber(id: string): number | null {
  const match = /^F-(\d+)$/.exec(id);
  if (!match || match[1].length < 3) return null;
  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1 || id !== formatFindingId(number)) return null;
  return number;
}

function sameKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
