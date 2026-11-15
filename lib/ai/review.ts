import { INPUT_LIMITS } from "../constants";
import {
  addAcceptanceCriterion,
  addFunctionalRequirement,
  formatRequirementId,
  normalizeRequirementsContent,
  updateAcceptanceCriterion,
  updateFunctionalRequirement,
  type AcceptanceCriterion,
  type CriterionScope,
  type FunctionalRequirement,
  type RequirementSource,
  type RequirementsContent,
  type RequirementStatus,
} from "../requirements-content";
import type { AnalysisCategory, AnalysisFinding } from "./analysis-schema";

export const REVIEW_DECISIONS = ["open", "addressed", "dismissed", "deferred"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export type AppliedChange = {
  kind: "functional" | "criterion";
  id: string;
};

export type ReviewRecord = {
  decision: ReviewDecision;
  answer?: string;
  applied?: AppliedChange;
  answerCheckedFingerprint?: string;
};

export type ReviewSession = {
  requestId: number;
  fingerprint: string;
  records: Record<string, ReviewRecord>;
};

export type Stage6Clarification = {
  requestId: number;
  findingId: string;
  fingerprint: string;
  question: string;
  answer: string;
  current: boolean;
  authorizedForModel: boolean;
};

export type RequirementDraft =
  | { action: "create-functional"; text: string; source?: RequirementSource }
  | { action: "create-criterion"; text: string; scope: CriterionScope; requirementIds: string[]; source?: RequirementSource }
  | { action: "update-functional"; id: string; text: string; replaceConfirmed: boolean }
  | { action: "update-criterion"; id: string; text: string; replaceConfirmed: boolean };

export type RequirementChangePreview = {
  action: RequirementDraft["action"];
  id: string;
  text: string;
  source: RequirementSource;
  status: RequirementStatus;
  scope: CriterionScope | null;
  requirementIds: string[];
  replacesConfirmed: boolean;
  currentText: string | null;
};

export type PreparedRequirementChange = {
  fingerprint: string;
  preview: RequirementChangePreview;
};

const CONTRADICTION_CATEGORIES: readonly AnalysisCategory[] = ["contradiction", "stack_conflict", "security_privacy"];

export function reviewKey(requestId: number, findingId: string): string {
  return `${requestId}:${findingId}`;
}

export function emptyReviewSession(requestId: number, fingerprint: string): ReviewSession {
  return { requestId, fingerprint, records: {} };
}

export function reviewRecord(session: ReviewSession, findingId: string): ReviewRecord {
  return session.records[reviewKey(session.requestId, findingId)] ?? { decision: "open" };
}

export function setReviewDecision(session: ReviewSession, findingId: string, decision: ReviewDecision): ReviewSession {
  return withRecord(session, findingId, { decision });
}

export function setReviewAnswer(
  session: ReviewSession,
  findingId: string,
  answer: string,
  currentFingerprint?: string,
): ReviewSession | null {
  if (answer.length > INPUT_LIMITS.longText) return null;
  const key = reviewKey(session.requestId, findingId);
  const next = withRecord(session, findingId, { answer });
  const record = { ...next.records[key] };
  if (currentFingerprint !== undefined && currentFingerprint === session.fingerprint) {
    record.answerCheckedFingerprint = currentFingerprint;
  } else {
    delete record.answerCheckedFingerprint;
  }
  return { ...next, records: { ...next.records, [key]: record } };
}

export function confirmAnswerForCurrentRequirements(
  session: ReviewSession,
  findingId: string,
  currentFingerprint: string,
): ReviewSession | null {
  const record = reviewRecord(session, findingId);
  if (record.answer === undefined) return null;
  return withRecord(session, findingId, { answerCheckedFingerprint: currentFingerprint });
}

export function markReviewApplied(session: ReviewSession, findingId: string, applied: AppliedChange): ReviewSession {
  return withRecord(session, findingId, { applied });
}

export function sessionHasReviewWork(session: ReviewSession): boolean {
  return Object.values(session.records).some(
    (record) => record.decision !== "open" || record.answer !== undefined || record.applied !== undefined,
  );
}

export function reviewCounts(session: ReviewSession, findingIds: readonly string[]): Record<ReviewDecision, number> {
  const counts: Record<ReviewDecision, number> = { open: 0, addressed: 0, dismissed: 0, deferred: 0 };
  for (const findingId of findingIds) counts[reviewRecord(session, findingId).decision] += 1;
  return counts;
}

export function findingGroup(finding: Pick<AnalysisFinding, "question" | "category">): "clarification" | "contradiction" | "enhancement" {
  if (finding.question !== null) return "clarification";
  if (CONTRADICTION_CATEGORIES.includes(finding.category)) return "contradiction";
  return "enhancement";
}

export function clarificationAnswersForWriting(
  session: ReviewSession,
  findings: readonly Pick<AnalysisFinding, "id" | "question">[],
  currentFingerprint: string,
): Stage6Clarification[] {
  const answers: Stage6Clarification[] = [];
  for (const finding of findings) {
    if (finding.question === null) continue;
    const record = session.records[reviewKey(session.requestId, finding.id)];
    if (!record || record.answer === undefined) continue;
    answers.push({
      requestId: session.requestId,
      findingId: finding.id,
      fingerprint: session.fingerprint,
      question: finding.question,
      answer: record.answer,
      current: session.fingerprint === currentFingerprint,
      authorizedForModel: record.answerCheckedFingerprint === currentFingerprint,
    });
  }
  return answers;
}

export function previewRequirementChange(
  content: RequirementsContent,
  draft: RequirementDraft,
): RequirementChangePreview | null {
  if (content.mode !== "structured") return null;
  const text = applicableText(draft.text);
  if (text === null) return null;
  const current = normalizeRequirementsContent(content);
  if (draft.action === "create-functional") {
    return {
      action: draft.action,
      id: formatRequirementId("FR", current.nextFunctionalNumber),
      text,
      source: draft.source ?? "user",
      status: "proposed",
      scope: null,
      requirementIds: [],
      replacesConfirmed: false,
      currentText: null,
    };
  }
  if (draft.action === "create-criterion") {
    if (!validLinks(current, draft.scope, draft.requirementIds)) return null;
    return {
      action: draft.action,
      id: formatRequirementId("AC", current.nextCriterionNumber),
      text,
      source: draft.source ?? "user",
      status: "proposed",
      scope: draft.scope,
      requirementIds: draft.scope === "project" ? [] : [...draft.requirementIds],
      replacesConfirmed: false,
      currentText: null,
    };
  }
  const item = findItem(current, draft.action, draft.id);
  if (!item) return null;
  return {
    action: draft.action,
    id: item.id,
    text,
    source: item.source,
    status: item.status,
    scope: "scope" in item ? item.scope : null,
    requirementIds: "requirementIds" in item ? [...item.requirementIds] : [],
    replacesConfirmed: item.status === "confirmed",
    currentText: item.text,
  };
}

export function requirementsChangeFingerprint(content: RequirementsContent): string {
  const current = normalizeRequirementsContent(content);
  return JSON.stringify({
    mode: current.mode,
    nextFunctionalNumber: current.nextFunctionalNumber,
    nextCriterionNumber: current.nextCriterionNumber,
    functionalRequirements: current.functionalRequirements.map((item) => ({
      id: item.id,
      text: item.text,
      source: item.source,
      status: item.status,
    })),
    acceptanceCriteria: current.acceptanceCriteria.map((item) => ({
      id: item.id,
      text: item.text,
      source: item.source,
      status: item.status,
      scope: item.scope,
      requirementIds: [...item.requirementIds],
    })),
  });
}

export function prepareRequirementChange(
  content: RequirementsContent,
  draft: RequirementDraft,
): PreparedRequirementChange | null {
  const preview = previewRequirementChange(content, draft);
  if (!preview) return null;
  return { fingerprint: requirementsChangeFingerprint(content), preview };
}

export function applyRequirementChange(
  content: RequirementsContent,
  draft: RequirementDraft,
  prepared: PreparedRequirementChange,
): RequirementsContent | null {
  if (requirementsChangeFingerprint(content) !== prepared.fingerprint) return null;
  const preview = previewRequirementChange(content, draft);
  if (!preview || !samePreview(preview, prepared.preview)) return null;
  if (preview.replacesConfirmed && !("replaceConfirmed" in draft && draft.replaceConfirmed)) return null;
  if (draft.action === "create-functional") {
    return addFunctionalRequirement(content, preview.text, { source: preview.source, status: "proposed" });
  }
  if (draft.action === "create-criterion") {
    return addAcceptanceCriterion(content, {
      scope: draft.scope,
      text: preview.text,
      requirementIds: draft.requirementIds,
      source: preview.source,
      status: "proposed",
    });
  }
  if (draft.action === "update-functional") return updateFunctionalRequirement(content, draft.id, { text: preview.text });
  return updateAcceptanceCriterion(content, draft.id, { text: preview.text });
}

function withRecord(session: ReviewSession, findingId: string, patch: Partial<ReviewRecord>): ReviewSession {
  const key = reviewKey(session.requestId, findingId);
  const current = reviewRecord(session, findingId);
  return {
    ...session,
    records: {
      ...session.records,
      [key]: { ...current, ...patch },
    },
  };
}

function samePreview(left: RequirementChangePreview, right: RequirementChangePreview): boolean {
  return (
    left.action === right.action &&
    left.id === right.id &&
    left.text === right.text &&
    left.source === right.source &&
    left.status === right.status &&
    left.scope === right.scope &&
    left.replacesConfirmed === right.replacesConfirmed &&
    left.currentText === right.currentText &&
    left.requirementIds.length === right.requirementIds.length &&
    left.requirementIds.every((id, index) => id === right.requirementIds[index])
  );
}

function applicableText(text: string): string | null {
  if (text.trim().length === 0 || text.length > INPUT_LIMITS.longText) return null;
  return text;
}

function validLinks(content: RequirementsContent, scope: CriterionScope, ids: readonly string[]): boolean {
  if (scope === "project") return ids.length === 0;
  if (ids.length === 0 || new Set(ids).size !== ids.length) return false;
  const known = new Set(content.functionalRequirements.map((item) => item.id));
  return ids.every((id) => known.has(id));
}

function findItem(
  content: RequirementsContent,
  action: "update-functional" | "update-criterion",
  id: string,
): FunctionalRequirement | AcceptanceCriterion | null {
  if (action === "update-functional") return content.functionalRequirements.find((item) => item.id === id) ?? null;
  return content.acceptanceCriteria.find((item) => item.id === id) ?? null;
}
