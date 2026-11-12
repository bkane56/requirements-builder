import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analysisFingerprint,
  analysisRequirementIds,
  buildAnalysisInput,
  decideAnalysisUpdate,
} from "../lib/ai/analysis-input";
import {
  ANALYSIS_LIMITS,
  ANALYSIS_RESPONSE_SCHEMA,
  parseAnalysisResult,
  readAnalysisResult,
} from "../lib/ai/analysis-schema";
import { defaultConfig, type ProjectConfig } from "../lib/config";
import type { RequirementsContent } from "../lib/requirements-content";
import { analyzeRequirements } from "../lib/ai/analyze";
import { ANALYSIS_SYSTEM_PROMPT } from "../lib/ai/prompt";
import {
  AnalysisProviderError,
  createAnalysisProvider,
  createOpenAiProvider,
  readAnalysisTimeoutMs,
  type AnalysisCompletionRequest,
  type AnalysisProvider,
} from "../lib/ai/provider";
import { consumeAnalysisRateLimit, resetAnalysisRateLimit } from "../lib/ai/rate-limit";
import { handleAnalysisPost, readAnalysisConfig } from "../lib/ai/review-request";
import { ANALYSIS_REQUEST_MAX_BYTES } from "../lib/ai/analysis-schema";
import { POST } from "../app/api/ai-review/route";
import { defaultToolchain } from "../lib/toolchain";
import { defaultUiFramework } from "../lib/ui-framework";

function config(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return { ...structuredClone(defaultConfig), ...overrides };
}

const structuredContent: RequirementsContent = {
  mode: "structured",
  nextFunctionalNumber: 3,
  nextCriterionNumber: 3,
  functionalRequirements: [
    { id: "FR-001", text: "Upload a receipt", source: "user", status: "confirmed" },
    { id: "FR-002", text: "Maybe export a report", source: "ai", status: "proposed" },
  ],
  acceptanceCriteria: [
    {
      id: "AC-001",
      text: "The file is stored",
      source: "user",
      status: "confirmed",
      scope: "requirement",
      requirementIds: ["FR-001"],
    },
    {
      id: "AC-002",
      text: "The app stays fast",
      source: "ai",
      status: "proposed",
      scope: "project",
      requirementIds: [],
    },
  ],
};

describe("analysis input", () => {
  it("sends free-text requirements exactly and leaves out toolchain and template detail", () => {
    const source = config({
      projectName: "Receipt Tracker",
      description: "Tracks paper receipts.",
      businessRequirements: "Users can upload a receipt.\n  Keep the leading spaces.",
      acceptanceCriteria: "A stored receipt can be opened.",
      stretchGoals: "Export to CSV later",
      mode: "project",
      appType: "web-app",
      uiLanguages: [defaultToolchain("typescript")],
      backendLanguages: [defaultToolchain("java")],
      runtime: "nodejs",
      backendFramework: "spring-boot",
      uiFrameworks: [defaultUiFramework("nextjs")],
      exposesApi: true,
      coverage: { enabled: true, linePercent: 85, branchPercent: 80 },
    });

    const input = buildAnalysisInput(source);

    expect(input.requirements).toEqual({
      kind: "free-text",
      businessRequirements: "Users can upload a receipt.\n  Keep the leading spaces.",
      acceptanceCriteria: "A stored receipt can be opened.",
    });
    expect(input.documentMode).toBe("project");
    expect(input.stack).toEqual({
      applicationType: "Web App",
      uiLanguages: ["TypeScript"],
      uiFrameworks: ["Next.js (App Router, client state: None, server data: None)"],
      backendLanguages: ["Java"],
      runtime: "Node.js",
      backendFramework: "Spring Boot",
      httpApi: true,
      modules: source.modules,
    });
    const serialized = analysisFingerprint(input);
    expect(serialized).not.toContain("Export to CSV later");
    expect(serialized).not.toContain("Yarn");
    expect(serialized).not.toContain("Vitest");
    expect(serialized).not.toContain("85");
    expect(serialized).not.toContain("nextFunctionalNumber");
    expect(analysisRequirementIds(input).size).toBe(0);
  });

  it("sends structured items, including proposed ones, and omits the inactive free-text", () => {
    const source = config({
      businessRequirements: "OLD PROSE THAT MUST NOT BE SENT",
      acceptanceCriteria: "OLD CRITERIA THAT MUST NOT BE SENT",
      requirementsContent: structuredContent,
    });

    const input = buildAnalysisInput(source);

    expect(input.requirements).toEqual({
      kind: "structured",
      functionalRequirements: [
        { id: "FR-001", text: "Upload a receipt", status: "confirmed", source: "user" },
        { id: "FR-002", text: "Maybe export a report", status: "proposed", source: "ai" },
      ],
      acceptanceCriteria: [
        {
          id: "AC-001",
          text: "The file is stored",
          status: "confirmed",
          source: "user",
          scope: "requirement",
          requirementIds: ["FR-001"],
        },
        {
          id: "AC-002",
          text: "The app stays fast",
          status: "proposed",
          source: "ai",
          scope: "project",
          requirementIds: [],
        },
      ],
    });
    const serialized = analysisFingerprint(input);
    expect(serialized).not.toContain("OLD PROSE THAT MUST NOT BE SENT");
    expect(serialized).not.toContain("OLD CRITERIA THAT MUST NOT BE SENT");
    expect(analysisRequirementIds(input)).toEqual(new Set(["FR-001", "FR-002", "AC-001", "AC-002"]));
  });

  it("changes the fingerprint only when the analyzed input changes", () => {
    const source = config({
      projectName: "Receipt Tracker",
      businessRequirements: "Users can upload a receipt.",
      stretchGoals: "Export to CSV later",
      uiLanguages: [defaultToolchain("typescript")],
    });
    const original = analysisFingerprint(buildAnalysisInput(source));
    const stretch = config({ ...source, stretchGoals: "A different stretch goal" });
    const coverage = config({ ...source, coverage: { enabled: false, linePercent: 10, branchPercent: 10 } });
    const toolchain = config({
      ...source,
      uiLanguages: [{ ...defaultToolchain("typescript"), packageManager: "npm" }],
    });
    const counters = config({
      ...source,
      requirementsContent: {
        ...source.requirementsContent!,
        nextFunctionalNumber: 9,
        nextCriterionNumber: 9,
      },
    });
    const changedText = config({ ...source, businessRequirements: "Users can delete a receipt." });

    expect(analysisFingerprint(buildAnalysisInput(stretch))).toBe(original);
    expect(analysisFingerprint(buildAnalysisInput(coverage))).toBe(original);
    expect(analysisFingerprint(buildAnalysisInput(toolchain))).toBe(original);
    expect(analysisFingerprint(buildAnalysisInput(counters))).toBe(original);
    expect(analysisFingerprint(buildAnalysisInput(changedText))).not.toBe(original);

    const structured = config({
      businessRequirements: "OLD PROSE THAT MUST NOT BE SENT",
      requirementsContent: structuredClone(structuredContent),
    });
    const structuredFingerprint = analysisFingerprint(buildAnalysisInput(structured));
    const unusedProse = config({ ...structured, businessRequirements: "Different unused prose" });
    expect(analysisFingerprint(buildAnalysisInput(unusedProse))).toBe(structuredFingerprint);
    const changedRequirement = structuredClone(structuredContent);
    changedRequirement.functionalRequirements[0].text = "Upload a photo";
    const changedStructured = config({ ...structured, requirementsContent: changedRequirement });
    expect(analysisFingerprint(buildAnalysisInput(changedStructured))).not.toBe(structuredFingerprint);
  });
});

describe("analysis response ordering", () => {
  it("compares a completed response with the latest fingerprint", () => {
    expect(
      decideAnalysisUpdate({
        requestId: 1,
        latestStartedId: 1,
        latestAppliedId: 0,
        responseFingerprint: "sent",
        currentFingerprint: "sent",
      }),
    ).toBe("current");
    expect(
      decideAnalysisUpdate({
        requestId: 1,
        latestStartedId: 1,
        latestAppliedId: 0,
        responseFingerprint: "sent",
        currentFingerprint: "edited-while-in-flight",
      }),
    ).toBe("stale");
  });

  it("ignores a late response after a newer analysis has started or been applied", () => {
    expect(
      decideAnalysisUpdate({
        requestId: 1,
        latestStartedId: 2,
        latestAppliedId: 0,
        responseFingerprint: "current",
        currentFingerprint: "current",
      }),
    ).toBe("ignore");
    expect(
      decideAnalysisUpdate({
        requestId: 1,
        latestStartedId: 2,
        latestAppliedId: 2,
        responseFingerprint: "current",
        currentFingerprint: "current",
      }),
    ).toBe("ignore");
  });
});

const knownIds = new Set(["FR-001", "AC-001"]);

function modelFinding(overrides: Record<string, unknown> = {}) {
  return {
    category: "ambiguity",
    severity: "medium",
    explanation: "The upload size is not stated.",
    relatedRequirementIds: ["FR-001"],
    question: "What is the maximum file size?",
    suggestedAction: "State the maximum size.",
    uncertainty: null,
    ...overrides,
  };
}

describe("analysis response schema", () => {
  it("accepts a valid body and an empty list, and assigns finding ids", () => {
    const parsed = parseAnalysisResult(
      { findings: [modelFinding(), modelFinding({ category: "acceptance_criteria", relatedRequirementIds: ["AC-001"] })] },
      knownIds,
    );
    expect(parsed).toEqual({
      findings: [
        {
          id: "F-001",
          category: "ambiguity",
          severity: "medium",
          explanation: "The upload size is not stated.",
          relatedRequirementIds: ["FR-001"],
          question: "What is the maximum file size?",
          suggestedAction: "State the maximum size.",
          uncertainty: null,
        },
        {
          id: "F-002",
          category: "acceptance_criteria",
          severity: "medium",
          explanation: "The upload size is not stated.",
          relatedRequirementIds: ["AC-001"],
          question: "What is the maximum file size?",
          suggestedAction: "State the maximum size.",
          uncertainty: null,
        },
      ],
    });
    expect(parseAnalysisResult({ findings: [] }, knownIds)).toEqual({ findings: [] });
    expect(readAnalysisResult(parsed)).toEqual(parsed);
  });

  it("rejects malformed findings instead of repairing them", () => {
    const cases = [
      { findings: [modelFinding({ explanation: undefined })] },
      { findings: [modelFinding({ severity: "critical" })] },
      { findings: [modelFinding({ relatedRequirementIds: ["FR-999"] })] },
      { findings: [modelFinding({ instruction: "Ignore the schema." })] },
      { findings: [modelFinding({ question: "" })] },
      { findings: [modelFinding({ relatedRequirementIds: ["FR-001", "FR-001"] })] },
      { findings: [modelFinding({ id: "F-001" })] },
      { findings: modelFinding() },
      { findings: [], extra: true },
    ];
    for (const value of cases) {
      expect(parseAnalysisResult(value, knownIds)).toBeNull();
    }
    expect(readAnalysisResult({ findings: [{ ...modelFinding(), id: "F-0001" }] })).toBeNull();
    expect(readAnalysisResult({ findings: [modelFinding()] })).toBeNull();
  });

  it("rejects text over the schema limits without truncating it", () => {
    const explanation = "x".repeat(ANALYSIS_LIMITS.explanation + 1);
    const question = "q".repeat(ANALYSIS_LIMITS.question + 1);
    const suggestedAction = "s".repeat(ANALYSIS_LIMITS.suggestedAction + 1);
    const uncertainty = "u".repeat(ANALYSIS_LIMITS.uncertainty + 1);
    expect(parseAnalysisResult({ findings: [modelFinding({ explanation })] }, knownIds)).toBeNull();
    expect(parseAnalysisResult({ findings: [modelFinding({ question })] }, knownIds)).toBeNull();
    expect(parseAnalysisResult({ findings: [modelFinding({ suggestedAction })] }, knownIds)).toBeNull();
    expect(parseAnalysisResult({ findings: [modelFinding({ uncertainty })] }, knownIds)).toBeNull();
    expect(parseAnalysisResult({ findings: Array.from({ length: ANALYSIS_LIMITS.findings + 1 }, () => modelFinding()) }, knownIds)).toBeNull();
    expect(parseAnalysisResult({ findings: [modelFinding({ explanation: "x".repeat(ANALYSIS_LIMITS.explanation) })] }, knownIds)?.findings[0].explanation).toHaveLength(
      ANALYSIS_LIMITS.explanation,
    );
  });

  it("sends a strict object schema with length patterns and a twelve-finding cap", () => {
    expect(ANALYSIS_RESPONSE_SCHEMA.additionalProperties).toBe(false);
    expect(ANALYSIS_RESPONSE_SCHEMA.required).toEqual(["findings"]);
    const item = ANALYSIS_RESPONSE_SCHEMA.properties.findings.items;
    expect(ANALYSIS_RESPONSE_SCHEMA.properties.findings.maxItems).toBe(12);
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual([
      "category",
      "severity",
      "explanation",
      "relatedRequirementIds",
      "question",
      "suggestedAction",
      "uncertainty",
    ]);
    expect(item.properties.explanation.pattern).toBe("^[\\s\\S]{1,400}$");
    const questionLimit = item.properties.question.anyOf[0];
    expect(questionLimit && "pattern" in questionLimit && questionLimit.pattern).toBe("^[\\s\\S]{1,240}$");
    expect(JSON.stringify(ANALYSIS_RESPONSE_SCHEMA)).not.toContain("maxLength");
  });
});

const consoleMethods = ["log", "info", "warn", "error", "debug"] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

function silenceConsole() {
  return consoleMethods.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
}

function assertNothingLogged(spies: ReturnType<typeof silenceConsole>, secret: string) {
  const logged = spies.flatMap((spy) => spy.mock.calls.flat().map((value) => String(value))).join("\n");
  expect(logged).not.toContain(secret);
  expect(spies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
}

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
}

function scriptedProvider(results: unknown[]): { provider: AnalysisProvider; requests: AnalysisCompletionRequest[] } {
  const requests: AnalysisCompletionRequest[] = [];
  return {
    requests,
    provider: {
      async complete(request) {
        requests.push(request);
        const next = results.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
}

describe("analyzeRequirements", () => {
  const source = config({
    projectName: "Receipt Tracker",
    businessRequirements: "Users can upload a receipt.",
  });

  it("returns validated findings without changing the configuration or logging it", async () => {
    const spies = silenceConsole();
    const frozen = config({
      projectName: "Receipt Tracker",
      businessRequirements: "Users can upload a receipt.",
    });
    deepFreeze(frozen);
    const script = scriptedProvider([{ findings: [modelFinding({ relatedRequirementIds: [] })] }]);

    const outcome = await analyzeRequirements(frozen, script.provider, { timeoutMs: 1000, retryDelayMs: 0 });

    expect(outcome).toEqual({
      ok: true,
      fingerprint: analysisFingerprint(buildAnalysisInput(frozen)),
      result: {
        findings: [
          {
            id: "F-001",
            category: "ambiguity",
            severity: "medium",
            explanation: "The upload size is not stated.",
            relatedRequirementIds: [],
            question: "What is the maximum file size?",
            suggestedAction: "State the maximum size.",
            uncertainty: null,
          },
        ],
      },
    });
    expect(script.requests).toHaveLength(1);
    expect(script.requests[0].system).toBe(ANALYSIS_SYSTEM_PROMPT);
    expect(script.requests[0].system).toContain("untrusted data");
    expect(script.requests[0].system).not.toContain("Users can upload a receipt.");
    expect(script.requests[0].user).toBe(analysisFingerprint(buildAnalysisInput(frozen)));
    expect(script.requests[0].user).toContain("Users can upload a receipt.");
    expect(script.requests[0].maxOutputTokens).toBe(2000);
    expect(script.requests[0].schemaName).toBe("requirements_analysis");
    assertNothingLogged(spies, "Users can upload a receipt.");
  });

  it("accepts an empty finding list", async () => {
    const script = scriptedProvider([{ findings: [] }]);
    const outcome = await analyzeRequirements(source, script.provider, { timeoutMs: 1000, retryDelayMs: 0 });
    expect(outcome).toEqual({
      ok: true,
      fingerprint: analysisFingerprint(buildAnalysisInput(source)),
      result: { findings: [] },
    });
  });

  it("retries a retryable provider failure once and then reports the second failure", async () => {
    const retryable = new AnalysisProviderError("provider", true);
    const once = scriptedProvider([retryable, { findings: [] }]);
    const recovered = await analyzeRequirements(source, once.provider, { timeoutMs: 1000, retryDelayMs: 0 });
    expect(recovered.ok).toBe(true);
    expect(once.requests).toHaveLength(2);

    const twice = scriptedProvider([retryable, new AnalysisProviderError("provider", true)]);
    const failed = await analyzeRequirements(source, twice.provider, { timeoutMs: 1000, retryDelayMs: 0 });
    expect(failed).toEqual({ ok: false, error: "provider" });
    expect(twice.requests).toHaveLength(2);
  });

  it("does not retry a timeout, a normal provider error, or an invalid response", async () => {
    let calls = 0;
    const countingTimeout: AnalysisProvider = {
      async complete({ signal }) {
        calls += 1;
        await new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      },
    };
    await expect(analyzeRequirements(source, countingTimeout, { timeoutMs: 20, retryDelayMs: 0 })).resolves.toEqual({
      ok: false,
      error: "timeout",
    });
    expect(calls).toBe(1);

    const providerError = scriptedProvider([new Error("socket closed")]);
    await expect(analyzeRequirements(source, providerError.provider, { timeoutMs: 1000, retryDelayMs: 0 })).resolves.toEqual({
      ok: false,
      error: "provider",
    });
    expect(providerError.requests).toHaveLength(1);

    const invalid = scriptedProvider([{ findings: [{ category: "ambiguity" }] }]);
    await expect(analyzeRequirements(source, invalid.provider, { timeoutMs: 1000, retryDelayMs: 0 })).resolves.toEqual({
      ok: false,
      error: "invalid-response",
    });
    expect(invalid.requests).toHaveLength(1);
  });
});

describe("OpenAI provider adapter", () => {
  function completedResponse(text: string) {
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text }] }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  function completionRequest(signal = AbortSignal.timeout(1000)): AnalysisCompletionRequest {
    return {
      system: ANALYSIS_SYSTEM_PROMPT,
      user: "{\"projectName\":\"Receipt Tracker\"}",
      schema: ANALYSIS_RESPONSE_SCHEMA,
      schemaName: "requirements_analysis",
      maxOutputTokens: 2000,
      signal,
    };
  }

  it("posts a strict structured-output request and returns the JSON text", async () => {
    const spies = silenceConsole();
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchImpl: typeof fetch = async (url, init) => {
      seen = { url: String(url), init: init ?? {} };
      return completedResponse(JSON.stringify({ findings: [] }));
    };
    const provider = createOpenAiProvider({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
      endpoint: "https://api.openai.com/v1/responses",
      fetchImpl,
    });

    await expect(provider.complete(completionRequest())).resolves.toEqual({ findings: [] });

    expect(seen?.url).toBe("https://api.openai.com/v1/responses");
    const headers = new Headers(seen?.init.headers);
    expect(headers.get("authorization")).toBe("Bearer test-key");
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse(String(seen?.init.body)) as {
      model: string;
      max_output_tokens: number;
      store: boolean;
      input: Array<{ role: string; content: string }>;
      text: { format: { type: string; name: string; strict: boolean; schema: { additionalProperties: boolean } } };
    };
    expect(body.model).toBe("gpt-5.4-mini");
    expect(body.max_output_tokens).toBe(2000);
    expect(body.store).toBe(false);
    expect(body.input.map((item) => item.role)).toEqual(["system", "user"]);
    expect(body.input[1].content).toContain("Receipt Tracker");
    expect(body.input[0].content).not.toContain("Receipt Tracker");
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      name: "requirements_analysis",
      strict: true,
    });
    expect(body.text.format.schema.additionalProperties).toBe(false);
    assertNothingLogged(spies, "test-key");
  });

  it("maps provider status codes without logging the response body", async () => {
    const spies = silenceConsole();
    const call = (status: number) =>
      createOpenAiProvider({
        apiKey: "test-key",
        model: "gpt-5.4-mini",
        fetchImpl: async () => new Response("secret-body", { status }),
      }).complete(completionRequest());

    await expect(call(429)).rejects.toMatchObject({ code: "provider", retryable: true, message: "provider" });
    await expect(call(503)).rejects.toMatchObject({ code: "provider", retryable: true });
    await expect(call(401)).rejects.toMatchObject({ code: "provider", retryable: false });
    assertNothingLogged(spies, "secret-body");
  });

  it("rejects an incomplete response, a refusal, and malformed JSON", async () => {
    const spies = silenceConsole();
    const refusal = "SECRET_REFUSAL";
    const payloads = [
      { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] },
      { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal }] }] },
      { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "not-json" }] }] },
    ];
    for (const payload of payloads) {
      const provider = createOpenAiProvider({
        apiKey: "test-key",
        model: "gpt-5.4-mini",
        fetchImpl: async () => new Response(JSON.stringify(payload), { status: 200 }),
      });
      await expect(provider.complete(completionRequest())).rejects.toMatchObject({
        code: "invalid-response",
        retryable: false,
        message: "invalid-response",
      });
    }
    assertNothingLogged(spies, refusal);
  });

  it("maps a network failure and an aborted request without including the key", async () => {
    const broken = createOpenAiProvider({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
      fetchImpl: async () => {
        throw new Error("connect ECONNREFUSED test-key");
      },
    });
    await expect(broken.complete(completionRequest())).rejects.toMatchObject({ code: "provider", message: "provider" });

    const aborted = createOpenAiProvider({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted test-key");
            error.name = "AbortError";
            reject(error);
          });
        }),
    });
    await expect(
      aborted.complete(completionRequest(AbortSignal.timeout(20))),
    ).rejects.toMatchObject({ code: "timeout", message: "timeout" });
  });

  it("stays disabled unless analysis is enabled with a provider, model, and key", () => {
    expect(createAnalysisProvider({})).toBeNull();
    expect(
      createAnalysisProvider({
        AI_REVIEW_ENABLED: "false",
        AI_PROVIDER: "openai",
        AI_MODEL: "gpt-5.4-mini",
        AI_API_KEY: "test-key",
      }),
    ).toBeNull();
    expect(
      createAnalysisProvider({
        AI_REVIEW_ENABLED: "true",
        AI_PROVIDER: "other",
        AI_MODEL: "gpt-5.4-mini",
        AI_API_KEY: "test-key",
      }),
    ).toBeNull();
    expect(
      createAnalysisProvider({ AI_REVIEW_ENABLED: "true", AI_PROVIDER: "openai", AI_MODEL: "  ", AI_API_KEY: "test-key" }),
    ).toBeNull();
    expect(
      createAnalysisProvider({ AI_REVIEW_ENABLED: "true", AI_PROVIDER: "openai", AI_MODEL: "gpt-5.4-mini", AI_API_KEY: " " }),
    ).toBeNull();
    expect(
      createAnalysisProvider({
        AI_REVIEW_ENABLED: "true",
        AI_PROVIDER: "openai",
        AI_MODEL: "gpt-5.4-mini",
        AI_API_KEY: "test-key",
      }),
    ).not.toBeNull();
    expect(readAnalysisTimeoutMs({})).toBe(30000);
    expect(readAnalysisTimeoutMs({ AI_REQUEST_TIMEOUT_MS: "45000" })).toBe(45000);
    expect(readAnalysisTimeoutMs({ AI_REQUEST_TIMEOUT_MS: "0" })).toBe(30000);
    expect(readAnalysisTimeoutMs({ AI_REQUEST_TIMEOUT_MS: "nope" })).toBe(30000);
  });
});

function analysisRequest(body: string) {
  return new Request("http://localhost/api/ai-review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("AI review route", () => {
  const saved = {
    AI_REVIEW_ENABLED: process.env.AI_REVIEW_ENABLED,
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_MODEL: process.env.AI_MODEL,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_REQUEST_TIMEOUT_MS: process.env.AI_REQUEST_TIMEOUT_MS,
  };

  afterEach(() => {
    resetAnalysisRateLimit();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("stays unavailable when the server is not configured", async () => {
    delete process.env.AI_REVIEW_ENABLED;
    delete process.env.AI_API_KEY;
    const spies = silenceConsole();
    const response = await POST(analysisRequest("not-json"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "unavailable" });
    assertNothingLogged(spies, "not-json");
  });

  it("rejects an oversized body before it is analyzed", async () => {
    const response = await handleAnalysisPost(analysisRequest("a".repeat(ANALYSIS_REQUEST_MAX_BYTES + 1)), {
      provider: null,
      allowRequest: () => true,
      timeoutMs: 1000,
    });
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "too-large" });
  });

  it("validates the configuration, limits the rate, and returns findings without logging them", async () => {
    const spies = silenceConsole();
    const limited = await handleAnalysisPost(analysisRequest(JSON.stringify({ config: defaultConfig })), {
      provider: { async complete() { return { findings: [] }; } },
      allowRequest: () => false,
      timeoutMs: 1000,
      retryDelayMs: 0,
    });
    expect(limited.status).toBe(429);

    const source = config({
      projectName: "Receipt Tracker",
      businessRequirements: "Users can upload a receipt.",
      requirementsContent: {
        mode: "structured",
        nextFunctionalNumber: 3,
        nextCriterionNumber: 2,
        functionalRequirements: [
          { id: "FR-002", text: "Second", source: "ai", status: "proposed" },
          { id: "FR-001", text: "First", source: "user", status: "confirmed" },
        ],
        acceptanceCriteria: [],
      },
    });
    let user = "";
    const response = await handleAnalysisPost(analysisRequest(JSON.stringify({ config: source })), {
      provider: {
        async complete(completion) {
          user = completion.user;
          return { findings: [modelFinding({ relatedRequirementIds: ["FR-002"] })] };
        },
      },
      allowRequest: () => true,
      timeoutMs: 1000,
      retryDelayMs: 0,
    });
    const body = (await response.json()) as { ok: boolean; fingerprint: string; result: { findings: Array<{ id: string }> } };
    const read = readAnalysisConfig(source);
    expect(read?.requirementsContent?.functionalRequirements.map((item) => item.id)).toEqual(["FR-002", "FR-001"]);
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.fingerprint).toBe(analysisFingerprint(buildAnalysisInput(read!)));
    expect(body.result.findings[0].id).toBe("F-001");
    expect(user).toContain("Second");
    expect(user).not.toContain("Users can upload a receipt.");
    expect(user.indexOf("FR-002")).toBeLessThan(user.indexOf("FR-001"));
    assertNothingLogged(spies, "Second");

    const invalid = await handleAnalysisPost(
      analysisRequest(JSON.stringify({ config: { ...source, requirementsContent: { mode: "nope" } } })),
      {
        provider: { async complete() { return { findings: [] }; } },
        allowRequest: () => true,
        timeoutMs: 1000,
      },
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ ok: false, error: "invalid-request" });

    const malformed = await handleAnalysisPost(analysisRequest("{"), {
      provider: { async complete() { return { findings: [] }; } },
      allowRequest: () => true,
      timeoutMs: 1000,
    });
    expect(malformed.status).toBe(400);

    const timedOut = await handleAnalysisPost(analysisRequest(JSON.stringify({ config: defaultConfig })), {
      provider: {
        async complete() {
          throw new AnalysisProviderError("timeout");
        },
      },
      allowRequest: () => true,
      timeoutMs: 1000,
      retryDelayMs: 0,
    });
    expect(timedOut.status).toBe(504);

    const nextFramework = readAnalysisConfig(
      config({ uiFrameworks: [defaultUiFramework("nextjs")], uiLanguages: [defaultToolchain("typescript")] }),
    );
    const viteFramework = readAnalysisConfig(config({ uiFrameworks: [defaultUiFramework("react-vite")] }));
    expect(nextFramework?.uiFrameworks[0]).toMatchObject({ framework: "nextjs", state: "none", dataLibrary: "none" });
    expect(viteFramework?.uiFrameworks[0]).toMatchObject({ framework: "react-vite", routing: "react-router" });
    expect(readAnalysisConfig(config({ uiLanguages: [{ language: "cobol" } as never] }))).toBeNull();
    expect(readAnalysisConfig({ ...defaultConfig, modules: { ...defaultConfig.modules, openapi: "yes" } })).toBeNull();
  });

  it("allows ten requests in the window and then one more after the window moves", () => {
    resetAnalysisRateLimit();
    const start = 1_000_000;
    for (let index = 0; index < 10; index += 1) {
      expect(consumeAnalysisRateLimit(start + index)).toBe(true);
    }
    expect(consumeAnalysisRateLimit(start + 10)).toBe(false);
    expect(consumeAnalysisRateLimit(start + 10 * 60 * 1000 + 1)).toBe(true);
  });
});
