import { INPUT_LIMITS } from "../constants";
import { requirementsOf, type RequirementsContent } from "../requirements-content";
import { ANALYSIS_LIMITS, formatFindingId } from "./analysis-schema";
import {
  analysisFingerprint,
  buildAnalysisInput,
  type AnalysisInput,
  type AnalysisSource,
} from "./analysis-input";

export type WritingClarification = {
  requestId: number;
  findingId: string;
  question: string;
  answer: string;
};

export type SubmittedClarification = WritingClarification & {
  analysisFingerprint: string;
};

export type WritingRequirements =
  | {
      kind: "free-text";
      businessRequirements: string;
      acceptanceCriteria: string;
      authoritative: true;
    }
  | {
      kind: "structured";
      functionalRequirements: Array<AnalysisStructuredRequirement & { authoritative: boolean }>;
      acceptanceCriteria: Array<AnalysisStructuredCriterion & { authoritative: boolean }>;
    };

type AnalysisStructuredRequirement = Extract<AnalysisInput["requirements"], { kind: "structured" }>["functionalRequirements"][number];
type AnalysisStructuredCriterion = Extract<AnalysisInput["requirements"], { kind: "structured" }>["acceptanceCriteria"][number];

export type WritingInput = {
  projectName: string;
  description: string;
  documentMode: AnalysisInput["documentMode"];
  requirements: WritingRequirements;
  stack: AnalysisInput["stack"];
  clarifications: WritingClarification[];
};

export type WritingOrigin = "free-text" | "structured";

const CLARIFICATION_KEYS = ["requestId", "findingId", "question", "answer", "analysisFingerprint"] as const;

export function readSubmittedClarifications(value: unknown): SubmittedClarification[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const clarifications: SubmittedClarification[] = [];
  for (const entry of value) {
    const clarification = readSubmittedClarification(entry);
    if (!clarification) return null;
    const key = `${clarification.requestId}:${clarification.findingId}`;
    if (seen.has(key)) return null;
    seen.add(key);
    clarifications.push(clarification);
  }
  return clarifications;
}

export function selectModelClarifications(
  config: AnalysisSource,
  submitted: readonly SubmittedClarification[],
): { included: WritingClarification[]; excludedFindingIds: string[] } {
  const actual = analysisFingerprint(buildAnalysisInput(config));
  const included: WritingClarification[] = [];
  const excludedFindingIds: string[] = [];
  for (const entry of submitted) {
    if (entry.analysisFingerprint !== actual) {
      excludedFindingIds.push(entry.findingId);
      continue;
    }
    included.push({
      requestId: entry.requestId,
      findingId: entry.findingId,
      question: entry.question,
      answer: entry.answer,
    });
  }
  included.sort(compareClarifications);
  return { included, excludedFindingIds };
}

export function buildWritingInput(config: AnalysisSource, clarifications: readonly WritingClarification[]): WritingInput {
  const analysis = buildAnalysisInput(config);
  const requirements: WritingRequirements =
    analysis.requirements.kind === "free-text"
      ? {
          kind: "free-text",
          businessRequirements: analysis.requirements.businessRequirements,
          acceptanceCriteria: analysis.requirements.acceptanceCriteria,
          authoritative: true,
        }
      : {
          kind: "structured",
          functionalRequirements: analysis.requirements.functionalRequirements.map((item) => ({
            ...item,
            authoritative: item.status === "confirmed",
          })),
          acceptanceCriteria: analysis.requirements.acceptanceCriteria.map((item) => ({
            ...item,
            requirementIds: [...item.requirementIds],
            authoritative: item.status === "confirmed",
          })),
        };
  return {
    projectName: analysis.projectName,
    description: analysis.description,
    documentMode: analysis.documentMode,
    requirements,
    stack: analysis.stack,
    clarifications: [...clarifications].sort(compareClarifications),
  };
}

export function writingFingerprint(input: WritingInput): string {
  return JSON.stringify(input);
}

export function writingSourceFingerprint(input: WritingInput): string {
  if (input.requirements.kind === "free-text") {
    return JSON.stringify({
      projectName: input.projectName,
      description: input.description,
      businessRequirements: input.requirements.businessRequirements,
      acceptanceCriteria: input.requirements.acceptanceCriteria,
      stack: input.stack,
      clarifications: input.clarifications,
    });
  }
  return JSON.stringify({
    projectName: input.projectName,
    description: input.description,
    requirements: input.requirements,
    stack: input.stack,
    clarifications: input.clarifications,
  });
}

export function currentSourceFingerprint(
  config: AnalysisSource,
  origin: WritingOrigin,
  clarifications: readonly WritingClarification[],
): string {
  if (origin === "free-text") {
    const stack = buildWritingInput(config, []).stack;
    return JSON.stringify({
      projectName: config.projectName,
      description: config.description,
      businessRequirements: config.businessRequirements,
      acceptanceCriteria: config.acceptanceCriteria,
      stack,
      clarifications: [...clarifications].sort(compareClarifications),
    });
  }
  const content = requirementsOf(config);
  const structured: RequirementsContent = { ...content, mode: "structured" };
  return writingSourceFingerprint(buildWritingInput({ ...config, requirementsContent: structured }, clarifications));
}

export function writingRequirementTexts(input: WritingInput): {
  functional: Map<string, string>;
  criteria: Map<string, string>;
} {
  const functional = new Map<string, string>();
  const criteria = new Map<string, string>();
  if (input.requirements.kind === "structured") {
    for (const item of input.requirements.functionalRequirements) functional.set(item.id, item.text);
    for (const item of input.requirements.acceptanceCriteria) criteria.set(item.id, item.text);
  }
  return { functional, criteria };
}

function readSubmittedClarification(value: unknown): SubmittedClarification | null {
  if (!isRecord(value)) return null;
  for (const key of Object.keys(value)) {
    if (key === "current") continue;
    if (!CLARIFICATION_KEYS.includes(key as (typeof CLARIFICATION_KEYS)[number])) return null;
  }
  for (const key of CLARIFICATION_KEYS) {
    if (!Object.hasOwn(value, key)) return null;
  }
  if (!isPositiveInteger(value.requestId) || typeof value.findingId !== "string" || !isFindingId(value.findingId)) return null;
  if (typeof value.question !== "string" || value.question.length < 1 || value.question.length > ANALYSIS_LIMITS.question) return null;
  if (typeof value.answer !== "string" || value.answer.length > INPUT_LIMITS.longText) return null;
  if (typeof value.analysisFingerprint !== "string") return null;
  return {
    requestId: value.requestId,
    findingId: value.findingId,
    question: value.question,
    answer: value.answer,
    analysisFingerprint: value.analysisFingerprint,
  };
}

function compareClarifications(left: WritingClarification, right: WritingClarification): number {
  return left.requestId - right.requestId || left.findingId.localeCompare(right.findingId);
}

function isFindingId(id: string): boolean {
  const match = /^F-(\d+)$/.exec(id);
  if (!match || match[1].length < 3) return false;
  const number = Number(match[1]);
  return Number.isInteger(number) && number >= 1 && id === formatFindingId(number);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
