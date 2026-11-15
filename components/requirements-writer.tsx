"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { analysisFingerprint, buildAnalysisInput } from "@/lib/ai/analysis-input";
import {
  applyRequirementChange,
  prepareRequirementChange,
  requirementsChangeFingerprint,
  type PreparedRequirementChange,
  type RequirementDraft,
  type Stage6Clarification,
} from "@/lib/ai/review";
import type { ProjectConfig } from "@/lib/config";
import { requirementsOf } from "@/lib/requirements-content";
import { UI_TEXT } from "@/lib/ui-text";
import {
  currentSourceFingerprint,
  type WritingClarification,
} from "@/lib/ai/writing-input";
import {
  criterionLinkMissing,
  detachNestedCriteria,
  dismissSuggestion,
  editNestedCriterionText,
  editSuggestionText,
  exactTextExists,
  includedAnswersMatch,
  type WritingSession,
} from "@/lib/ai/writing-suggestions";
import { type WritingSuggestion } from "@/lib/ai/writing-schema";

const WRITING_ERRORS = ["unavailable", "too-large", "invalid-request", "timeout", "provider", "invalid-response", "rate-limited"] as const;

type WritingError = (typeof WRITING_ERRORS)[number];

type PreparedSuggestion = {
  suggestionId: string;
  prepared: PreparedRequirementChange;
  replaceConfirmed: boolean;
};

type PendingSuggestionApply = {
  suggestionId: string;
  expectedFingerprint: string;
  prepared: PreparedRequirementChange;
  functionalId: string | null;
};

export function RequirementsWriter({
  config,
  resetGeneration,
  clarifications,
  privacyAcknowledged,
  interactionBlocked,
  onNeedPrivacy,
  onApplyPrepared,
}: {
  config: ProjectConfig;
  resetGeneration: number;
  clarifications: readonly Stage6Clarification[];
  privacyAcknowledged: boolean;
  interactionBlocked: boolean;
  onNeedPrivacy: (trigger: HTMLElement, continueWriting: () => void) => void;
  onApplyPrepared: (draft: RequirementDraft, prepared: PreparedRequirementChange) => void;
}) {
  const content = requirementsOf(config);
  const [draft, setDraft] = useState<WritingSession | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState<WritingError | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [transitionNotice, setTransitionNotice] = useState<string | null>(null);
  const [preparedSuggestion, setPreparedSuggestion] = useState<PreparedSuggestion | null>(null);
  const [pendingApply, setPendingApply] = useState<PendingSuggestionApply | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const startedRef = useRef(0);
  const appliedRef = useRef(0);
  const replacementCancelRef = useRef<HTMLButtonElement>(null);
  const replacementConfirmation = useInlineConfirmation(confirmingId !== null, replacementCancelRef);
  const [resetSeen, setResetSeen] = useState(resetGeneration);
  const resetSeenRef = useRef(resetGeneration);
  const clearingReset = resetSeen !== 0 && resetSeen !== resetGeneration;
  if (resetSeen !== resetGeneration) {
    setResetSeen(resetGeneration);
    if (clearingReset) {
      setDraft(null);
      setInFlight(false);
      setError(null);
      setMessage(null);
      setTransitionNotice(null);
      setPreparedSuggestion(null);
      setPendingApply(null);
      setConfirmingId(null);
    }
  }
  useLayoutEffect(() => {
    if (resetSeenRef.current === resetGeneration) return;
    const previous = resetSeenRef.current;
    resetSeenRef.current = resetGeneration;
    if (previous === 0) return;
    startedRef.current += 1;
    appliedRef.current = startedRef.current;
  }, [resetGeneration]);
  const sourceCurrent =
    draft !== null &&
    includedAnswersMatch(draft.includedClarifications, clarifications) &&
    currentSourceFingerprint(config, draft.origin, draft.includedClarifications) === draft.sourceFingerprint;
  const requirementsFingerprint = requirementsChangeFingerprint(content);

  if (!clearingReset && pendingApply && draft) {
    if (requirementsFingerprint === pendingApply.expectedFingerprint) {
      const suggestionId = pendingApply.suggestionId;
      const functionalId = pendingApply.functionalId;
      setPendingApply(null);
      setPreparedSuggestion(null);
      setConfirmingId(null);
      setMessage(null);
      if (functionalId) {
        const detached = detachNestedCriteria(draft, suggestionId, functionalId);
        const created = detached ? detached.suggestions.slice(draft.suggestions.length) : [];
        if (created.length > 0) {
          setTransitionNotice(UI_TEXT.writing.detachedCriteria(functionalId, created.map((item) => item.id)));
        }
      }
      setDraft((current) => {
        if (!current) return current;
        if (functionalId) return detachNestedCriteria(current, suggestionId, functionalId) ?? current;
        if (current.acceptedIds.includes(suggestionId)) return current;
        return { ...current, acceptedIds: [...current.acceptedIds, suggestionId] };
      });
    } else if (requirementsFingerprint !== pendingApply.prepared.fingerprint) {
      setPendingApply(null);
      setPreparedSuggestion(null);
      setConfirmingId(null);
      setMessage(UI_TEXT.analysis.applyRejected);
    }
  } else if (
    !clearingReset &&
    preparedSuggestion &&
    preparedSuggestion.prepared.fingerprint !== requirementsFingerprint &&
    requirementsFingerprint !== pendingApply?.expectedFingerprint
  ) {
    setPreparedSuggestion(null);
    setConfirmingId(null);
    setMessage(UI_TEXT.analysis.previewStale);
  }

  function requestDraft(trigger: HTMLElement) {
    if (inFlight || interactionBlocked) return;
    if (!privacyAcknowledged) {
      onNeedPrivacy(trigger, () => void sendDraft());
      return;
    }
    void sendDraft();
  }

  async function sendDraft() {
    const requestId = startedRef.current + 1;
    startedRef.current = requestId;
    setInFlight(true);
    setError(null);
    const currentFingerprint = analysisFingerprint(buildAnalysisInput(config));
    try {
      const response = await fetch("/api/ai-write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config,
          clarifications: clarifications.map((item) => ({
            requestId: item.requestId,
            findingId: item.findingId,
            question: item.question,
            answer: item.answer,
            analysisFingerprint: item.authorizedForModel ? currentFingerprint : item.fingerprint,
          })),
        }),
      });
      applyPayload(requestId, await response.json());
    } catch {
      if (requestId === startedRef.current) setError("provider");
    } finally {
      if (requestId === startedRef.current) setInFlight(false);
    }
  }

  function applyPayload(requestId: number, payload: unknown) {
    if (requestId !== startedRef.current || requestId < appliedRef.current) return;
    const session = readWritingSession(payload, requestId);
    if (!session) {
      setError(readError(payload) ?? "invalid-response");
      return;
    }
    appliedRef.current = requestId;
    setDraft(session);
    setPreparedSuggestion(null);
    setPendingApply(null);
    setConfirmingId(null);
    setMessage(null);
    setTransitionNotice(null);
    setError(null);
  }

  function changeText(id: string, text: string) {
    setDraft((current) => (current ? editSuggestionText(current, id, text) : current));
    setPreparedSuggestion(null);
    setMessage(null);
  }

  function changeNestedText(parentId: string, index: number, text: string) {
    setDraft((current) => (current ? editNestedCriterionText(current, parentId, index, text) : current));
    setPreparedSuggestion(null);
    setMessage(null);
  }

  function preview(suggestion: WritingSuggestion, replaceConfirmed: boolean) {
    const change = suggestionDraft(suggestion, replaceConfirmed);
    if (!change || !sourceCurrent || content.mode !== "structured") return;
    if (suggestion.kind === "new-functional" || suggestion.kind === "new-criterion") {
      if (exactTextExists(content, suggestion.text)) {
        setPreparedSuggestion(null);
        setMessage(UI_TEXT.writing.duplicate);
        return;
      }
    }
    if (criterionLinkMissing(content, suggestion)) {
      setPreparedSuggestion(null);
      setMessage(UI_TEXT.writing.missingLink);
      return;
    }
    const next = prepareRequirementChange(content, change);
    setPreparedSuggestion(next ? { suggestionId: suggestion.id, prepared: next, replaceConfirmed } : null);
    setConfirmingId(null);
    setMessage(next ? null : UI_TEXT.analysis.changeInvalid);
  }

  function apply(suggestion: WritingSuggestion, replaceConfirmed: boolean) {
    if (!preparedSuggestion || preparedSuggestion.suggestionId !== suggestion.id || !sourceCurrent) {
      setPreparedSuggestion(null);
      setMessage(UI_TEXT.analysis.previewStale);
      return;
    }
    const change = suggestionDraft(suggestion, replaceConfirmed);
    if (!change) return;
    const next = applyRequirementChange(content, change, preparedSuggestion.prepared);
    if (!next) {
      setPreparedSuggestion(null);
      setConfirmingId(null);
      setMessage(UI_TEXT.analysis.previewStale);
      return;
    }
    setPendingApply({
      suggestionId: suggestion.id,
      expectedFingerprint: requirementsChangeFingerprint(next),
      prepared: preparedSuggestion.prepared,
      functionalId: suggestion.kind === "new-functional" ? preparedSuggestion.prepared.preview.id : null,
    });
    onApplyPrepared(change, preparedSuggestion.prepared);
  }

  const withheld = clarifications.filter((item) => !item.authorizedForModel);

  return (
    <section className="analysis" aria-labelledby="writing-heading">
      <h2 id="writing-heading">{UI_TEXT.writing.heading}</h2>
      <p className="hint">{UI_TEXT.writing.intro}</p>
      <button type="button" onClick={(event) => requestDraft(event.currentTarget)} disabled={inFlight || interactionBlocked}>
        {UI_TEXT.writing.draft}
      </button>
      {inFlight && (
        <p role="status" className="status">
          {UI_TEXT.writing.working}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {UI_TEXT.analysis.errors[error]}
        </p>
      )}
      {withheld.length > 0 && (
        <p className="hint">
          {UI_TEXT.writing.withheld} {withheld.map((item) => item.findingId).join(", ")}
        </p>
      )}
      {draft && !sourceCurrent && (
        <p role="status" className="notice">
          {UI_TEXT.writing.stale}
        </p>
      )}
      {draft && sourceCurrent && draft.origin === "free-text" && content.mode !== "structured" && (
        <>
          <p>{UI_TEXT.writing.copyTransition}</p>
          <p>{UI_TEXT.writing.emptyTransition}</p>
          <p className="hint">{UI_TEXT.writing.transitionHint}</p>
        </>
      )}
      {message && <p role="alert">{message}</p>}
      {transitionNotice && <p role="status">{transitionNotice}</p>}
      {draft && <SuggestionLists
        session={draft}
        content={content}
        sourceCurrent={sourceCurrent}
        preparedSuggestion={preparedSuggestion}
        confirmingId={confirmingId}
        replacementCancelRef={replacementCancelRef}
        onText={changeText}
        onNestedText={changeNestedText}
        onDismiss={(id) => setDraft((current) => (current ? dismissSuggestion(current, id) : current))}
        onPreview={preview}
        onApply={apply}
        onOpenConfirmation={(id, trigger) => {
          replacementConfirmation.open(trigger);
          setConfirmingId(id);
        }}
        onCancelConfirmation={() => {
          replacementConfirmation.cancel();
          setConfirmingId(null);
        }}
      />}
    </section>
  );
}

function SuggestionLists({
  session,
  content,
  sourceCurrent,
  preparedSuggestion,
  confirmingId,
  replacementCancelRef,
  onText,
  onNestedText,
  onDismiss,
  onPreview,
  onApply,
  onOpenConfirmation,
  onCancelConfirmation,
}: {
  session: WritingSession;
  content: ReturnType<typeof requirementsOf>;
  sourceCurrent: boolean;
  preparedSuggestion: PreparedSuggestion | null;
  confirmingId: string | null;
  replacementCancelRef: RefObject<HTMLButtonElement | null>;
  onText: (id: string, text: string) => void;
  onNestedText: (parentId: string, index: number, text: string) => void;
  onDismiss: (id: string) => void;
  onPreview: (suggestion: WritingSuggestion, replaceConfirmed: boolean) => void;
  onApply: (suggestion: WritingSuggestion, replaceConfirmed: boolean) => void;
  onOpenConfirmation: (id: string, trigger: HTMLElement) => void;
  onCancelConfirmation: () => void;
}) {
  const visible = session.suggestions.filter((item) => !session.dismissedIds.includes(item.id) && !session.acceptedIds.includes(item.id));
  const criteria = visible.filter((item) => item.kind === "new-criterion");
  const linkedGroups = criteriaGroups(criteria);
  const ungroupedCriteria = criteria.filter((item) => singleRequirementId(item) === null);
  const leadingGroups = [
    { id: "new", title: UI_TEXT.writing.newRequirements, items: visible.filter((item) => item.kind === "new-functional") },
    { id: "revisions", title: UI_TEXT.writing.revisions, items: visible.filter((item) => item.kind === "revise-functional" || item.kind === "revise-criterion") },
  ];
  const questions = visible.filter((item) => item.kind === "question");
  function renderSuggestion(suggestion: WritingSuggestion) {
    return (
      <SuggestionItem
        key={suggestion.id}
        suggestion={suggestion}
        content={content}
        structured={content.mode === "structured"}
        sourceCurrent={sourceCurrent}
        prepared={preparedSuggestion?.suggestionId === suggestion.id ? preparedSuggestion.prepared : null}
        confirming={confirmingId === suggestion.id}
        replacementCancelRef={replacementCancelRef}
        onText={onText}
        onNestedText={onNestedText}
        onDismiss={onDismiss}
        onPreview={onPreview}
        onApply={onApply}
        onOpenConfirmation={onOpenConfirmation}
        onCancelConfirmation={onCancelConfirmation}
      />
    );
  }
  return (
    <>
      {leadingGroups.map((group) =>
        group.items.length === 0 ? null : (
          <section key={group.id} aria-labelledby={`writing-group-${group.id}`}>
            <h3 id={`writing-group-${group.id}`}>{group.title}</h3>
            <ul>{group.items.map(renderSuggestion)}</ul>
          </section>
        ),
      )}
      {criteria.length > 0 && (
        <section aria-labelledby="writing-group-criteria">
          <h3 id="writing-group-criteria">{UI_TEXT.writing.criteria}</h3>
          {linkedGroups.map((group) => (
            <section key={group.functionalId} aria-labelledby={`writing-criteria-${group.functionalId}`}>
              <h4 id={`writing-criteria-${group.functionalId}`}>{UI_TEXT.writing.criteriaFor(group.functionalId)}</h4>
              <ul>{group.items.map(renderSuggestion)}</ul>
            </section>
          ))}
          {ungroupedCriteria.length > 0 && <ul>{ungroupedCriteria.map(renderSuggestion)}</ul>}
        </section>
      )}
      {questions.length > 0 && (
        <section aria-labelledby="writing-group-questions">
          <h3 id="writing-group-questions">{UI_TEXT.writing.questions}</h3>
          <ul>{questions.map(renderSuggestion)}</ul>
        </section>
      )}
    </>
  );
}

function SuggestionItem({
  suggestion,
  content,
  structured,
  sourceCurrent,
  prepared,
  confirming,
  replacementCancelRef,
  onText,
  onNestedText,
  onDismiss,
  onPreview,
  onApply,
  onOpenConfirmation,
  onCancelConfirmation,
}: {
  suggestion: WritingSuggestion;
  content: ReturnType<typeof requirementsOf>;
  structured: boolean;
  sourceCurrent: boolean;
  prepared: PreparedRequirementChange | null;
  confirming: boolean;
  replacementCancelRef: RefObject<HTMLButtonElement | null>;
  onText: (id: string, text: string) => void;
  onNestedText: (parentId: string, index: number, text: string) => void;
  onDismiss: (id: string) => void;
  onPreview: (suggestion: WritingSuggestion, replaceConfirmed: boolean) => void;
  onApply: (suggestion: WritingSuggestion, replaceConfirmed: boolean) => void;
  onOpenConfirmation: (id: string, trigger: HTMLElement) => void;
  onCancelConfirmation: () => void;
}) {
  if (suggestion.kind === "question") {
    return (
      <li>
        <p>{suggestion.question}</p>
        <p className="hint">{suggestion.whyNeeded}</p>
      </li>
    );
  }
  const currentText = currentRequirementText(content, suggestion);
  const duplicate = (suggestion.kind === "new-functional" || suggestion.kind === "new-criterion") && exactTextExists(content, suggestion.text);
  const missingLink = criterionLinkMissing(content, suggestion);
  const canReview = structured && sourceCurrent && !duplicate && !missingLink && currentText !== undefined;
  const replacesConfirmed = prepared?.preview.replacesConfirmed === true;
  return (
    <li>
      <p>
        <strong>{suggestion.id}</strong> {UI_TEXT.writing.provenance} {UI_TEXT.writing.notConfirmed}
      </p>
      {suggestion.rationale && <p className="hint">{suggestion.rationale}</p>}
      {currentText && (
        <dl className="change-preview">
          <dt>{UI_TEXT.analysis.previewCurrentText}</dt>
          <dd className="exact-text">{currentText}</dd>
        </dl>
      )}
      <label htmlFor={`writing-text-${suggestion.id}`}>{UI_TEXT.writing.textLabel(suggestion.id)}</label>
      <textarea id={`writing-text-${suggestion.id}`} value={suggestion.text} onChange={(event) => onText(suggestion.id, event.target.value)} />
      {suggestion.kind === "new-functional" &&
        suggestion.nestedCriteria.map((criterion, index) => (
          <div key={`${suggestion.id}-${index}`}>
            <label htmlFor={`writing-nested-${suggestion.id}-${index}`}>{UI_TEXT.writing.nestedTextLabel(suggestion.id, index)}</label>
            <textarea
              id={`writing-nested-${suggestion.id}-${index}`}
              value={criterion.text}
              onChange={(event) => onNestedText(suggestion.id, index, event.target.value)}
            />
          </div>
        ))}
      {duplicate && <p role="status">{UI_TEXT.writing.duplicate}</p>}
      {missingLink && <p role="status">{UI_TEXT.writing.missingLink}</p>}
      <div className="actions">
        <button type="button" onClick={() => onPreview(suggestion, false)} disabled={!canReview}>
          {UI_TEXT.writing.preview(suggestion.id)}
        </button>
        <button type="button" onClick={() => onDismiss(suggestion.id)}>
          {UI_TEXT.writing.dismiss(suggestion.id)}
        </button>
      </div>
      {prepared && prepared.fingerprint === requirementsChangeFingerprint(content) && (
        <div role="region" aria-labelledby={`writing-preview-${suggestion.id}`}>
          <h4 id={`writing-preview-${suggestion.id}`}>{UI_TEXT.writing.preview(suggestion.id)}</h4>
          <dl className="change-preview">
            <dt>{UI_TEXT.analysis.previewId}</dt>
            <dd>{prepared.preview.id}</dd>
            <dt>{UI_TEXT.analysis.previewSource}</dt>
            <dd>{UI_TEXT.analysis.sources[prepared.preview.source]}</dd>
            <dt>{UI_TEXT.analysis.previewStatus}</dt>
            <dd>{UI_TEXT.requirementStatus[prepared.preview.status]}</dd>
            {prepared.preview.scope && (
              <>
                <dt>{UI_TEXT.analysis.previewScope}</dt>
                <dd>{UI_TEXT.criterionScope[prepared.preview.scope]}</dd>
                <dt>{UI_TEXT.analysis.previewLinks}</dt>
                <dd>{prepared.preview.requirementIds.length > 0 ? prepared.preview.requirementIds.join(", ") : UI_TEXT.analysis.previewNoLinks}</dd>
              </>
            )}
            <dt>{UI_TEXT.analysis.previewProposedText}</dt>
            <dd className="exact-text">{prepared.preview.text}</dd>
          </dl>
          {suggestion.kind === "new-functional" && suggestion.nestedCriteria.length > 0 && (
            <>
              <p>{UI_TEXT.writing.nestedRemain(prepared.preview.id)}</p>
              <ul>
                {suggestion.nestedCriteria.map((criterion, index) => (
                  <li key={`${suggestion.id}-preview-nested-${index}`}>{criterion.text}</li>
                ))}
              </ul>
            </>
          )}
          <p>{UI_TEXT.writing.notConfirmed}</p>
          {replacesConfirmed ? (
            <button type="button" onClick={(event) => onOpenConfirmation(suggestion.id, event.currentTarget)}>
              {UI_TEXT.analysis.authoritativeHeading(prepared.preview.id)}
            </button>
          ) : (
            <button type="button" onClick={() => onApply(suggestion, false)}>
              {UI_TEXT.analysis.applyChange(suggestion.id)}
            </button>
          )}
          {replacesConfirmed && confirming && (
            <div
              className="confirm"
              role="region"
              aria-labelledby={`writing-replace-${suggestion.id}`}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                onCancelConfirmation();
              }}
            >
              <h4 id={`writing-replace-${suggestion.id}`}>{UI_TEXT.analysis.authoritativeHeading(prepared.preview.id)}</h4>
              <p>{UI_TEXT.analysis.authoritativeBody}</p>
              <div className="actions">
                <button type="button" className="secondary" ref={replacementCancelRef} onClick={onCancelConfirmation}>
                  {UI_TEXT.buttons.cancel}
                </button>
                <button type="button" onClick={() => onApply(suggestion, true)}>
                  {UI_TEXT.analysis.authoritativeReplace(prepared.preview.id)}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function singleRequirementId(suggestion: WritingSuggestion): string | null {
  if (suggestion.kind !== "new-criterion" || suggestion.scope !== "requirement" || suggestion.requirementIds.length !== 1) return null;
  return suggestion.requirementIds[0] ?? null;
}

function criteriaGroups(items: readonly WritingSuggestion[]): Array<{ functionalId: string; items: WritingSuggestion[] }> {
  const groups: Array<{ functionalId: string; items: WritingSuggestion[] }> = [];
  for (const item of items) {
    const functionalId = singleRequirementId(item);
    if (!functionalId) continue;
    const existing = groups.find((group) => group.functionalId === functionalId);
    if (existing) existing.items.push(item);
    else groups.push({ functionalId, items: [item] });
  }
  return groups;
}

function currentRequirementText(content: ReturnType<typeof requirementsOf>, suggestion: WritingSuggestion): string | undefined {
  if (suggestion.kind === "revise-functional") return content.functionalRequirements.find((item) => item.id === suggestion.targetId)?.text;
  if (suggestion.kind === "revise-criterion") return content.acceptanceCriteria.find((item) => item.id === suggestion.targetId)?.text;
  return "";
}

function suggestionDraft(suggestion: WritingSuggestion, replaceConfirmed: boolean): RequirementDraft | null {
  if (suggestion.kind === "new-functional") return { action: "create-functional", text: suggestion.text, source: "ai" };
  if (suggestion.kind === "new-criterion") {
    return {
      action: "create-criterion",
      text: suggestion.text,
      scope: suggestion.scope,
      requirementIds: suggestion.requirementIds,
      source: "ai",
    };
  }
  if (suggestion.kind === "revise-functional") return { action: "update-functional", id: suggestion.targetId, text: suggestion.text, replaceConfirmed };
  if (suggestion.kind === "revise-criterion") return { action: "update-criterion", id: suggestion.targetId, text: suggestion.text, replaceConfirmed };
  return null;
}

function readWritingSession(value: unknown, requestId: number): WritingSession | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.result)) return null;
  if (value.origin !== "free-text" && value.origin !== "structured") return null;
  if (typeof value.fingerprint !== "string" || typeof value.sourceFingerprint !== "string") return null;
  if (!Array.isArray(value.result.suggestions) || typeof value.result.nextSuggestionNumber !== "number") return null;
  const suggestions = value.result.suggestions.filter(isSuggestion);
  if (suggestions.length !== value.result.suggestions.length) return null;
  const includedClarifications = readClarifications(value.includedClarifications);
  if (!includedClarifications) return null;
  return {
    requestId,
    origin: value.origin,
    sourceFingerprint: value.sourceFingerprint,
    writingFingerprint: value.fingerprint,
    suggestions,
    dismissedIds: [],
    acceptedIds: [],
    nextSuggestionNumber: value.result.nextSuggestionNumber,
    includedClarifications,
  };
}

function readClarifications(value: unknown): WritingClarification[] | null {
  if (!Array.isArray(value)) return null;
  const clarifications: WritingClarification[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.requestId !== "number" || typeof entry.findingId !== "string") return null;
    if (typeof entry.question !== "string" || typeof entry.answer !== "string") return null;
    clarifications.push({
      requestId: entry.requestId,
      findingId: entry.findingId,
      question: entry.question,
      answer: entry.answer,
    });
  }
  return clarifications;
}

function isSuggestion(value: unknown): value is WritingSuggestion {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.kind !== "string") return false;
  if (value.kind === "question") return typeof value.question === "string" && typeof value.whyNeeded === "string" && Array.isArray(value.relatedRequirementIds);
  if (value.kind === "new-functional") return typeof value.text === "string" && typeof value.rationale === "string" && Array.isArray(value.nestedCriteria);
  if (value.kind === "new-criterion") {
    return typeof value.text === "string" && (value.scope === "project" || value.scope === "requirement") && Array.isArray(value.requirementIds);
  }
  if (value.kind === "revise-functional" || value.kind === "revise-criterion") return typeof value.text === "string" && typeof value.targetId === "string";
  return false;
}

function readError(value: unknown): WritingError | null {
  if (!isRecord(value) || value.ok !== false || typeof value.error !== "string") return null;
  return WRITING_ERRORS.includes(value.error as WritingError) ? (value.error as WritingError) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function useInlineConfirmation(active: boolean, cancelRef: RefObject<HTMLButtonElement | null>) {
  const returnRef = useRef<HTMLElement | null>(null);
  const restoreRef = useRef(false);
  useEffect(() => {
    if (!active) return;
    cancelRef.current?.focus();
    return () => {
      if (!restoreRef.current) return;
      restoreRef.current = false;
      const target = returnRef.current;
      if (target?.isConnected) target.focus();
    };
  }, [active, cancelRef]);
  return {
    open(trigger: HTMLElement) {
      returnRef.current = trigger;
    },
    cancel() {
      restoreRef.current = true;
    },
  };
}
