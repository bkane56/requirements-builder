import { ANALYSIS_REQUEST_MAX_BYTES } from "./analysis-schema";
import type { AnalysisErrorCode } from "./analyze";
import type { AnalysisDependencies } from "./review-request";
import { readAnalysisConfig } from "./review-request";
import { readSubmittedClarifications, selectModelClarifications } from "./writing-input";
import { writeRequirements, type WritingOutcome } from "./write";

const ERROR_STATUS: Record<AnalysisErrorCode, number> = {
  unavailable: 503,
  "too-large": 413,
  "invalid-request": 400,
  timeout: 504,
  provider: 502,
  "invalid-response": 502,
  "rate-limited": 429,
};

export async function handleWritingPost(request: Request, dependencies: AnalysisDependencies): Promise<Response> {
  const body = await readWritingBody(request);
  if (body === "too-large") return writingResponse({ ok: false, error: "too-large" });
  if (dependencies.provider === null) return writingResponse({ ok: false, error: "unavailable" });
  if (!dependencies.allowRequest()) return writingResponse({ ok: false, error: "rate-limited" });
  if (body === "invalid") return writingResponse({ ok: false, error: "invalid-request" });
  const config = readAnalysisConfig(body.config);
  const submitted = readSubmittedClarifications(body.clarifications);
  if (!config || !submitted) return writingResponse({ ok: false, error: "invalid-request" });
  const selected = selectModelClarifications(config, submitted);
  const outcome = await writeRequirements(config, selected.included, dependencies.provider, {
    timeoutMs: dependencies.timeoutMs,
    retryDelayMs: dependencies.retryDelayMs,
  });
  if (!outcome.ok) return writingResponse(outcome);
  return Response.json({ ...outcome, excludedFindingIds: selected.excludedFindingIds }, { status: 200 });
}

async function readWritingBody(request: Request): Promise<{ config: unknown; clarifications: unknown } | "too-large" | "invalid"> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return "invalid";
  }
  if (new TextEncoder().encode(text).byteLength > ANALYSIS_REQUEST_MAX_BYTES) return "too-large";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || !Object.hasOwn(parsed, "config") || !Object.hasOwn(parsed, "clarifications")) return "invalid";
    return { config: parsed.config, clarifications: parsed.clarifications };
  } catch {
    return "invalid";
  }
}

function writingResponse(outcome: WritingOutcome): Response {
  return Response.json(outcome, { status: outcome.ok ? 200 : ERROR_STATUS[outcome.error] });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
