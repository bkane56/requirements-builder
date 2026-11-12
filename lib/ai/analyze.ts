import {
  analysisFingerprint,
  analysisRequirementIds,
  buildAnalysisInput,
  type AnalysisInput,
  type AnalysisSource,
} from "./analysis-input";
import {
  ANALYSIS_OUTPUT_TOKEN_BUDGET,
  ANALYSIS_RESPONSE_SCHEMA,
  ANALYSIS_SCHEMA_NAME,
  parseAnalysisResult,
  type AnalysisResult,
} from "./analysis-schema";
import { ANALYSIS_SYSTEM_PROMPT } from "./prompt";
import { AnalysisProviderError, type AnalysisProvider } from "./provider";

export type AnalysisErrorCode =
  | "unavailable"
  | "too-large"
  | "invalid-request"
  | "timeout"
  | "provider"
  | "invalid-response"
  | "rate-limited";

export type AnalysisOutcome =
  | { ok: true; fingerprint: string; result: AnalysisResult }
  | { ok: false; error: AnalysisErrorCode };

const DEFAULT_RETRY_DELAY_MS = 250;

export async function analyzeRequirements(
  config: AnalysisSource,
  provider: AnalysisProvider,
  options: { timeoutMs: number; retryDelayMs?: number },
): Promise<AnalysisOutcome> {
  const input = buildAnalysisInput(config);
  const fingerprint = analysisFingerprint(input);
  try {
    return await complete(provider, options.timeoutMs, fingerprint, input);
  } catch (error) {
    const failure = asProviderError(error);
    if (!failure.retryable) return { ok: false, error: failure.code };
  }
  await delay(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
  try {
    return await complete(provider, options.timeoutMs, fingerprint, input);
  } catch (error) {
    return { ok: false, error: asProviderError(error).code };
  }
}

async function complete(
  provider: AnalysisProvider,
  timeoutMs: number,
  fingerprint: string,
  input: AnalysisInput,
): Promise<AnalysisOutcome> {
  const raw = await provider.complete({
    system: ANALYSIS_SYSTEM_PROMPT,
    user: fingerprint,
    schema: ANALYSIS_RESPONSE_SCHEMA,
    schemaName: ANALYSIS_SCHEMA_NAME,
    maxOutputTokens: ANALYSIS_OUTPUT_TOKEN_BUDGET,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const result = parseAnalysisResult(raw, analysisRequirementIds(input));
  if (!result) return { ok: false, error: "invalid-response" };
  return { ok: true, fingerprint, result };
}

function asProviderError(error: unknown): AnalysisProviderError {
  if (error instanceof AnalysisProviderError) return error;
  if (isRecord(error) && error.name === "AbortError") return new AnalysisProviderError("timeout");
  return new AnalysisProviderError("provider");
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
