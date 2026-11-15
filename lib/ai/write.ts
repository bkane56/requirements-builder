import { writingFingerprint, writingRequirementTexts, writingSourceFingerprint, type WritingClarification, type WritingOrigin } from "./writing-input";
import { buildWritingInput } from "./writing-input";
import type { AnalysisSource } from "./analysis-input";
import {
  WRITING_OUTPUT_TOKEN_BUDGET,
  WRITING_SCHEMA_NAME,
  parseWritingResult,
  writingResponseSchema,
  writingSchemaFailure,
  type WritingResult,
} from "./writing-schema";
import { WRITING_SYSTEM_PROMPT } from "./writing-prompt";
import { reportAnalysisDiagnostic } from "./diagnostics";
import { AnalysisProviderError, type AnalysisProvider } from "./provider";
import type { AnalysisErrorCode } from "./analyze";

export type WritingOutcome =
  | {
      ok: true;
      fingerprint: string;
      sourceFingerprint: string;
      origin: WritingOrigin;
      result: WritingResult;
      includedClarifications: WritingClarification[];
    }
  | { ok: false; error: AnalysisErrorCode };

const DEFAULT_RETRY_DELAY_MS = 250;

export async function writeRequirements(
  config: AnalysisSource,
  clarifications: readonly WritingClarification[],
  provider: AnalysisProvider,
  options: { timeoutMs: number; retryDelayMs?: number },
): Promise<WritingOutcome> {
  const input = buildWritingInput(config, clarifications);
  const fingerprint = writingFingerprint(input);
  const sourceFingerprint = writingSourceFingerprint(input);
  const origin: WritingOrigin = input.requirements.kind === "free-text" ? "free-text" : "structured";
  try {
    return await complete(provider, options.timeoutMs, input, fingerprint, sourceFingerprint, origin);
  } catch (error) {
    const failure = asProviderError(error);
    if (!failure.retryable) return { ok: false, error: failure.code };
  }
  await delay(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
  try {
    return await complete(provider, options.timeoutMs, input, fingerprint, sourceFingerprint, origin);
  } catch (error) {
    return { ok: false, error: asProviderError(error).code };
  }
}

async function complete(
  provider: AnalysisProvider,
  timeoutMs: number,
  input: ReturnType<typeof buildWritingInput>,
  fingerprint: string,
  sourceFingerprint: string,
  origin: WritingOrigin,
): Promise<WritingOutcome> {
  const raw = await provider.complete({
    system: WRITING_SYSTEM_PROMPT,
    user: fingerprint,
    schema: writingResponseSchema(writingRequirementTexts(input)),
    schemaName: WRITING_SCHEMA_NAME,
    maxOutputTokens: WRITING_OUTPUT_TOKEN_BUDGET,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const known = writingRequirementTexts(input);
  const result = parseWritingResult(raw, known);
  if (!result) {
    reportAnalysisDiagnostic(
      { stage: "schema", schemaFailure: writingSchemaFailure(raw, known) ?? "rejected" },
      "ai-writing",
    );
    return { ok: false, error: "invalid-response" };
  }
  return { ok: true, fingerprint, sourceFingerprint, origin, result, includedClarifications: input.clarifications };
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
