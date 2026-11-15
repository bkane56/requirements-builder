import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/ai-write/route";
import { analysisFingerprint, buildAnalysisInput } from "../lib/ai/analysis-input";
import { AnalysisProviderError, createAnalysisProvider, createOpenAiProvider, type AnalysisCompletionRequest, type AnalysisProvider } from "../lib/ai/provider";
import { consumeAnalysisRateLimit, consumeWritingRateLimit, resetAnalysisRateLimit, resetWritingRateLimit } from "../lib/ai/rate-limit";
import { handleWritingPost } from "../lib/ai/writing-request";
import { WRITING_LIMITS, WRITING_OUTPUT_TOKEN_BUDGET, parseWritingResult, writingSchemaFailure } from "../lib/ai/writing-schema";
import { WRITING_SYSTEM_PROMPT } from "../lib/ai/writing-prompt";
import {
  activeNestedCriteria,
  criterionLinkMissing,
  detachNestedCriteria,
  dismissSuggestion,
  editNestedCriterionText,
  editSuggestionText,
  exactTextExists,
  type WritingSession,
} from "../lib/ai/writing-suggestions";
import {
  buildWritingInput,
  currentSourceFingerprint,
  readSubmittedClarifications,
  selectModelClarifications,
  writingFingerprint,
  writingRequirementTexts,
  writingSourceFingerprint,
} from "../lib/ai/writing-input";
import { writeRequirements } from "../lib/ai/write";
import { defaultConfig, type ProjectConfig } from "../lib/config";
import {
  beginStructuredRequirements,
  defaultRequirementsContent,
  removeFunctionalRequirement,
  type RequirementsContent,
} from "../lib/requirements-content";

function config(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return { ...structuredClone(defaultConfig), ...overrides };
}

function emptyModelResult() {
  return {
    newFunctionalRequirements: [],
    revisedFunctionalRequirements: [],
    newAcceptanceCriteria: [],
    revisedAcceptanceCriteria: [],
    unresolvedQuestions: [],
  };
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

const known = {
  functional: new Map([["FR-001", "Users can upload a receipt."]]),
  criteria: new Map([["AC-001", "The file is stored."]]),
};

describe("writing input", () => {
  it("preserves free-text requirements and omits template detail", () => {
    const source = config({
      projectName: "Receipt Tracker",
      description: "Tracks paper receipts.",
      businessRequirements: "Users can upload a receipt.\n  Keep the leading spaces.",
      acceptanceCriteria: "A stored receipt can be opened.",
      stretchGoals: "Export to CSV later",
    });
    const input = buildWritingInput(source, []);
    expect(input.requirements).toEqual({
      kind: "free-text",
      businessRequirements: "Users can upload a receipt.\n  Keep the leading spaces.",
      acceptanceCriteria: "A stored receipt can be opened.",
      authoritative: true,
    });
    expect(writingFingerprint(input)).not.toContain("Export to CSV later");
    expect(writingFingerprint(input)).not.toContain("Yarn");
  });

  it("marks only confirmed structured items as authoritative and omits inactive free text", () => {
    const source = config({
      businessRequirements: "OLD PROSE THAT MUST NOT BE SENT",
      acceptanceCriteria: "OLD CRITERIA THAT MUST NOT BE SENT",
      requirementsContent: {
        mode: "structured",
        nextFunctionalNumber: 3,
        nextCriterionNumber: 2,
        functionalRequirements: [
          { id: "FR-001", text: "Upload a receipt", source: "user", status: "confirmed" },
          { id: "FR-002", text: "Maybe export a report", source: "ai", status: "proposed" },
        ],
        acceptanceCriteria: [],
      },
    });
    const input = buildWritingInput(source, []);
    expect(input.requirements.kind).toBe("structured");
    if (input.requirements.kind !== "structured") return;
    expect(input.requirements.functionalRequirements.map((item) => item.authoritative)).toEqual([true, false]);
    expect(writingFingerprint(input)).not.toContain("OLD PROSE");
    expect(writingFingerprint(input)).not.toContain("OLD CRITERIA");
  });

  it("ignores a forged current flag and a mismatched fingerprint", () => {
    const source = config({ projectName: "Receipt Tracker", businessRequirements: "Users can upload a receipt." });
    const actual = analysisFingerprint(buildAnalysisInput(source));
    const submitted = readSubmittedClarifications([
      {
        requestId: 4,
        findingId: "F-001",
        question: "Which details are shown?",
        answer: "  Name and role.\n",
        analysisFingerprint: "stale-fingerprint",
        current: true,
      },
      {
        requestId: 4,
        findingId: "F-002",
        question: "What is the limit?",
        answer: "10 MB",
        analysisFingerprint: "other-fingerprint",
        current: true,
      },
    ]);
    expect(submitted).not.toBeNull();
    const selected = selectModelClarifications(source, submitted!);
    expect(selected.included).toEqual([]);
    expect(selected.excludedFindingIds).toEqual(["F-001", "F-002"]);
    const input = buildWritingInput(source, selected.included);
    expect(writingFingerprint(input)).not.toContain("Name and role");
    expect(writingFingerprint(input)).not.toContain("10 MB");
    expect(actual).not.toBe("stale-fingerprint");
  });

  it("includes a clarification whose fingerprint matches the configuration", () => {
    const source = config({ projectName: "Receipt Tracker", businessRequirements: "Users can upload a receipt." });
    const actual = analysisFingerprint(buildAnalysisInput(source));
    const submitted = readSubmittedClarifications([
      {
        requestId: 4,
        findingId: "F-001",
        question: "Which details are shown?",
        answer: "  Name and role.\n",
        analysisFingerprint: actual,
        current: false,
      },
    ]);
    const selected = selectModelClarifications(source, submitted!);
    expect(selected.excludedFindingIds).toEqual([]);
    expect(selected.included).toEqual([
      {
        requestId: 4,
        findingId: "F-001",
        question: "Which details are shown?",
        answer: "  Name and role.\n",
      },
    ]);
  });

  it("keeps a free-text source fingerprint across a mode switch and drops it when the free text changes", () => {
    const businessRequirements = "Users can upload a receipt.";
    const source = config({ projectName: "Receipt Tracker", businessRequirements, acceptanceCriteria: "" });
    const input = buildWritingInput(source, []);
    const originFingerprint = writingSourceFingerprint(input);
    const copied = beginStructuredRequirements(defaultRequirementsContent(), "copy", businessRequirements, "");
    const empty = beginStructuredRequirements(defaultRequirementsContent(), "empty", businessRequirements, "");
    const copiedConfig = config({
      projectName: "Receipt Tracker",
      businessRequirements,
      acceptanceCriteria: "",
      requirementsContent: copied,
    });
    const emptyConfig = config({
      projectName: "Receipt Tracker",
      businessRequirements,
      acceptanceCriteria: "",
      requirementsContent: empty,
    });
    expect(currentSourceFingerprint(copiedConfig, "free-text", [])).toBe(originFingerprint);
    expect(currentSourceFingerprint(emptyConfig, "free-text", [])).toBe(originFingerprint);
    expect(copiedConfig.businessRequirements).toBe(businessRequirements);
    const edited = config({ ...copiedConfig, businessRequirements: "Users can upload a receipt today." });
    expect(currentSourceFingerprint(edited, "free-text", [])).not.toBe(originFingerprint);
  });

  it("does not let an inactive free-text edit change a structured source fingerprint", () => {
    const content: RequirementsContent = {
      mode: "structured",
      nextFunctionalNumber: 2,
      nextCriterionNumber: 1,
      functionalRequirements: [{ id: "FR-001", text: "Upload a receipt", source: "user", status: "confirmed" }],
      acceptanceCriteria: [],
    };
    const source = config({
      projectName: "Receipt Tracker",
      businessRequirements: "Original prose",
      requirementsContent: content,
    });
    const originFingerprint = writingSourceFingerprint(buildWritingInput(source, []));
    const edited = config({ ...source, businessRequirements: "Changed prose that is not in the document" });
    expect(currentSourceFingerprint(edited, "structured", [])).toBe(originFingerprint);
    const changedItem = config({
      ...source,
      requirementsContent: {
        ...content,
        functionalRequirements: [{ id: "FR-001", text: "Upload a receipt today", source: "user", status: "confirmed" }],
      },
    });
    expect(currentSourceFingerprint(changedItem, "structured", [])).not.toBe(originFingerprint);
  });
});

describe("writing parser", () => {
  it("assigns suggestion ids and leaves nested criteria without requirement ids", () => {
    const result = parseWritingResult(
      {
        ...emptyModelResult(),
        newFunctionalRequirements: [
          {
            text: "Users can open a stored receipt.",
            rationale: "The free text says a stored receipt can be opened.",
            uncertainty: null,
            acceptanceCriteria: [{ text: "Opening a stored receipt shows its image.", rationale: "The outcome is visible." }],
          },
        ],
        unresolvedQuestions: [{ question: "Which fields are required?", whyNeeded: "The text does not list fields.", relatedRequirementIds: [] }],
      },
      { functional: new Map(), criteria: new Map() },
    );
    expect(result?.suggestions.map((item) => item.id)).toEqual(["W-001", "W-002"]);
    expect(result?.suggestions[0]).toMatchObject({ kind: "new-functional", nestedCriteria: [{ text: "Opening a stored receipt shows its image." }] });
    expect(JSON.stringify(result)).not.toContain("FR-");
    expect(JSON.stringify(result)).not.toContain("AC-");
  });

  it("rejects unknown references, duplicates, conflicts, and unchanged revisions", () => {
    const base = emptyModelResult();
    expect(
      parseWritingResult(
        { ...base, revisedFunctionalRequirements: [{ targetId: "FR-009", text: "A new sentence.", rationale: "Missing from the input.", uncertainty: null }] },
        known,
      ),
    ).toBeNull();
    expect(
      parseWritingResult(
        {
          ...base,
          newFunctionalRequirements: [
            { text: "Users can upload a receipt.", rationale: "This repeats the current requirement.", uncertainty: null, acceptanceCriteria: [] },
          ],
        },
        known,
      ),
    ).toBeNull();
    expect(
      parseWritingResult(
        {
          ...base,
          revisedFunctionalRequirements: [
            { targetId: "FR-001", text: "Users can upload a receipt today.", rationale: "One revision.", uncertainty: null },
            { targetId: "FR-001", text: "Users can upload a receipt tomorrow.", rationale: "Another revision.", uncertainty: null },
          ],
        },
        known,
      ),
    ).toBeNull();
    expect(
      parseWritingResult(
        {
          ...base,
          revisedFunctionalRequirements: [
            { targetId: "FR-001", text: "Users can upload a receipt.", rationale: "No change.", uncertainty: null },
          ],
        },
        known,
      ),
    ).toBeNull();
    expect(parseWritingResult({ ...base, newAcceptanceCriteria: [{ text: "A file is rejected.", scope: "requirement", requirementIds: ["FR-009"], rationale: "Unknown link.", uncertainty: null }] }, known)).toBeNull();
  });
});

describe("nested suggestion lifecycle", () => {
  function session(): WritingSession {
    return {
      requestId: 1,
      origin: "free-text",
      sourceFingerprint: "source",
      writingFingerprint: "writing",
      suggestions: [
        {
          id: "W-001",
          kind: "new-functional",
          text: "Users can open a stored receipt.",
          rationale: "The free text says so.",
          uncertainty: null,
          nestedCriteria: [{ text: "Opening a stored receipt shows its image.", rationale: "The outcome is visible." }],
        },
      ],
      dismissedIds: [],
      acceptedIds: [],
      nextSuggestionNumber: 2,
      includedClarifications: [],
    };
  }

  it("edits text without assigning ids and dismisses nested criteria with the parent", () => {
    const edited = editNestedCriterionText(editSuggestionText(session(), "W-001", "Users can open one stored receipt."), "W-001", 0, "The image is shown.");
    expect(edited.suggestions[0]).toMatchObject({ text: "Users can open one stored receipt." });
    expect(activeNestedCriteria(edited, "W-001")[0]?.text).toBe("The image is shown.");
    expect(JSON.stringify(edited)).not.toContain("FR-");
    const dismissed = dismissSuggestion(edited, "W-001");
    expect(activeNestedCriteria(dismissed, "W-001")).toEqual([]);
    expect(dismissed.suggestions.some((item) => item.kind === "new-criterion")).toBe(false);
  });

  it("links a nested criterion only after the parent is accepted, and blocks it if that requirement is deleted", () => {
    const content: RequirementsContent = {
      mode: "structured",
      nextFunctionalNumber: 2,
      nextCriterionNumber: 1,
      functionalRequirements: [{ id: "FR-001", text: "Users can open a stored receipt.", source: "ai", status: "proposed" }],
      acceptanceCriteria: [],
    };
    const linked = detachNestedCriteria(session(), "W-001", "FR-001");
    expect(linked?.acceptedIds).toEqual(["W-001"]);
    expect(linked?.suggestions[0]).toMatchObject({ id: "W-001", detachedIds: ["W-002"] });
    expect(linked?.suggestions[1]).toMatchObject({ id: "W-002", kind: "new-criterion", requirementIds: ["FR-001"] });
    expect(content.acceptanceCriteria).toEqual([]);
    expect(criterionLinkMissing(content, linked!.suggestions[1]!)).toBe(false);
    const deleted = removeFunctionalRequirement(content, "FR-001");
    expect(criterionLinkMissing(deleted, linked!.suggestions[1]!)).toBe(true);
    expect(linked?.suggestions[1]).toMatchObject({ scope: "requirement", requirementIds: ["FR-001"] });
    expect(exactTextExists(content, "Users can open a stored receipt.")).toBe(true);
  });
});

describe("writeRequirements", () => {
  const source = config({ projectName: "Receipt Tracker", businessRequirements: "Users can upload a receipt." });

  it("sends the writing schema and only the clarification the server kept", async () => {
    const script = scriptedProvider([
      {
        ...emptyModelResult(),
        newFunctionalRequirements: [
          { text: "Users can upload a receipt up to 10 MB.", rationale: "The answer states the limit.", uncertainty: null, acceptanceCriteria: [] },
        ],
      },
    ]);
    const actual = analysisFingerprint(buildAnalysisInput(source));
    const selected = selectModelClarifications(source, [
      { requestId: 1, findingId: "F-001", question: "What is the limit?", answer: "10 MB", analysisFingerprint: actual },
      { requestId: 1, findingId: "F-002", question: "Who pays?", answer: "The buyer", analysisFingerprint: "forged" },
    ]);
    const outcome = await writeRequirements(source, selected.included, script.provider, { timeoutMs: 1000, retryDelayMs: 0 });
    expect(outcome.ok).toBe(true);
    expect(script.requests[0]?.schemaName).toBe("requirements_writing");
    expect(script.requests[0]?.maxOutputTokens).toBe(WRITING_OUTPUT_TOKEN_BUDGET);
    expect(script.requests[0]?.user).toContain("10 MB");
    expect(script.requests[0]?.user).not.toContain("The buyer");
    expect(script.requests[0]?.system).not.toContain("requirements analyst");
  });

  it("separates behavior, testable criteria, and stated constraints without a new record type", () => {
    expect(WRITING_SYSTEM_PROMPT).toContain("required system behavior");
    expect(WRITING_SYSTEM_PROMPT).toContain("objectively testable condition and the expected result");
    expect(WRITING_SYSTEM_PROMPT).toContain("must not restate its parent requirement");
    expect(WRITING_SYSTEM_PROMPT).toContain("Given/When/Then wording is not required");
    expect(WRITING_SYSTEM_PROMPT).toContain("Do not create a separate constraint record");
    expect(WRITING_SYSTEM_PROMPT).toContain("Do not put system behavior into a project-wide acceptance criterion");
    expect(WRITING_SYSTEM_PROMPT).toContain("nested acceptance criteria");
    expect(WRITING_SYSTEM_PROMPT).toContain("user-visible behavior, a business rule, or whether an acceptance criterion can be written");
    expect(WRITING_SYSTEM_PROMPT).toContain("unless the project text already makes that name necessary");
    expect(WRITING_SYSTEM_PROMPT).toContain("A clarification answer included in the document is settled");
    expect(WRITING_SYSTEM_PROMPT).toContain("Do not fill an array just because it has room");
    expect(WRITING_SYSTEM_PROMPT).not.toContain("technicalConstraints");
  });

  it("caps new functional requirements at 12 and posts a 6000-token OpenAI budget", async () => {
    expect(WRITING_LIMITS.newFunctional).toBe(12);
    expect(WRITING_OUTPUT_TOKEN_BUDGET).toBe(6000);
    const overCap = { ...emptyModelResult(), newFunctionalRequirements: Array.from({ length: 13 }, () => ({})) };
    expect(writingSchemaFailure(overCap, { functional: new Map(), criteria: new Map() })).toBe("new-functional-count");
    expect(parseWritingResult(overCap, { functional: new Map(), criteria: new Map() })).toBeNull();

    let seenBody = "";
    const fetchImpl: typeof fetch = async (_url, init) => {
      seenBody = String(init?.body);
      return new Response(
        JSON.stringify({
          status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(emptyModelResult()) }] }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const provider = createOpenAiProvider({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
      fetchImpl,
    });
    const outcome = await writeRequirements(source, [], provider, { timeoutMs: 1000, retryDelayMs: 0 });
    expect(outcome.ok).toBe(true);
    const body = JSON.parse(seenBody) as {
      max_output_tokens: number;
      store: boolean;
      text: {
        format: {
          name: string;
          strict: boolean;
          schema: { properties: { newFunctionalRequirements: { maxItems: number } } };
        };
      };
    };
    expect(body.max_output_tokens).toBe(6000);
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({ name: "requirements_writing", strict: true });
    expect(body.text.format.schema.properties.newFunctionalRequirements.maxItems).toBe(12);
  });

  it("rejects invented free-text identifiers and does not offer those identifiers to the model", async () => {
    const emptyKnown = { functional: new Map<string, string>(), criteria: new Map<string, string>() };
    const revision = {
      ...emptyModelResult(),
      revisedFunctionalRequirements: [
        { targetId: "FR-001", text: "Users can upload a receipt today.", rationale: "The date is missing.", uncertainty: null },
      ],
    };
    const question = {
      ...emptyModelResult(),
      unresolvedQuestions: [{ question: "Which fields are required?", whyNeeded: "They are not listed.", relatedRequirementIds: ["FR-001"] }],
    };
    const criterion = {
      ...emptyModelResult(),
      newAcceptanceCriteria: [
        {
          text: "The upload is rejected when it is too large.",
          scope: "requirement",
          requirementIds: ["FR-001"],
          rationale: "The limit is stated.",
          uncertainty: null,
        },
      ],
    };
    expect(writingSchemaFailure(revision, emptyKnown)).toBe("revised-functional-unknown");
    expect(writingSchemaFailure(question, emptyKnown)).toBe("question-related-unknown");
    expect(writingSchemaFailure(criterion, emptyKnown)).toBe("criterion-link-unknown");
    expect(parseWritingResult(revision, emptyKnown)).toBeNull();
    expect(parseWritingResult(question, emptyKnown)).toBeNull();
    expect(parseWritingResult(criterion, emptyKnown)).toBeNull();

    const script = scriptedProvider([emptyModelResult()]);
    const outcome = await writeRequirements(source, [], script.provider, { timeoutMs: 1000, retryDelayMs: 0 });
    expect(outcome.ok).toBe(true);
    const schema = script.requests[0]?.schema as {
      properties: {
        revisedFunctionalRequirements: { maxItems: number };
        revisedAcceptanceCriteria: { maxItems: number };
        newAcceptanceCriteria: { items: { properties: { scope: { enum: string[] }; requirementIds: { maxItems: number } } } };
        unresolvedQuestions: { items: { properties: { relatedRequirementIds: { maxItems: number } } } };
      };
    };
    expect(schema.properties.revisedFunctionalRequirements.maxItems).toBe(0);
    expect(schema.properties.revisedAcceptanceCriteria.maxItems).toBe(0);
    expect(schema.properties.unresolvedQuestions.items.properties.relatedRequirementIds.maxItems).toBe(0);
    expect(schema.properties.newAcceptanceCriteria.items.properties.scope.enum).toEqual(["project"]);
    expect(schema.properties.newAcceptanceCriteria.items.properties.requirementIds.maxItems).toBe(0);
  });

  it("allows a structured revision only for an identifier that exists", async () => {
    const content: RequirementsContent = {
      mode: "structured",
      nextFunctionalNumber: 2,
      nextCriterionNumber: 2,
      functionalRequirements: [{ id: "FR-001", text: "Upload a receipt", source: "user", status: "confirmed" }],
      acceptanceCriteria: [
        { id: "AC-001", text: "The file is stored", source: "user", status: "confirmed", scope: "project", requirementIds: [] },
      ],
    };
    const structured = config({
      projectName: "Receipt Tracker",
      businessRequirements: "Users can upload a receipt.",
      requirementsContent: content,
    });
    const known = writingRequirementTexts(buildWritingInput(structured, []));
    const missing = {
      ...emptyModelResult(),
      revisedFunctionalRequirements: [
        { targetId: "FR-009", text: "Users can upload a receipt today.", rationale: "The date is missing.", uncertainty: null },
      ],
    };
    expect(writingSchemaFailure(missing, known)).toBe("revised-functional-unknown");
    expect(parseWritingResult(missing, known)).toBeNull();
    const script = scriptedProvider([
      {
        ...emptyModelResult(),
        revisedFunctionalRequirements: [
          { targetId: "FR-001", text: "Users can upload a receipt today.", rationale: "The date is missing.", uncertainty: null },
        ],
      },
    ]);
    const outcome = await writeRequirements(structured, [], script.provider, { timeoutMs: 1000, retryDelayMs: 0 });
    expect(outcome.ok).toBe(true);
    const schema = script.requests[0]?.schema as {
      properties: {
        revisedFunctionalRequirements: { items: { properties: { targetId: { enum: string[] } } } };
        revisedAcceptanceCriteria: { items: { properties: { targetId: { enum: string[] } } } };
        unresolvedQuestions: { items: { properties: { relatedRequirementIds: { items: { enum: string[] } } } } };
        newAcceptanceCriteria: { items: { anyOf: Array<{ properties: { requirementIds: { items?: { enum?: string[] } } } }> } };
      };
    };
    expect(schema.properties.revisedFunctionalRequirements.items.properties.targetId.enum).toEqual(["FR-001"]);
    expect(schema.properties.revisedAcceptanceCriteria.items.properties.targetId.enum).toEqual(["AC-001"]);
    expect(schema.properties.unresolvedQuestions.items.properties.relatedRequirementIds.items.enum).toEqual(["AC-001", "FR-001"]);
    expect(schema.properties.newAcceptanceCriteria.items.anyOf[1]?.properties.requirementIds.items?.enum).toEqual(["FR-001"]);
  });

  it("retries a retryable provider error once and reports timeout without retry", async () => {
    const calls: AnalysisCompletionRequest[] = [];
    const results: unknown[] = [new AnalysisProviderError("provider", true), emptyModelResult()];
    const provider: AnalysisProvider = {
      async complete(request) {
        calls.push(request);
        const next = results.shift();
        if (next instanceof AnalysisProviderError) throw next;
        return next;
      },
    };
    const retried = await writeRequirements(source, [], provider, { timeoutMs: 1000, retryDelayMs: 0 });
    expect(retried.ok).toBe(true);
    expect(calls).toHaveLength(2);
    const timed: AnalysisCompletionRequest[] = [];
    const timeoutProvider: AnalysisProvider = {
      async complete(request) {
        timed.push(request);
        throw new AnalysisProviderError("timeout");
      },
    };
    const timedOut = await writeRequirements(source, [], timeoutProvider, { timeoutMs: 1000, retryDelayMs: 0 });
    expect(timedOut).toEqual({ ok: false, error: "timeout" });
    expect(timed).toHaveLength(1);
  });
});

describe("writing route", () => {
  afterEach(() => {
    resetWritingRateLimit();
    resetAnalysisRateLimit();
    vi.unstubAllEnvs();
  });

  it("returns unavailable before calling a provider when writing is disabled", async () => {
    const response = await handleWritingPost(writingRequest({ config: defaultConfig, clarifications: [] }), {
      provider: null,
      allowRequest: () => true,
      timeoutMs: 1000,
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "unavailable" });
  });

  it("uses a separate request bucket from analysis", () => {
    resetAnalysisRateLimit();
    resetWritingRateLimit();
    for (let index = 0; index < 10; index += 1) expect(consumeAnalysisRateLimit(1_000 + index)).toBe(true);
    expect(consumeAnalysisRateLimit(2_000)).toBe(false);
    expect(consumeWritingRateLimit(2_000)).toBe(true);
  });

  it("does not put a forged current clarification into the provider payload", async () => {
    const source = config({ projectName: "Receipt Tracker", businessRequirements: "Users can upload a receipt." });
    let user = "";
    const provider: AnalysisProvider = {
      async complete(request) {
        user = request.user;
        return emptyModelResult();
      },
    };
    const response = await handleWritingPost(
      writingRequest({
        config: source,
        clarifications: [
          {
            requestId: 1,
            findingId: "F-001",
            question: "What is the limit?",
            answer: "10 MB",
            analysisFingerprint: "stale-fingerprint",
            current: true,
          },
        ],
      }),
      { provider, allowRequest: () => true, timeoutMs: 1000, retryDelayMs: 0 },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.excludedFindingIds).toEqual(["F-001"]);
    expect(user).not.toContain("10 MB");
    expect(writingRequirementTexts(buildWritingInput(source, [])).functional.size).toBe(0);
  });
});

describe("writing route export", () => {
  it("stays unavailable when the provider is not configured", async () => {
    vi.stubEnv("AI_REVIEW_ENABLED", "false");
    const response = await POST(writingRequest({ config: defaultConfig, clarifications: [] }));
    expect(response.status).toBe(503);
    expect(createAnalysisProvider({ AI_REVIEW_ENABLED: "false" })).toBeNull();
  });
});

function writingRequest(body: unknown): Request {
  return new Request("http://localhost/api/ai-write", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
