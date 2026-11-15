// @vitest-environment happy-dom
import { StrictMode, useEffect } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readAnalysisResult } from "../lib/ai/analysis-schema";
import { parseReviewSession } from "../lib/ai/review";
import {
  detachNestedCriteria,
  editNestedCriterionText,
  editSuggestionText,
  parseStoredWritingSession,
  type WritingSession,
} from "../lib/ai/writing-suggestions";
import { defaultConfig, type ProjectConfig } from "../lib/config";
import { DOWNLOAD_COUNT_STORAGE_KEY } from "../lib/download-filename";
import {
  DRAFT_RECOVERY_MAX_BYTES,
  DRAFT_RECOVERY_STORAGE_KEY,
  DRAFT_SAVE_DELAY_MS,
  clearDraftRecovery,
  createDraftPersistence,
  loadDraftRecovery,
  readDraftRecovery,
  saveDraftRecovery,
  type DraftRecovery,
  type DraftTimer,
} from "../lib/draft-recovery";
import { beginStructuredRequirements, defaultRequirementsContent, addFunctionalRequirement } from "../lib/requirements-content";
import { normalizeSelections } from "../lib/selection-rules";
import { defaultToolchain } from "../lib/toolchain";
import { useDraftRecovery } from "../lib/use-draft-recovery";

class MemoryStorage implements Storage {
  readonly items = new Map<string, string>();
  readonly removed: string[] = [];
  writes = 0;
  failWrites = false;

  get length() {
    return this.items.size;
  }

  clear() {
    this.items.clear();
  }

  getItem(key: string) {
    return this.items.get(key) ?? null;
  }

  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.removed.push(key);
    this.items.delete(key);
  }

  setItem(key: string, value: string) {
    if (this.failWrites && key === DRAFT_RECOVERY_STORAGE_KEY) throw new Error("quota");
    this.writes += 1;
    this.items.set(key, value);
  }
}

function manualTimer() {
  let nextId = 1;
  const pending = new Map<number, () => void>();
  const delays: number[] = [];
  const timer: DraftTimer = {
    schedule(callback, delayMs) {
      const id = nextId;
      nextId += 1;
      delays.push(delayMs);
      pending.set(id, callback);
      return id;
    },
    cancel(handle) {
      if (typeof handle === "number") pending.delete(handle);
    },
  };
  return {
    timer,
    delays,
    fire() {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback();
    },
  };
}

function projectConfig(projectName = "Receipt Tracker"): ProjectConfig {
  const empty = beginStructuredRequirements(defaultRequirementsContent(), "empty", "", "");
  const requirementsContent = addFunctionalRequirement(empty, "Show the people list.", {
    source: "user",
    status: "proposed",
  });
  return normalizeSelections({
    ...defaultConfig,
    projectName,
    description: "Track receipts.",
    businessRequirements: "Users can upload a receipt.",
    appType: "web-app",
    uiLanguages: [defaultToolchain("typescript")],
    requirementsContent,
  });
}

function analysisResult() {
  const result = readAnalysisResult({
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
  });
  if (!result) throw new Error("Expected a valid analysis result.");
  return result;
}

function reviewSession() {
  const session = parseReviewSession({
    requestId: 4,
    fingerprint: "run-fingerprint",
    records: {
      "4:F-001": {
        decision: "addressed",
        answer: "  Name and role.\n",
        answerCheckedFingerprint: "run-fingerprint",
        applied: { kind: "functional", id: "FR-002" },
      },
    },
  });
  if (!session) throw new Error("Expected a valid review session.");
  return session;
}

function parentSuggestion(id: string, text: string): WritingSession["suggestions"][number] {
  return {
    id,
    kind: "new-functional",
    text,
    rationale: "Needed.",
    uncertainty: null,
    nestedCriteria: [{ text: "The same criterion text.", rationale: "Shared rationale." }],
  };
}

function pendingParentSession(): WritingSession {
  return {
    requestId: 3,
    origin: "structured",
    sourceFingerprint: "source-fingerprint",
    writingFingerprint: "writing-fingerprint",
    suggestions: [
      {
        id: "W-001",
        kind: "new-functional",
        text: "Show the receipt total.",
        rationale: "The total is missing.",
        uncertainty: null,
        nestedCriteria: [{ text: "The total is visible.", rationale: "Confirms the total." }],
      },
    ],
    dismissedIds: [],
    acceptedIds: [],
    nextSuggestionNumber: 2,
    includedClarifications: [
      { requestId: 4, findingId: "F-001", question: "What is the maximum file size?", answer: "  Name and role.\n" },
    ],
  };
}

function detachedSession(): WritingSession {
  const edited = editNestedCriterionText(pendingParentSession(), "W-001", 0, "The total is visible.\n");
  const detached = detachNestedCriteria(edited, "W-001", "FR-004");
  if (!detached) throw new Error("Expected nested criteria to detach.");
  return detached;
}

function recoveryDocument(writing: WritingSession | null = detachedSession()): DraftRecovery {
  return {
    version: 1,
    config: projectConfig(),
    output: {
      markdown: "Manual note  \n",
      assembled: { config: projectConfig("Receipt Tracker snapshot"), markdown: "Generated draft\n" },
    },
    analysis: {
      requestId: 4,
      fingerprint: "run-fingerprint",
      result: analysisResult(),
      session: reviewSession(),
      privacyAcknowledged: true,
    },
    writing,
  };
}

function storeRaw(storage: MemoryStorage, value: unknown) {
  storage.setItem(DRAFT_RECOVERY_STORAGE_KEY, JSON.stringify(value));
  storage.writes = 0;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("draft recovery validation", () => {
  it("round-trips configuration, the edited draft, review state, and a detached writing session", () => {
    const storage = new MemoryStorage();
    storage.setItem(DOWNLOAD_COUNT_STORAGE_KEY, "4");
    const draft = recoveryDocument();
    expect(saveDraftRecovery(storage, draft)).toEqual({ status: "saved" });

    const loaded = loadDraftRecovery(storage);
    expect(loaded.status).toBe("restored");
    if (loaded.status !== "restored") return;
    expect(loaded.draft.config.projectName).toBe("Receipt Tracker");
    expect(loaded.draft.config.uiLanguages).toEqual([defaultToolchain("typescript")]);
    expect(loaded.draft.config.requirementsContent?.functionalRequirements[0]).toMatchObject({
      id: "FR-001",
      text: "Show the people list.",
      status: "proposed",
    });
    expect(loaded.draft.output.markdown).toBe("Manual note  \n");
    expect(loaded.draft.output.assembled?.config.projectName).toBe("Receipt Tracker snapshot");
    expect(loaded.draft.output.assembled?.markdown).toBe("Generated draft\n");
    expect(loaded.draft.analysis?.session.records["4:F-001"]).toEqual({
      decision: "addressed",
      answer: "  Name and role.\n",
      answerCheckedFingerprint: "run-fingerprint",
      applied: { kind: "functional", id: "FR-002" },
    });
    expect(loaded.draft.analysis?.privacyAcknowledged).toBe(true);
    expect(loaded.draft.writing?.acceptedIds).toEqual(["W-001"]);
    expect(loaded.draft.writing?.suggestions.find((item) => item.id === "W-002")).toMatchObject({
      kind: "new-criterion",
      text: "The total is visible.\n",
      requirementIds: ["FR-004"],
    });
    expect(loaded.draft.writing?.acceptedIds).not.toContain("W-002");
    expect(storage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("4");
  });

  it("keeps a valid configuration when the generated output cannot be read", () => {
    const storage = new MemoryStorage();
    storage.setItem(DOWNLOAD_COUNT_STORAGE_KEY, "2");
    storeRaw(storage, {
      version: 1,
      config: projectConfig(),
      output: { markdown: 12, assembled: { config: "not-a-config", markdown: "Generated draft\n" } },
      analysis: recoveryDocument().analysis,
      writing: detachedSession(),
    });

    const loaded = loadDraftRecovery(storage);
    expect(loaded.status).toBe("restored");
    if (loaded.status !== "restored") return;
    expect(loaded.draft.config.projectName).toBe("Receipt Tracker");
    expect(loaded.draft.config.requirementsContent?.functionalRequirements[0]?.status).toBe("proposed");
    expect(loaded.draft.output).toEqual({ markdown: "", assembled: null });
    expect(loaded.draft.analysis?.requestId).toBe(4);
    expect(loaded.draft.writing?.acceptedIds).toEqual(["W-001"]);
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Receipt Tracker");
    expect(storage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("2");
    expect(storage.removed).not.toContain(DOWNLOAD_COUNT_STORAGE_KEY);
  });

  it("rejects a version 1 envelope that is missing a required key or has an unknown key", () => {
    const storage = new MemoryStorage();
    storage.setItem(DOWNLOAD_COUNT_STORAGE_KEY, "6");
    const valid = recoveryDocument();
    storeRaw(storage, { ...valid, approved: true });
    expect(loadDraftRecovery(storage)).toEqual({ status: "empty" });
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toBeNull();

    const withoutWriting = {
      version: valid.version,
      config: valid.config,
      output: valid.output,
      analysis: valid.analysis,
    };
    expect(readDraftRecovery(withoutWriting)).toBeNull();
    storeRaw(storage, withoutWriting);
    expect(loadDraftRecovery(storage)).toEqual({ status: "empty" });
    expect(storage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("6");
  });

  it("keeps the markdown when only the assembled snapshot is malformed", () => {
    const loaded = readDraftRecovery({
      version: 1,
      config: projectConfig(),
      output: { markdown: "Manual note  \n", assembled: { markdown: "Generated draft\n" } as DraftRecovery["output"]["assembled"] },
      analysis: null,
      writing: null,
    });
    expect(loaded?.output).toEqual({ markdown: "Manual note  \n", assembled: null });
    expect(loaded?.config.projectName).toBe("Receipt Tracker");
  });

  it("drops an invalid analysis or writing slice without dropping the other slices", () => {
    const valid = recoveryDocument();
    const mismatched = readDraftRecovery({
      ...valid,
      analysis: { ...valid.analysis, fingerprint: "other-fingerprint" },
      writing: { accepted: true },
    });
    expect(mismatched?.config.projectName).toBe("Receipt Tracker");
    expect(mismatched?.output.markdown).toBe("Manual note  \n");
    expect(mismatched?.analysis).toBeNull();
    expect(mismatched?.writing).toBeNull();

    const swapped = readDraftRecovery({
      ...valid,
      analysis: { findings: [] },
      writing: detachedSession(),
    });
    expect(swapped?.analysis).toBeNull();
    expect(swapped?.writing?.suggestions).toHaveLength(2);
  });

  it("removes an unreadable document and leaves the download counter", () => {
    const storage = new MemoryStorage();
    storage.setItem(DOWNLOAD_COUNT_STORAGE_KEY, "5");
    storage.setItem(DRAFT_RECOVERY_STORAGE_KEY, "{");
    expect(loadDraftRecovery(storage)).toEqual({ status: "empty" });
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toBeNull();
    expect(storage.removed).toEqual([DRAFT_RECOVERY_STORAGE_KEY]);
    expect(storage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("5");

    storeRaw(storage, { version: 2, config: projectConfig() });
    expect(loadDraftRecovery(storage)).toEqual({ status: "empty" });
    storeRaw(storage, { version: 1, config: { projectName: 5 } });
    expect(loadDraftRecovery(storage)).toEqual({ status: "empty" });
    storage.setItem(DRAFT_RECOVERY_STORAGE_KEY, "x".repeat(DRAFT_RECOVERY_MAX_BYTES + 1));
    expect(loadDraftRecovery(storage)).toEqual({ status: "empty" });
    expect(storage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("5");
  });

  it("keeps working when storage reads, writes, or deletes throw", () => {
    const reading = new MemoryStorage();
    reading.getItem = () => {
      throw new Error("blocked");
    };
    expect(loadDraftRecovery(reading)).toEqual({ status: "unavailable" });

    const writing = new MemoryStorage();
    storeRaw(writing, recoveryDocument());
    writing.failWrites = true;
    expect(saveDraftRecovery(writing, recoveryDocument(null))).toEqual({ status: "unavailable" });
    expect(loadDraftRecovery(writing).status).toBe("restored");

    const removing = new MemoryStorage();
    removing.removeItem = () => {
      throw new Error("blocked");
    };
    expect(clearDraftRecovery(removing)).toBe("unavailable");
    removing.setItem(DRAFT_RECOVERY_STORAGE_KEY, "{");
    expect(loadDraftRecovery(removing)).toEqual({ status: "empty" });
  });
});

describe("stored writing relationships", () => {
  it("preserves a pending parent and does not detach or accept its nested criteria", () => {
    const session = parseStoredWritingSession(pendingParentSession());
    expect(session?.acceptedIds).toEqual([]);
    expect(session?.suggestions).toHaveLength(1);
    expect(session?.suggestions[0]).toMatchObject({ kind: "new-functional" });
  });

  it("preserves an accepted parent only when each nested criterion already exists on its own", () => {
    const session = parseStoredWritingSession(detachedSession());
    expect(session?.acceptedIds).toEqual(["W-001"]);
    expect(session?.suggestions[0]).toMatchObject({ detachedIds: ["W-002"] });
    const criterion = session?.suggestions.find((item) => item.id === "W-002");
    expect(criterion).toMatchObject({ kind: "new-criterion", text: "The total is visible.\n" });
    expect(session?.acceptedIds).not.toContain("W-002");
    expect(session?.dismissedIds).toEqual([]);
  });

  it("keeps an edited detached criterion pending and does not mix identical text from another parent", () => {
    const session: WritingSession = {
      requestId: 3,
      origin: "structured",
      sourceFingerprint: "source-fingerprint",
      writingFingerprint: "writing-fingerprint",
      suggestions: [parentSuggestion("W-001", "First parent."), parentSuggestion("W-002", "Second parent.")],
      dismissedIds: [],
      acceptedIds: [],
      nextSuggestionNumber: 3,
      includedClarifications: [],
    };
    const first = detachNestedCriteria(session, "W-001", "FR-010");
    const second = first ? detachNestedCriteria(first, "W-002", "FR-011") : null;
    if (!second) throw new Error("Expected both parents to detach.");
    const edited = editSuggestionText(second, "W-003", "Edited criterion.");
    const parsed = parseStoredWritingSession(edited);
    expect(parsed?.acceptedIds).toEqual(["W-001", "W-002"]);
    expect(parsed?.suggestions.find((item) => item.id === "W-001")).toMatchObject({ detachedIds: ["W-003"] });
    expect(parsed?.suggestions.find((item) => item.id === "W-002")).toMatchObject({ detachedIds: ["W-004"] });
    expect(parsed?.suggestions.find((item) => item.id === "W-003")).toMatchObject({ text: "Edited criterion." });
    expect(parsed?.suggestions.find((item) => item.id === "W-004")).toMatchObject({ text: "The same criterion text." });
    expect(parsed?.acceptedIds).not.toContain("W-003");
    expect(parsed?.acceptedIds).not.toContain("W-004");
    expect(parsed?.dismissedIds).toEqual([]);
    const withDecision = parseStoredWritingSession({ ...edited, dismissedIds: ["W-003"] });
    expect(withDecision?.dismissedIds).toEqual(["W-003"]);
    expect(withDecision?.acceptedIds).toEqual(["W-001", "W-002"]);
    expect(withDecision?.suggestions.find((item) => item.id === "W-003")).toMatchObject({ text: "Edited criterion." });
    expect(withDecision?.acceptedIds).not.toContain("W-004");

    const shared = structuredClone(edited);
    const parents = shared.suggestions.filter((item) => item.kind === "new-functional");
    for (const parent of parents) {
      if (parent.kind === "new-functional") parent.detachedIds = ["W-003"];
    }
    expect(parseStoredWritingSession(shared)).toBeNull();
  });

  it("rejects an accepted parent whose nested criteria were not detached", () => {
    const inconsistent = pendingParentSession();
    inconsistent.acceptedIds = ["W-001"];
    expect(parseStoredWritingSession(inconsistent)).toBeNull();
    const loaded = readDraftRecovery({ ...recoveryDocument(null), writing: inconsistent });
    expect(loaded?.writing).toBeNull();
    expect(loaded?.config.requirementsContent?.functionalRequirements[0]?.status).toBe("proposed");
  });

  it("rejects overlapping, unknown, question, or colliding suggestion decisions", () => {
    const session = detachedSession();
    session.suggestions.push({
      id: "W-003",
      kind: "question",
      question: "Which total?",
      whyNeeded: "The source is ambiguous.",
      relatedRequirementIds: ["FR-001"],
    });
    session.nextSuggestionNumber = 4;
    expect(parseStoredWritingSession({ ...session, dismissedIds: ["W-003"] })).toBeNull();
    expect(parseStoredWritingSession({ ...session, acceptedIds: ["W-001", "W-002"], dismissedIds: ["W-002"] })).toBeNull();
    expect(parseStoredWritingSession({ ...session, acceptedIds: ["W-001", "W-009"] })).toBeNull();
    expect(parseStoredWritingSession({ ...session, nextSuggestionNumber: 2 })).toBeNull();
    expect(parseStoredWritingSession({ ...session, approved: true })).toBeNull();
  });

  it("keeps a dismissed parent pending its nested criteria instead of promoting them", () => {
    const session = pendingParentSession();
    session.dismissedIds = ["W-001"];
    const parsed = parseStoredWritingSession(session);
    expect(parsed?.dismissedIds).toEqual(["W-001"]);
    expect(parsed?.acceptedIds).toEqual([]);
    expect(parsed?.suggestions).toHaveLength(1);
  });

  it("does not persist an inconsistent writing slice into a valid configuration", () => {
    const storage = new MemoryStorage();
    const inconsistent = pendingParentSession();
    inconsistent.acceptedIds = ["W-001"];
    expect(saveDraftRecovery(storage, recoveryDocument(inconsistent))).toEqual({ status: "partial", omitted: ["writing"] });
    const loaded = loadDraftRecovery(storage);
    expect(loaded.status).toBe("restored");
    if (loaded.status !== "restored") return;
    expect(loaded.draft.writing).toBeNull();
    expect(loaded.draft.config.projectName).toBe("Receipt Tracker");
  });
});

describe("delayed persistence and reset", () => {
  it("does not serialize a scheduled draft until the delay elapses or flush runs", () => {
    const storage = new MemoryStorage();
    storeRaw(storage, recoveryDocument());
    const clock = manualTimer();
    const persistence = createDraftPersistence({ timer: clock.timer });
    expect(persistence.acceptsGeneration(persistence.generation())).toBe(false);
    const ignored = recoveryDocument(null);
    ignored.config = projectConfig("Ignored before restore");
    persistence.schedule(storage, ignored, persistence.generation());
    persistence.restore(storage);
    expect(persistence.flush(storage)).toBe("idle");
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).not.toContain("Ignored before restore");

    const stringify = vi.spyOn(JSON, "stringify");
    const first = recoveryDocument(null);
    first.config = projectConfig("First edit");
    const second = recoveryDocument(null);
    second.config = projectConfig("Second edit");
    persistence.schedule(storage, first, persistence.generation());
    persistence.schedule(storage, second, persistence.generation());
    expect(stringify).not.toHaveBeenCalled();
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).not.toContain("Second edit");
    expect(clock.delays).toEqual([DRAFT_SAVE_DELAY_MS, DRAFT_SAVE_DELAY_MS]);

    clock.fire();
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Second edit");
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).not.toContain("First edit");
    expect(storage.writes).toBe(1);
  });

  it("flushes the newest pending draft once and does not let the timer write it again", () => {
    const storage = new MemoryStorage();
    const clock = manualTimer();
    const persistence = createDraftPersistence({ timer: clock.timer });
    persistence.restore(storage);
    const draft = recoveryDocument(null);
    draft.config = projectConfig("Flushed edit");
    persistence.schedule(storage, draft, persistence.generation());
    expect(persistence.flush(storage)).toEqual({ status: "saved" });
    clock.fire();
    expect(storage.writes).toBe(1);
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Flushed edit");
  });

  it("cancels a pending write on reset and ignores a stale generation", () => {
    const storage = new MemoryStorage();
    storage.setItem(DOWNLOAD_COUNT_STORAGE_KEY, "7");
    storeRaw(storage, recoveryDocument());
    const clock = manualTimer();
    const persistence = createDraftPersistence({ timer: clock.timer });
    persistence.restore(storage);
    const generation = persistence.generation();
    const replacement = recoveryDocument(null);
    replacement.config = projectConfig("Should not return");
    persistence.schedule(storage, replacement, generation);
    expect(persistence.reset(storage)).toEqual({ generation: generation + 1, storage: "cleared" });
    clock.fire();
    persistence.schedule(storage, replacement, generation);
    persistence.flush(storage);
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toBeNull();
    expect(persistence.acceptsGeneration(generation)).toBe(false);
    expect(persistence.acceptsGeneration(generation + 1)).toBe(true);
    expect(storage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("7");
    expect(storage.removed).not.toContain(DOWNLOAD_COUNT_STORAGE_KEY);

    const fresh = recoveryDocument(null);
    fresh.config = projectConfig("After reset");
    persistence.schedule(storage, fresh, generation + 1);
    clock.fire();
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("After reset");
  });

  it("keeps the previous document when a flush hits quota and retries after storage recovers", () => {
    const storage = new MemoryStorage();
    storeRaw(storage, recoveryDocument());
    const clock = manualTimer();
    const persistence = createDraftPersistence({ timer: clock.timer });
    persistence.restore(storage);
    const next = recoveryDocument(null);
    next.config = projectConfig("Quota edit");
    persistence.schedule(storage, next, persistence.generation());
    storage.failWrites = true;
    expect(persistence.flush(storage)).toEqual({ status: "unavailable" });
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Receipt Tracker");
    storage.failWrites = false;
    expect(persistence.flush(storage)).toEqual({ status: "saved" });
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Quota edit");
  });

  it("does not let a later restore replace a scheduled draft with the older stored snapshot", () => {
    const storage = new MemoryStorage();
    storeRaw(storage, recoveryDocument());
    const clock = manualTimer();
    const persistence = createDraftPersistence({ timer: clock.timer });
    persistence.restore(storage);
    const newer = recoveryDocument(null);
    newer.config = projectConfig("Newer edit");
    persistence.schedule(storage, newer, persistence.generation());
    persistence.restore(storage);
    expect(persistence.getSnapshot().draft?.config.projectName).toBe("Newer edit");
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).not.toContain("Newer edit");
    expect(storage.writes).toBe(0);
  });

  it("reports a failed draft delete and does not write the cancelled draft", () => {
    const storage = new MemoryStorage();
    storage.setItem(DOWNLOAD_COUNT_STORAGE_KEY, "8");
    storeRaw(storage, recoveryDocument());
    storage.removeItem = () => {
      throw new Error("blocked");
    };
    const clock = manualTimer();
    const persistence = createDraftPersistence({ timer: clock.timer });
    persistence.restore(storage);
    const generation = persistence.generation();
    const pending = recoveryDocument(null);
    pending.config = projectConfig("Pending reset edit");
    persistence.schedule(storage, pending, generation);
    expect(persistence.reset(storage)).toEqual({ generation: generation + 1, storage: "unavailable" });
    clock.fire();
    persistence.schedule(storage, pending, generation);
    persistence.flush(storage);
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Receipt Tracker");
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).not.toContain("Pending reset edit");
    expect(storage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("8");
    expect(persistence.acceptsGeneration(generation)).toBe(false);
  });

  it("reports partial saves and leaves storage unchanged when a save fails", () => {
    const storage = new MemoryStorage();
    storeRaw(storage, recoveryDocument());
    const malformed = recoveryDocument(null);
    malformed.output = {
      markdown: "Keep me\n",
      assembled: { markdown: "Generated draft\n" } as DraftRecovery["output"]["assembled"],
    };
    malformed.analysis = { ...malformed.analysis!, fingerprint: "other-fingerprint" };
    expect(saveDraftRecovery(storage, malformed)).toEqual({ status: "partial", omitted: ["output", "analysis"] });
    const loaded = loadDraftRecovery(storage);
    expect(loaded.status).toBe("restored");
    if (loaded.status !== "restored") return;
    expect(loaded.draft.config.projectName).toBe("Receipt Tracker");
    expect(loaded.draft.output).toEqual({ markdown: "Keep me\n", assembled: null });
    expect(loaded.draft.analysis).toBeNull();
    expect(loaded.draft.writing).toBeNull();

    const invalid = { ...recoveryDocument(), approved: true } as DraftRecovery;
    const writes = storage.writes;
    expect(saveDraftRecovery(storage, invalid)).toEqual({ status: "unavailable" });
    expect(storage.writes).toBe(writes);
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Keep me\\n");
  });
});

type RecoveryApi = ReturnType<typeof useDraftRecovery>;
type ApiHandle = { current: RecoveryApi | null };

function Harness({
  storage,
  timer,
  apiRef,
}: {
  storage: Storage | null;
  timer: DraftTimer;
  apiRef: ApiHandle;
}) {
  const api = useDraftRecovery(storage, { timer });
  useEffect(() => {
    apiRef.current = api;
  });
  return <p>{api.ready ? (api.draft?.config.projectName ?? "empty") : "loading"}</p>;
}

describe("react restoration order", () => {
  it("restores under Strict Mode before any draft write", () => {
    const storage = new MemoryStorage();
    storeRaw(storage, recoveryDocument());
    const clock = manualTimer();
    const apiRef: ApiHandle = { current: null };
    render(
      <StrictMode>
        <Harness storage={storage} timer={clock.timer} apiRef={apiRef} />
      </StrictMode>,
    );

    expect(screen.getByText("Receipt Tracker")).toBeTruthy();
    expect(storage.writes).toBe(0);
    expect(apiRef.current?.ready).toBe(true);
    expect(apiRef.current?.acceptsGeneration(0)).toBe(false);
    expect(apiRef.current?.acceptsGeneration(apiRef.current.generation)).toBe(true);
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Receipt Tracker");
  });

  it("flushes a pending edit on page lifecycle events and on unmount", () => {
    const storage = new MemoryStorage();
    storeRaw(storage, recoveryDocument());
    const clock = manualTimer();
    const apiRef: ApiHandle = { current: null };
    const view = render(<Harness storage={storage} timer={clock.timer} apiRef={apiRef} />);
    const generation = apiRef.current?.generation ?? 0;
    const edited = recoveryDocument(null);
    edited.config = projectConfig("Lifecycle edit");
    apiRef.current?.schedule(edited, generation);
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Receipt Tracker");

    window.dispatchEvent(new Event("pagehide"));
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Lifecycle edit");
    const writesAfterHide = storage.writes;

    const hidden = recoveryDocument(null);
    hidden.config = projectConfig("Hidden edit");
    apiRef.current?.schedule(hidden, generation);
    const visibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    if (visibility) Object.defineProperty(document, "visibilityState", visibility);
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Hidden edit");

    const leaving = recoveryDocument(null);
    leaving.config = projectConfig("Leaving edit");
    apiRef.current?.schedule(leaving, generation);
    window.dispatchEvent(new Event("beforeunload"));
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Leaving edit");
    clock.fire();
    expect(storage.writes).toBe(writesAfterHide + 2);

    const unmounted = recoveryDocument(null);
    unmounted.config = projectConfig("Unmount edit");
    apiRef.current?.schedule(unmounted, generation);
    view.unmount();
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Unmount edit");
  });

  it("ignores a stale child callback after reset and does not restore the old project", () => {
    const storage = new MemoryStorage();
    storage.setItem(DOWNLOAD_COUNT_STORAGE_KEY, "3");
    storeRaw(storage, recoveryDocument());
    const clock = manualTimer();
    const apiRef: ApiHandle = { current: null };
    render(
      <StrictMode>
        <Harness storage={storage} timer={clock.timer} apiRef={apiRef} />
      </StrictMode>,
    );
    const generation = apiRef.current?.generation ?? 0;
    const stale = recoveryDocument(null);
    stale.config = projectConfig("Stale child");
    apiRef.current?.schedule(stale, generation);
    act(() => {
      apiRef.current?.reset();
      apiRef.current?.schedule(stale, generation);
    });
    clock.fire();
    window.dispatchEvent(new Event("pagehide"));

    expect(screen.getByText("empty")).toBeTruthy();
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("3");
    expect(apiRef.current?.acceptsGeneration(generation)).toBe(false);
  });

  it("keeps a scheduled draft visible when storage still holds the older snapshot", () => {
    const storage = new MemoryStorage();
    storeRaw(storage, recoveryDocument());
    const clock = manualTimer();
    const apiRef: ApiHandle = { current: null };
    render(
      <StrictMode>
        <Harness storage={storage} timer={clock.timer} apiRef={apiRef} />
      </StrictMode>,
    );
    const newer = recoveryDocument(null);
    newer.config = projectConfig("Newer edit");
    act(() => {
      apiRef.current?.schedule(newer, apiRef.current.generation);
    });
    expect(screen.getByText("Newer edit")).toBeTruthy();
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).not.toContain("Newer edit");
    expect(storage.writes).toBe(0);
  });

  it("reports a failed persistent reset from the hook without clearing the download counter", () => {
    const storage = new MemoryStorage();
    storage.setItem(DOWNLOAD_COUNT_STORAGE_KEY, "9");
    storeRaw(storage, recoveryDocument());
    const apiRef: ApiHandle = { current: null };
    render(<Harness storage={storage} timer={manualTimer().timer} apiRef={apiRef} />);
    storage.removeItem = () => {
      throw new Error("blocked");
    };
    let result: ReturnType<RecoveryApi["reset"]> | undefined;
    act(() => {
      result = apiRef.current?.reset();
    });
    expect(result).toEqual({ generation: 2, storage: "unavailable" });
    expect(screen.getByText("empty")).toBeTruthy();
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Receipt Tracker");
    expect(storage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("9");
  });

  it("renders an empty ready draft when storage is unavailable", () => {
    const apiRef: ApiHandle = { current: null };
    render(<Harness storage={null} timer={manualTimer().timer} apiRef={apiRef} />);
    expect(screen.getByText("empty")).toBeTruthy();
    expect(apiRef.current?.draft).toBeNull();
  });
});
