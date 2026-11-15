import { reportAnalysisDiagnostic, type AnalysisDiagnostic } from "./diagnostics";

export class AnalysisProviderError extends Error {
  readonly code: "timeout" | "provider" | "invalid-response";
  readonly retryable: boolean;

  constructor(code: "timeout" | "provider" | "invalid-response", retryable = false) {
    super(code);
    this.name = "AnalysisProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type StructuredCompletionRequest = {
  system: string;
  user: string;
  schema: object;
  schemaName: string;
  maxOutputTokens: number;
  signal: AbortSignal;
};

export type AnalysisCompletionRequest = StructuredCompletionRequest;

export type AnalysisProvider = {
  complete(request: StructuredCompletionRequest): Promise<unknown>;
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export function createOpenAiProvider(options: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}): AnalysisProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? OPENAI_RESPONSES_URL;
  return {
    async complete(request) {
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: options.model,
            max_output_tokens: request.maxOutputTokens,
            store: false,
            input: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
            text: {
              format: {
                type: "json_schema",
                name: request.schemaName,
                strict: true,
                schema: request.schema,
              },
            },
          }),
          signal: request.signal,
        });
      } catch (error) {
        if (request.signal.aborted || isAbortError(error)) throw new AnalysisProviderError("timeout");
        throw new AnalysisProviderError("provider");
      }
      if (response.status === 429 || response.status === 503) throw new AnalysisProviderError("provider", true);
      if (!response.ok) throw new AnalysisProviderError("provider");
      return readCompletedJson(response);
    },
  };
}

export function createAnalysisProvider(env: Record<string, string | undefined>): AnalysisProvider | null {
  if (env.AI_REVIEW_ENABLED !== "true" || env.AI_PROVIDER !== "openai") return null;
  const apiKey = env.AI_API_KEY?.trim() ?? "";
  const model = env.AI_MODEL?.trim() ?? "";
  if (apiKey.length === 0 || model.length === 0) return null;
  return createOpenAiProvider({ apiKey, model });
}

export function readAnalysisTimeoutMs(env: Record<string, string | undefined>): number {
  const parsed = Number(env.AI_REQUEST_TIMEOUT_MS);
  if (!Number.isInteger(parsed) || parsed < 1000 || parsed > 120000) return 30000;
  return parsed;
}

async function readCompletedJson(response: Response): Promise<unknown> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    reportAnalysisDiagnostic({ stage: "response-json", httpStatus: response.status, jsonParsed: false });
    throw new AnalysisProviderError("invalid-response");
  }
  const observed = observeResponse(payload);
  const text = readOutputText(payload);
  if (text === null) {
    reportAnalysisDiagnostic({
      stage: observed.responseStatus === "completed" ? "output-text" : "response-status",
      httpStatus: response.status,
      ...observed,
      outputTextPresent: false,
    });
    throw new AnalysisProviderError("invalid-response");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    reportAnalysisDiagnostic({
      stage: "output-json",
      httpStatus: response.status,
      ...observed,
      outputTextPresent: true,
      jsonParsed: false,
    });
    throw new AnalysisProviderError("invalid-response");
  }
}

function observeResponse(payload: unknown): Pick<AnalysisDiagnostic, "responseStatus" | "incompleteReason" | "outputTextPresent"> {
  if (!isRecord(payload)) return { responseStatus: null, incompleteReason: null, outputTextPresent: false };
  const incomplete = isRecord(payload.incomplete_details) ? payload.incomplete_details.reason : null;
  return {
    responseStatus: typeof payload.status === "string" ? payload.status : null,
    incompleteReason: typeof incomplete === "string" ? incomplete : null,
    outputTextPresent: readOutputText(payload) !== null,
  };
}

function readOutputText(payload: unknown): string | null {
  if (!isRecord(payload) || payload.status !== "completed" || !Array.isArray(payload.output)) return null;
  const message = payload.output.find((item) => isRecord(item) && item.type === "message");
  if (!isRecord(message) || !Array.isArray(message.content) || message.content.length === 0) return null;
  const content = message.content[0];
  if (!isRecord(content) || content.type === "refusal") return null;
  if (content.type !== "output_text" || typeof content.text !== "string") return null;
  return content.text;
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
