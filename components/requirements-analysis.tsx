"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { analysisFingerprint, buildAnalysisInput, decideAnalysisUpdate } from "@/lib/ai/analysis-input";
import { readAnalysisResult, type AnalysisFinding, type AnalysisResult } from "@/lib/ai/analysis-schema";
import {
  applyRequirementChange,
  emptyReviewSession,
  findingGroup,
  markReviewApplied,
  prepareRequirementChange,
  requirementsChangeFingerprint,
  reviewCounts,
  reviewRecord,
  sessionHasReviewWork,
  setReviewAnswer,
  setReviewDecision,
  type AppliedChange,
  type PreparedRequirementChange,
  type RequirementChangePreview,
  type RequirementDraft,
  type ReviewDecision,
  type ReviewSession,
} from "@/lib/ai/review";
import type { ProjectConfig } from "@/lib/config";
import { requirementsOf, type CriterionScope, type RequirementsContent } from "@/lib/requirements-content";
import { UI_TEXT } from "@/lib/ui-text";

const ANALYSIS_ERRORS = [
  "unavailable",
  "too-large",
  "invalid-request",
  "timeout",
  "provider",
  "invalid-response",
  "rate-limited",
] as const;

type AnalysisErrorCode = (typeof ANALYSIS_ERRORS)[number];

type StoredAnalysis = {
  requestId: number;
  fingerprint: string;
  result: AnalysisResult;
};

const GROUPS = ["clarification", "contradiction", "enhancement"] as const;

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

export function RequirementsAnalysis({
  config,
  onRequirementsChange,
}: {
  config: ProjectConfig;
  onRequirementsChange: (content: RequirementsContent) => void;
}) {
  const content = requirementsOf(config);
  const fingerprint = analysisFingerprint(buildAnalysisInput(config));
  const fingerprintRef = useRef(fingerprint);
  fingerprintRef.current = fingerprint;
  const startedRef = useRef(0);
  const appliedRef = useRef(0);
  const [inFlight, setInFlight] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmingRerun, setConfirmingRerun] = useState(false);
  const privacyCancelRef = useRef<HTMLButtonElement>(null);
  const rerunCancelRef = useRef<HTMLButtonElement>(null);
  const privacyConfirmation = useInlineConfirmation(confirming, privacyCancelRef);
  const rerunConfirmation = useInlineConfirmation(confirmingRerun, rerunCancelRef);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<AnalysisErrorCode | null>(null);
  const [stored, setStored] = useState<StoredAnalysis | null>(null);
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [draftFindingId, setDraftFindingId] = useState<string | null>(null);

  const stale = stored !== null && stored.fingerprint !== fingerprint;
  const structured = content.mode === "structured";

  function requestAnalysis(trigger: HTMLElement) {
    if (inFlight || confirming || confirmingRerun) return;
    if (session && sessionHasReviewWork(session)) {
      rerunConfirmation.open(trigger);
      setConfirmingRerun(true);
      return;
    }
    if (!acknowledged) {
      privacyConfirmation.open(trigger);
      setConfirming(true);
      return;
    }
    void send();
  }

  async function send() {
    const requestId = startedRef.current + 1;
    startedRef.current = requestId;
    setConfirming(false);
    setConfirmingRerun(false);
    setAcknowledged(true);
    setInFlight(true);
    setError(null);
    try {
      const response = await fetch("/api/ai-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      });
      applyPayload(requestId, await response.json());
    } catch {
      if (isLatestRequest(requestId)) setError("provider");
    } finally {
      if (requestId === startedRef.current) setInFlight(false);
    }
  }

  function applyPayload(requestId: number, payload: unknown) {
    if (!isLatestRequest(requestId)) return;
    const parsed = readPayload(payload);
    if (!parsed) {
      setError("provider");
      return;
    }
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const result = readAnalysisResult(parsed.result);
    if (!result) {
      setError("invalid-response");
      return;
    }
    const decision = decideAnalysisUpdate({
      requestId,
      latestStartedId: startedRef.current,
      latestAppliedId: appliedRef.current,
      responseFingerprint: parsed.fingerprint,
      currentFingerprint: fingerprintRef.current,
    });
    if (decision === "ignore") return;
    appliedRef.current = requestId;
    setStored({ requestId, fingerprint: parsed.fingerprint, result });
    setSession(emptyReviewSession(requestId, parsed.fingerprint));
    setDraftFindingId(null);
    setError(null);
  }

  function isLatestRequest(requestId: number): boolean {
    return (
      decideAnalysisUpdate({
        requestId,
        latestStartedId: startedRef.current,
        latestAppliedId: appliedRef.current,
        responseFingerprint: "request",
        currentFingerprint: "request",
      }) !== "ignore"
    );
  }

  function updateSession(next: ReviewSession | null) {
    if (next) setSession(next);
  }

  const counts = stored && session ? reviewCounts(session, stored.result.findings.map((finding) => finding.id)) : null;

  return (
    <section className="analysis" aria-labelledby="analysis-heading">
      <h2 id="analysis-heading">{UI_TEXT.analysis.heading}</h2>
      <p className="hint">{UI_TEXT.analysis.intro}</p>
      <button type="button" onClick={(event) => requestAnalysis(event.currentTarget)} disabled={inFlight || confirming || confirmingRerun}>
        {stored ? UI_TEXT.analysis.analyzeAgain : UI_TEXT.analysis.analyze}
      </button>
      {inFlight && (
        <p role="status" className="status">
          {UI_TEXT.analysis.working}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {UI_TEXT.analysis.errors[error]}
        </p>
      )}
      {confirming && (
        <div
          className="confirm"
          role="region"
          aria-labelledby="analysis-confirm-heading"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            privacyConfirmation.cancel();
            setConfirming(false);
          }}
        >
          <h3 id="analysis-confirm-heading">{UI_TEXT.analysis.confirmHeading}</h3>
          <p>{UI_TEXT.analysis.confirmBody}</p>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              ref={privacyCancelRef}
              onClick={() => {
                privacyConfirmation.cancel();
                setConfirming(false);
              }}
            >
              {UI_TEXT.buttons.cancel}
            </button>
            <button type="button" onClick={() => void send()}>
              {UI_TEXT.analysis.send}
            </button>
          </div>
        </div>
      )}
      {confirmingRerun && (
        <div
          className="confirm"
          role="region"
          aria-labelledby="analysis-rerun-heading"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            rerunConfirmation.cancel();
            setConfirmingRerun(false);
          }}
        >
          <h3 id="analysis-rerun-heading">{UI_TEXT.analysis.rerunHeading}</h3>
          <p>{UI_TEXT.analysis.rerunBody}</p>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              ref={rerunCancelRef}
              onClick={() => {
                rerunConfirmation.cancel();
                setConfirmingRerun(false);
              }}
            >
              {UI_TEXT.buttons.cancel}
            </button>
            <button type="button" onClick={() => void send()}>
              {UI_TEXT.analysis.rerunContinue}
            </button>
          </div>
        </div>
      )}
      {stored && session && (
        <div>
          {stale && (
            <p role="status" className="notice">
              {UI_TEXT.analysis.stale}
            </p>
          )}
          <p>{UI_TEXT.analysis.advisory}</p>
          {stored.result.findings.length === 0 ? (
            <p>{UI_TEXT.analysis.noFindings}</p>
          ) : (
            <>
              {counts && <p>{UI_TEXT.analysis.reviewSummary(counts.open, counts.deferred, counts.addressed, counts.dismissed)}</p>}
              {GROUPS.map((group) => {
                const findings = stored.result.findings.filter((finding) => findingGroup(finding) === group);
                if (findings.length === 0) return null;
                return (
                  <section key={group} aria-labelledby={`analysis-group-${group}`}>
                    <h3 id={`analysis-group-${group}`}>{UI_TEXT.analysis.groups[group]}</h3>
                    <ul>
                      {findings.map((finding) => (
                        <FindingReview
                          key={`${stored.requestId}:${finding.id}`}
                          finding={finding}
                          session={session}
                          content={content}
                          stale={stale}
                          structured={structured}
                          draftOpen={draftFindingId === finding.id}
                          onDecision={(decision) => updateSession(setReviewDecision(session, finding.id, decision))}
                          onAnswer={(answer) => {
                            const next = setReviewAnswer(session, finding.id, answer);
                            if (!next) return false;
                            setSession(next);
                            return true;
                          }}
                          onToggleDraft={() => {
                            if (stale || !structured) return;
                            setDraftFindingId(draftFindingId === finding.id ? null : finding.id);
                          }}
                          onApply={(next, applied) => {
                            onRequirementsChange(next);
                            updateSession(markReviewApplied(session, finding.id, applied));
                            setDraftFindingId(null);
                          }}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function FindingReview({
  finding,
  session,
  content,
  stale,
  structured,
  draftOpen,
  onDecision,
  onAnswer,
  onToggleDraft,
  onApply,
}: {
  finding: AnalysisFinding;
  session: ReviewSession;
  content: RequirementsContent;
  stale: boolean;
  structured: boolean;
  draftOpen: boolean;
  onDecision: (decision: ReviewDecision) => void;
  onAnswer: (answer: string) => boolean;
  onToggleDraft: () => void;
  onApply: (content: RequirementsContent, applied: AppliedChange) => void;
}) {
  const record = reviewRecord(session, finding.id);
  const [answer, setAnswer] = useState(record.answer ?? "");
  const [answerMessage, setAnswerMessage] = useState<string | null>(null);
  return (
    <li>
      <p>
        <strong>{finding.id}</strong> {UI_TEXT.analysis.categories[finding.category]} {UI_TEXT.analysis.severities[finding.severity]}
      </p>
      <p>{finding.explanation}</p>
      {finding.relatedRequirementIds.length > 0 && <p>{UI_TEXT.analysis.related(finding.relatedRequirementIds.join(", "))}</p>}
      {finding.question && <p>{UI_TEXT.analysis.question(finding.question)}</p>}
      {finding.suggestedAction && (
        <>
          <p>{UI_TEXT.analysis.suggestedAction(finding.suggestedAction)}</p>
          <p className="hint">{UI_TEXT.analysis.referenceOnly}</p>
        </>
      )}
      {finding.uncertainty && <p>{UI_TEXT.analysis.uncertainty(finding.uncertainty)}</p>}
      <p>{UI_TEXT.analysis.decisionLabel(finding.id, UI_TEXT.analysis.decisions[record.decision])}</p>
      {record.applied && <p>{UI_TEXT.analysis.appliedNote(record.applied.id)}</p>}
      <div className="actions">
        <button type="button" aria-pressed={record.decision === "addressed"} onClick={() => onDecision("addressed")}>
          {UI_TEXT.analysis.markAddressed(finding.id)}
        </button>
        <button type="button" aria-pressed={record.decision === "dismissed"} onClick={() => onDecision("dismissed")}>
          {UI_TEXT.analysis.dismiss(finding.id)}
        </button>
        <button type="button" aria-pressed={record.decision === "deferred"} onClick={() => onDecision("deferred")}>
          {UI_TEXT.analysis.defer(finding.id)}
        </button>
      </div>
      {finding.question !== null && (
        <div>
          <label htmlFor={`analysis-answer-${finding.id}`}>{UI_TEXT.analysis.answerLabel(finding.id)}</label>
          <textarea id={`analysis-answer-${finding.id}`} value={answer} onChange={(event) => setAnswer(event.target.value)} />
          <button
            type="button"
            onClick={() => {
              const saved = onAnswer(answer);
              setAnswerMessage(saved ? UI_TEXT.analysis.answerSaved : UI_TEXT.analysis.answerTooLong);
            }}
          >
            {UI_TEXT.analysis.saveAnswer(finding.id)}
          </button>
          {answerMessage && <p role="status">{answerMessage}</p>}
        </div>
      )}
      <button type="button" onClick={onToggleDraft} disabled={stale || !structured}>
        {UI_TEXT.analysis.proposeChange(finding.id)}
      </button>
      {!structured && <p className="hint">{UI_TEXT.analysis.structuredRequired}</p>}
      {stale && <p className="hint">{UI_TEXT.analysis.staleBlocked}</p>}
      {draftOpen && structured && (
        <RequirementChangeForm findingId={finding.id} content={content} stale={stale} onApply={onApply} />
      )}
    </li>
  );
}

function RequirementChangeForm({
  findingId,
  content,
  stale,
  onApply,
}: {
  findingId: string;
  content: RequirementsContent;
  stale: boolean;
  onApply: (content: RequirementsContent, applied: AppliedChange) => void;
}) {
  const [action, setAction] = useState<RequirementDraft["action"]>("create-functional");
  const [targetId, setTargetId] = useState("");
  const [scope, setScope] = useState<CriterionScope>("project");
  const [links, setLinks] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [prepared, setPrepared] = useState<PreparedRequirementChange | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const replacementCancelRef = useRef<HTMLButtonElement>(null);
  const replacementConfirmation = useInlineConfirmation(confirming, replacementCancelRef);
  const requirementsFingerprint = requirementsChangeFingerprint(content);
  if (prepared && prepared.fingerprint !== requirementsFingerprint) {
    setPrepared(null);
    setConfirming(false);
    setMessage(UI_TEXT.analysis.previewStale);
  }
  const preview = prepared !== null && prepared.fingerprint === requirementsFingerprint ? prepared.preview : null;

  function draft(replaceConfirmed: boolean): RequirementDraft {
    if (action === "create-functional") return { action, text };
    if (action === "create-criterion") {
      return { action, text, scope, requirementIds: scope === "project" ? [] : links };
    }
    if (action === "update-functional") return { action, id: targetId, text, replaceConfirmed };
    return { action: "update-criterion", id: targetId, text, replaceConfirmed };
  }

  function changeDraft(update: () => void) {
    update();
    setPrepared(null);
    setConfirming(false);
    setMessage(null);
  }

  function applyPrepared(replaceConfirmed: boolean) {
    if (stale || !prepared || prepared.fingerprint !== requirementsChangeFingerprint(content)) {
      setPrepared(null);
      setConfirming(false);
      setMessage(UI_TEXT.analysis.previewStale);
      return;
    }
    const next = applyRequirementChange(content, draft(replaceConfirmed), prepared);
    if (!next) {
      setPrepared(null);
      setConfirming(false);
      setMessage(UI_TEXT.analysis.previewStale);
      return;
    }
    onApply(next, {
      kind: prepared.preview.action.endsWith("criterion") ? "criterion" : "functional",
      id: prepared.preview.id,
    });
  }

  function cancelReplacement() {
    replacementConfirmation.cancel();
    setConfirming(false);
  }

  const targets = action === "update-functional" ? content.functionalRequirements : content.acceptanceCriteria;

  return (
    <div>
      <label htmlFor={`analysis-change-${findingId}`}>{UI_TEXT.analysis.changeLabel(findingId)}</label>
      <select
        id={`analysis-change-${findingId}`}
        value={action}
        onChange={(event) => changeDraft(() => setAction(event.target.value as RequirementDraft["action"]))}
      >
        <option value="create-functional">{UI_TEXT.analysis.createFunctional}</option>
        <option value="create-criterion">{UI_TEXT.analysis.createCriterion}</option>
        <option value="update-functional">{UI_TEXT.analysis.updateFunctional}</option>
        <option value="update-criterion">{UI_TEXT.analysis.updateCriterion}</option>
      </select>
      {(action === "update-functional" || action === "update-criterion") && (
        <>
          <label htmlFor={`analysis-target-${findingId}`}>{UI_TEXT.analysis.targetLabel(findingId)}</label>
          <select
            id={`analysis-target-${findingId}`}
            value={targetId}
            onChange={(event) => changeDraft(() => setTargetId(event.target.value))}
          >
            <option value="">{UI_TEXT.analysis.targetLabel(findingId)}</option>
            {targets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id}
              </option>
            ))}
          </select>
        </>
      )}
      {action === "create-criterion" && (
        <>
          <label htmlFor={`analysis-scope-${findingId}`}>{UI_TEXT.analysis.scopeLabel(findingId)}</label>
          <select
            id={`analysis-scope-${findingId}`}
            value={scope}
            onChange={(event) => changeDraft(() => setScope(event.target.value as CriterionScope))}
          >
            <option value="project">{UI_TEXT.criterionScope.project}</option>
            <option value="requirement">{UI_TEXT.criterionScope.requirement}</option>
          </select>
          {scope === "requirement" &&
            content.functionalRequirements.map((item) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  checked={links.includes(item.id)}
                  onChange={(event) =>
                    changeDraft(() =>
                      setLinks(event.target.checked ? [...links, item.id] : links.filter((id) => id !== item.id)),
                    )
                  }
                />
                {item.id}
              </label>
            ))}
        </>
      )}
      <label htmlFor={`analysis-text-${findingId}`}>{UI_TEXT.analysis.proposedText(findingId)}</label>
      <textarea id={`analysis-text-${findingId}`} value={text} onChange={(event) => changeDraft(() => setText(event.target.value))} />
      <button
        type="button"
        disabled={stale}
        onClick={() => {
          if (stale) return;
          const next = prepareRequirementChange(content, draft(false));
          setPrepared(next);
          setConfirming(false);
          setMessage(next ? null : UI_TEXT.analysis.changeInvalid);
        }}
      >
        {UI_TEXT.analysis.previewChange(findingId)}
      </button>
      {message && <p role="alert">{message}</p>}
      {preview && (
        <div role="region" aria-labelledby={`analysis-preview-${findingId}`}>
          <h4 id={`analysis-preview-${findingId}`}>
            {preview.replacesConfirmed ? UI_TEXT.analysis.suggestedReplacement(preview.id) : UI_TEXT.analysis.previewChange(findingId)}
          </h4>
          <PreviewFacts preview={preview} />
          {!preview.replacesConfirmed && <p>{UI_TEXT.analysis.proposedPreview(preview.id)}</p>}
          {preview.replacesConfirmed ? (
            <button
              type="button"
              disabled={stale}
              onClick={(event) => {
                if (stale) return;
                replacementConfirmation.open(event.currentTarget);
                setConfirming(true);
              }}
            >
              {UI_TEXT.analysis.authoritativeHeading(preview.id)}
            </button>
          ) : (
            <button type="button" disabled={stale} onClick={() => applyPrepared(false)}>
              {UI_TEXT.analysis.applyChange(findingId)}
            </button>
          )}
          {preview.replacesConfirmed && confirming && (
            <div
              className="confirm"
              role="region"
              aria-labelledby={`analysis-replace-${findingId}`}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                cancelReplacement();
              }}
            >
              <h4 id={`analysis-replace-${findingId}`}>{UI_TEXT.analysis.authoritativeHeading(preview.id)}</h4>
              <p>{UI_TEXT.analysis.authoritativeBody}</p>
              <div className="actions">
                <button type="button" className="secondary" ref={replacementCancelRef} onClick={cancelReplacement}>
                  {UI_TEXT.buttons.cancel}
                </button>
                <button type="button" disabled={stale} onClick={() => applyPrepared(true)}>
                  {UI_TEXT.analysis.authoritativeReplace(preview.id)}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewFacts({ preview }: { preview: RequirementChangePreview }) {
  return (
    <>
    <dl className="change-preview">
      <dt>{UI_TEXT.analysis.previewId}</dt>
      <dd>{preview.id}</dd>
      <dt>{UI_TEXT.analysis.previewSource}</dt>
      <dd>{UI_TEXT.analysis.sources[preview.source]}</dd>
      <dt>{UI_TEXT.analysis.previewStatus}</dt>
      <dd>{UI_TEXT.requirementStatus[preview.status]}</dd>
      {preview.scope && (
        <>
          <dt>{UI_TEXT.analysis.previewScope}</dt>
          <dd>{UI_TEXT.criterionScope[preview.scope]}</dd>
          <dt>{UI_TEXT.analysis.previewLinks}</dt>
          <dd>{preview.requirementIds.length > 0 ? preview.requirementIds.join(", ") : UI_TEXT.analysis.previewNoLinks}</dd>
        </>
      )}
      {preview.replacesConfirmed && (
        <>
          <dt>{UI_TEXT.analysis.previewCurrentText}</dt>
          <dd className="exact-text">{preview.currentText}</dd>
        </>
      )}
      <dt>{UI_TEXT.analysis.previewProposedText}</dt>
      <dd className="exact-text">{preview.text}</dd>
    </dl>
    {preview.replacesConfirmed && <p>{UI_TEXT.analysis.replacesAuthoritative(preview.id)}</p>}
    </>
  );
}

function readPayload(
  value: unknown,
): { ok: true; fingerprint: string; result: unknown } | { ok: false; error: AnalysisErrorCode } | null {
  if (!isRecord(value)) return null;
  if (value.ok === true && typeof value.fingerprint === "string" && Object.hasOwn(value, "result")) {
    return { ok: true, fingerprint: value.fingerprint, result: value.result };
  }
  if (value.ok === false && isAnalysisError(value.error)) return { ok: false, error: value.error };
  return null;
}

function isAnalysisError(value: unknown): value is AnalysisErrorCode {
  return typeof value === "string" && (ANALYSIS_ERRORS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
