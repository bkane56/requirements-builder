import type { RequirementsContent } from "../requirements-content";
import type { WritingClarification, WritingOrigin } from "./writing-input";
import { formatSuggestionId, type NestedCriterion, type WritingSuggestion } from "./writing-schema";

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
  return {
    ...session,
    suggestions: [...session.suggestions, ...nested],
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
