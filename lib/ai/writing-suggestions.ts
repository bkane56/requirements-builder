import { INPUT_LIMITS } from "../constants";
import { requirementIdNumber, type RequirementsContent } from "../requirements-content";
import { ANALYSIS_LIMITS, isAnalysisFindingId } from "./analysis-schema";
import type { WritingClarification, WritingOrigin } from "./writing-input";
import { formatSuggestionId, WRITING_LIMITS, type NestedCriterion, type WritingSuggestion } from "./writing-schema";

export type WritingSession = {
  requestId: number;
  origin: WritingOrigin;
  sourceFingerprint: string;
  writingFingerprint: string;
  suggestions: WritingSuggestion[];
  dismissedIds: string[];
  acceptedIds: string[];
  nextSuggestionNumber: number;
  includedClarifications: WritingClarification[];
};

export function dismissSuggestion(session: WritingSession, id: string): WritingSession {
  const suggestion = session.suggestions.find((item) => item.id === id);
  if (!suggestion || suggestion.kind === "question" || session.acceptedIds.includes(id)) return session;
  if (session.dismissedIds.includes(id)) return session;
  return { ...session, dismissedIds: [...session.dismissedIds, id] };
}

export function editSuggestionText(session: WritingSession, id: string, text: string): WritingSession {
  if (session.dismissedIds.includes(id) || session.acceptedIds.includes(id)) return session;
  return {
    ...session,
    suggestions: session.suggestions.map((item) => {
      if (item.id !== id || item.kind === "question") return item;
      return { ...item, text };
    }),
  };
}

export function editNestedCriterionText(session: WritingSession, parentId: string, index: number, text: string): WritingSession {
  if (session.dismissedIds.includes(parentId) || session.acceptedIds.includes(parentId)) return session;
  return {
    ...session,
    suggestions: session.suggestions.map((item) => {
      if (item.id !== parentId || item.kind !== "new-functional") return item;
      return {
        ...item,
        nestedCriteria: item.nestedCriteria.map((criterion, criterionIndex) =>
          criterionIndex === index ? { ...criterion, text } : criterion,
        ),
      };
    }),
  };
}

export function detachNestedCriteria(
  session: WritingSession,
  parentId: string,
  functionalRequirementId: string,
): WritingSession | null {
  const parent = session.suggestions.find((item) => item.id === parentId);
  if (!parent || parent.kind !== "new-functional") return null;
  if (session.dismissedIds.includes(parentId) || session.acceptedIds.includes(parentId)) return null;
  let number = session.nextSuggestionNumber;
  const nested: WritingSuggestion[] = parent.nestedCriteria.map((criterion) => {
    const suggestion: WritingSuggestion = {
      id: formatSuggestionId(number),
      kind: "new-criterion",
      text: criterion.text,
      rationale: criterion.rationale,
      uncertainty: null,
      scope: "requirement",
      requirementIds: [functionalRequirementId],
    };
    number += 1;
    return suggestion;
  });
  const detachedIds = nested.map((suggestion) => suggestion.id);
  return {
    ...session,
    suggestions: [
      ...session.suggestions.map((item) =>
        item.kind === "new-functional" && item.id === parentId ? { ...item, detachedIds } : item,
      ),
      ...nested,
    ],
    acceptedIds: [...session.acceptedIds, parentId],
    nextSuggestionNumber: number,
  };
}

export function activeNestedCriteria(session: WritingSession, parentId: string): NestedCriterion[] {
  const parent = session.suggestions.find((item) => item.id === parentId);
  if (!parent || parent.kind !== "new-functional") return [];
  if (session.dismissedIds.includes(parentId) || session.acceptedIds.includes(parentId)) return [];
  return parent.nestedCriteria;
}

export function exactTextExists(content: RequirementsContent, text: string): boolean {
  return (
    content.functionalRequirements.some((item) => item.text === text) ||
    content.acceptanceCriteria.some((item) => item.text === text)
  );
}

export function criterionLinkMissing(content: RequirementsContent, suggestion: WritingSuggestion): boolean {
  if (suggestion.kind !== "new-criterion" || suggestion.scope !== "requirement") return false;
  const ids = new Set(content.functionalRequirements.map((item) => item.id));
  return suggestion.requirementIds.some((id) => !ids.has(id));
}

export function includedAnswersMatch(
  included: readonly WritingClarification[],
  live: readonly Pick<WritingClarification, "requestId" | "findingId" | "question" | "answer">[],
): boolean {
  return included.every((item) =>
    live.some(
      (entry) =>
        entry.requestId === item.requestId &&
        entry.findingId === item.findingId &&
        entry.question === item.question &&
        entry.answer === item.answer,
    ),
  );
}

const STORED_SUGGESTION_LIMIT =
  WRITING_LIMITS.newFunctional +
  WRITING_LIMITS.revisedFunctional +
  WRITING_LIMITS.newCriteria +
  WRITING_LIMITS.revisedCriteria +
  WRITING_LIMITS.questions +
  WRITING_LIMITS.newFunctional * WRITING_LIMITS.nestedCriteria;

const SESSION_KEYS = [
  "requestId",
  "origin",
  "sourceFingerprint",
  "writingFingerprint",
  "suggestions",
  "dismissedIds",
  "acceptedIds",
  "nextSuggestionNumber",
  "includedClarifications",
] as const;

// Nested criteria have no ids. Detach records the suggestion ids it creates, and restoration trusts that list.
// It does not match text, invent ids, or mark a detached criterion accepted.
export function parseStoredWritingSession(value: unknown): WritingSession | null {
  if (!isRecord(value) || !sameKeys(value, SESSION_KEYS)) return null;
  if (!isPositiveInteger(value.requestId) || (value.origin !== "free-text" && value.origin !== "structured")) return null;
  if (typeof value.sourceFingerprint !== "string" || typeof value.writingFingerprint !== "string") return null;
  if (!Array.isArray(value.suggestions) || value.suggestions.length > STORED_SUGGESTION_LIMIT) return null;
  const suggestions: WritingSuggestion[] = [];
  for (const entry of value.suggestions) {
    const suggestion = readSuggestion(entry);
    if (!suggestion) return null;
    suggestions.push(suggestion);
  }
  if (new Set(suggestions.map((item) => item.id)).size !== suggestions.length) return null;
  const dismissedIds = readIdList(value.dismissedIds);
  const acceptedIds = readIdList(value.acceptedIds);
  const includedClarifications = readIncludedClarifications(value.includedClarifications);
  if (!dismissedIds || !acceptedIds || !includedClarifications) return null;
  if (!idsAreConsistent(suggestions, dismissedIds, acceptedIds)) return null;
  const maxNumber = suggestions.reduce((max, item) => Math.max(max, suggestionNumber(item.id) ?? 0), 0);
  if (!isPositiveInteger(value.nextSuggestionNumber) || value.nextSuggestionNumber <= maxNumber) return null;
  return {
    requestId: value.requestId,
    origin: value.origin,
    sourceFingerprint: value.sourceFingerprint,
    writingFingerprint: value.writingFingerprint,
    suggestions,
    dismissedIds,
    acceptedIds,
    nextSuggestionNumber: value.nextSuggestionNumber,
    includedClarifications,
  };
}

function idsAreConsistent(suggestions: readonly WritingSuggestion[], dismissedIds: readonly string[], acceptedIds: readonly string[]): boolean {
  const byId = new Map(suggestions.map((item) => [item.id, item]));
  if (dismissedIds.some((id) => acceptedIds.includes(id))) return false;
  for (const id of [...dismissedIds, ...acceptedIds]) {
    const suggestion = byId.get(id);
    if (!suggestion || suggestion.kind === "question") return false;
  }
  const claimed = new Set<string>();
  for (const suggestion of suggestions) {
    if (suggestion.kind !== "new-functional") continue;
    const detachedIds = suggestion.detachedIds ?? [];
    if (!acceptedIds.includes(suggestion.id)) {
      if (detachedIds.length > 0) return false;
      continue;
    }
    if (detachedIds.length !== suggestion.nestedCriteria.length) return false;
    for (const id of detachedIds) {
      if (claimed.has(id)) return false;
      claimed.add(id);
      const detached = byId.get(id);
      if (!detached || detached.kind !== "new-criterion") return false;
    }
  }
  return true;
}

function readSuggestion(value: unknown): WritingSuggestion | null {
  if (!isRecord(value) || typeof value.id !== "string" || suggestionNumber(value.id) === null || typeof value.kind !== "string") {
    return null;
  }
  if (value.kind === "question") return readQuestion(value);
  if (value.kind === "new-functional") return readNewFunctional(value);
  if (value.kind === "new-criterion") return readNewCriterion(value);
  if (value.kind === "revise-functional") return readRevision(value, "revise-functional", "FR");
  if (value.kind === "revise-criterion") return readRevision(value, "revise-criterion", "AC");
  return null;
}

function readNewFunctional(value: Record<string, unknown>): WritingSuggestion | null {
  if (!sameKeys(value, ["id", "kind", "text", "rationale", "uncertainty", "nestedCriteria"], ["detachedIds"])) return null;
  if (typeof value.id !== "string" || typeof value.text !== "string" || typeof value.rationale !== "string") return null;
  const uncertainty = readUncertainty(value.uncertainty);
  const nestedCriteria = readNestedCriteria(value.nestedCriteria);
  const detachedIds = Object.hasOwn(value, "detachedIds") ? readDetachedIds(value.detachedIds) : [];
  if (uncertainty === undefined || !nestedCriteria || !detachedIds) return null;
  const suggestion: WritingSuggestion = {
    id: value.id,
    kind: "new-functional",
    text: value.text,
    rationale: value.rationale,
    uncertainty,
    nestedCriteria,
  };
  if (detachedIds.length > 0) suggestion.detachedIds = detachedIds;
  return suggestion;
}

function readNewCriterion(value: Record<string, unknown>): WritingSuggestion | null {
  if (!sameKeys(value, ["id", "kind", "text", "rationale", "uncertainty", "scope", "requirementIds"])) return null;
  if (typeof value.id !== "string" || typeof value.text !== "string" || typeof value.rationale !== "string") return null;
  if (value.scope !== "project" && value.scope !== "requirement") return null;
  const uncertainty = readUncertainty(value.uncertainty);
  const requirementIds = readRequirementIds(value.requirementIds, "FR");
  if (uncertainty === undefined || !requirementIds) return null;
  if (value.scope === "project" && requirementIds.length > 0) return null;
  if (value.scope === "requirement" && requirementIds.length === 0) return null;
  return {
    id: value.id,
    kind: "new-criterion",
    text: value.text,
    rationale: value.rationale,
    uncertainty,
    scope: value.scope,
    requirementIds,
  };
}

function readRevision(
  value: Record<string, unknown>,
  kind: "revise-functional" | "revise-criterion",
  prefix: "FR" | "AC",
): WritingSuggestion | null {
  if (!sameKeys(value, ["id", "kind", "targetId", "text", "rationale", "uncertainty"])) return null;
  if (typeof value.id !== "string" || typeof value.targetId !== "string" || requirementIdNumber(prefix, value.targetId) === null) {
    return null;
  }
  if (typeof value.text !== "string" || typeof value.rationale !== "string") return null;
  const uncertainty = readUncertainty(value.uncertainty);
  if (uncertainty === undefined) return null;
  if (kind === "revise-functional") {
    return { id: value.id, kind, targetId: value.targetId, text: value.text, rationale: value.rationale, uncertainty };
  }
  return { id: value.id, kind, targetId: value.targetId, text: value.text, rationale: value.rationale, uncertainty };
}

function readQuestion(value: Record<string, unknown>): WritingSuggestion | null {
  if (!sameKeys(value, ["id", "kind", "question", "whyNeeded", "relatedRequirementIds"])) return null;
  if (typeof value.id !== "string" || typeof value.question !== "string" || typeof value.whyNeeded !== "string") return null;
  const relatedRequirementIds = readEitherRequirementIds(value.relatedRequirementIds);
  if (!relatedRequirementIds) return null;
  return { id: value.id, kind: "question", question: value.question, whyNeeded: value.whyNeeded, relatedRequirementIds };
}

function readNestedCriteria(value: unknown): NestedCriterion[] | null {
  if (!Array.isArray(value) || value.length > WRITING_LIMITS.nestedCriteria) return null;
  const criteria: NestedCriterion[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !sameKeys(entry, ["text", "rationale"])) return null;
    if (typeof entry.text !== "string" || typeof entry.rationale !== "string") return null;
    criteria.push({ text: entry.text, rationale: entry.rationale });
  }
  return criteria;
}

function readIncludedClarifications(value: unknown): WritingClarification[] | null {
  if (!Array.isArray(value) || value.length > ANALYSIS_LIMITS.findings) return null;
  const clarifications: WritingClarification[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || !sameKeys(entry, ["requestId", "findingId", "question", "answer"])) return null;
    if (!isPositiveInteger(entry.requestId) || !isAnalysisFindingId(entry.findingId)) return null;
    if (typeof entry.question !== "string" || typeof entry.answer !== "string" || entry.answer.length > INPUT_LIMITS.longText) {
      return null;
    }
    const key = `${entry.requestId}:${entry.findingId}`;
    if (seen.has(key)) return null;
    seen.add(key);
    clarifications.push({
      requestId: entry.requestId,
      findingId: entry.findingId,
      question: entry.question,
      answer: entry.answer,
    });
  }
  return clarifications;
}

function readDetachedIds(value: unknown): string[] | null {
  const ids = readIdList(value);
  if (!ids || ids.some((id) => suggestionNumber(id) === null)) return null;
  return ids;
}

function readIdList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  if (new Set(value).size !== value.length) return null;
  return value;
}

function readRequirementIds(value: unknown, prefix: "FR" | "AC"): string[] | null {
  if (!Array.isArray(value) || value.length > WRITING_LIMITS.relatedIds) return null;
  const ids: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || requirementIdNumber(prefix, id) === null) return null;
    ids.push(id);
  }
  if (new Set(ids).size !== ids.length) return null;
  return ids;
}

function readEitherRequirementIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > WRITING_LIMITS.relatedIds) return null;
  const ids: string[] = [];
  for (const id of value) {
    if (typeof id !== "string") return null;
    if (requirementIdNumber("FR", id) === null && requirementIdNumber("AC", id) === null) return null;
    ids.push(id);
  }
  if (new Set(ids).size !== ids.length) return null;
  return ids;
}

function readUncertainty(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

function suggestionNumber(id: string): number | null {
  const match = /^W-(\d+)$/.exec(id);
  if (!match || match[1].length < 3) return null;
  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1 || formatSuggestionId(number) !== id) return null;
  return number;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function sameKeys(value: Record<string, unknown>, keys: readonly string[], optional: readonly string[] = []): boolean {
  if (!keys.every((key) => Object.hasOwn(value, key))) return false;
  return Object.keys(value).every((key) => keys.includes(key) || optional.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
