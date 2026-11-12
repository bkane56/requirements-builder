"use client";

import { useEffect, useRef, useState } from "react";
import { analysisFingerprint, buildAnalysisInput, decideAnalysisUpdate } from "@/lib/ai/analysis-input";
import { readAnalysisResult, type AnalysisResult } from "@/lib/ai/analysis-schema";
import type { ProjectConfig } from "@/lib/config";
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

export function RequirementsAnalysis({ config }: { config: ProjectConfig }) {
  const fingerprint = analysisFingerprint(buildAnalysisInput(config));
  const fingerprintRef = useRef(fingerprint);
  fingerprintRef.current = fingerprint;
  const startedRef = useRef(0);
  const appliedRef = useRef(0);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [inFlight, setInFlight] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<AnalysisErrorCode | null>(null);
  const [stored, setStored] = useState<StoredAnalysis | null>(null);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  function requestAnalysis() {
    if (inFlight || confirming) return;
    if (!acknowledged) {
      setConfirming(true);
      return;
    }
    void send();
  }

  async function send() {
    const requestId = startedRef.current + 1;
    startedRef.current = requestId;
    setConfirming(false);
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

  const stale = stored !== null && stored.fingerprint !== fingerprint;

  return (
    <section className="analysis" aria-labelledby="analysis-heading">
      <h2 id="analysis-heading">{UI_TEXT.analysis.heading}</h2>
      <p className="hint">{UI_TEXT.analysis.intro}</p>
      <button type="button" onClick={requestAnalysis} disabled={inFlight || confirming}>
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
            setConfirming(false);
          }}
        >
          <h3 id="analysis-confirm-heading">{UI_TEXT.analysis.confirmHeading}</h3>
          <p>{UI_TEXT.analysis.confirmBody}</p>
          <div className="actions">
            <button type="button" className="secondary" ref={cancelRef} onClick={() => setConfirming(false)}>
              {UI_TEXT.buttons.cancel}
            </button>
            <button type="button" onClick={() => void send()}>
              {UI_TEXT.analysis.send}
            </button>
          </div>
        </div>
      )}
      {stored && (
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
            <ul>
              {stored.result.findings.map((finding) => (
                <li key={finding.id}>
                  <p>
                    <strong>{finding.id}</strong> {UI_TEXT.analysis.categories[finding.category]}{" "}
                    {UI_TEXT.analysis.severities[finding.severity]}
                  </p>
                  <p>{finding.explanation}</p>
                  {finding.relatedRequirementIds.length > 0 && (
                    <p>{UI_TEXT.analysis.related(finding.relatedRequirementIds.join(", "))}</p>
                  )}
                  {finding.question && <p>{UI_TEXT.analysis.question(finding.question)}</p>}
                  {finding.suggestedAction && <p>{UI_TEXT.analysis.suggestedAction(finding.suggestedAction)}</p>}
                  {finding.uncertainty && <p>{UI_TEXT.analysis.uncertainty(finding.uncertainty)}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
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
