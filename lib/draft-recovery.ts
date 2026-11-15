import { readAnalysisResult, type AnalysisResult } from "./ai/analysis-schema";
import { parseReviewSession, type ReviewSession } from "./ai/review";
import { parseStoredWritingSession, type WritingSession } from "./ai/writing-suggestions";
import type { ProjectConfig } from "./config";
import { parseStoredProjectConfig } from "./config-file";

export const DRAFT_RECOVERY_STORAGE_KEY = "requirements-builder.draft";
export const DRAFT_RECOVERY_VERSION = 1;
export const DRAFT_RECOVERY_MAX_BYTES = 1_500_000;
export const DRAFT_SAVE_DELAY_MS = 400;

export type DraftRecovery = {
  version: typeof DRAFT_RECOVERY_VERSION;
  config: ProjectConfig;
  output: {
    markdown: string;
    assembled: { config: ProjectConfig; markdown: string } | null;
  };
  analysis: {
    requestId: number;
    fingerprint: string;
    result: AnalysisResult;
    session: ReviewSession;
    privacyAcknowledged: boolean;
  } | null;
  writing: WritingSession | null;
};

export type LoadDraftResult =
  | { status: "restored"; draft: DraftRecovery }
  | { status: "empty" }
  | { status: "unavailable" };

export type RecoverySlice = "output" | "analysis" | "writing";

export type SaveDraftResult =
  | { status: "saved" }
  | { status: "partial"; omitted: RecoverySlice[] }
  | { status: "unavailable" };

export type ResetResult = {
  generation: number;
  storage: "cleared" | "unavailable";
};

export type DraftTimer = {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
};

export type RecoveryView = {
  ready: boolean;
  generation: number;
  draft: DraftRecovery | null;
};

export type DraftPersistence = {
  generation(): number;
  restore(storage: Storage): LoadDraftResult;
  schedule(storage: Storage, draft: DraftRecovery, generation: number): void;
  flush(storage: Storage): SaveDraftResult | "idle";
  reset(storage: Storage | null): ResetResult;
  acceptsGeneration(generation: number): boolean;
  subscribe(listener: () => void): () => void;
  getSnapshot(): RecoveryView;
  getServerSnapshot(): RecoveryView;
};

const SERVER_VIEW: RecoveryView = { ready: false, generation: 0, draft: null };
const ENVELOPE_KEYS = ["version", "config", "output", "analysis", "writing"] as const;

const browserTimer: DraftTimer = {
  schedule(callback, delayMs) {
    return setTimeout(callback, delayMs);
  },
  cancel(handle) {
    if (typeof handle === "number") clearTimeout(handle);
  },
};

export function readDraftRecovery(value: unknown): DraftRecovery | null {
  if (!isRecord(value) || !sameKeys(value, ENVELOPE_KEYS) || value.version !== DRAFT_RECOVERY_VERSION) return null;
  const config = parseStoredProjectConfig(value.config);
  if (!config) return null;
  return {
    version: DRAFT_RECOVERY_VERSION,
    config,
    output: readOutput(value.output),
    analysis: readAnalysis(value.analysis),
    writing: readWriting(value.writing),
  };
}

export function loadDraftRecovery(storage: Storage): LoadDraftResult {
  let raw: string | null;
  try {
    raw = storage.getItem(DRAFT_RECOVERY_STORAGE_KEY);
  } catch {
    return { status: "unavailable" };
  }
  if (raw === null) return { status: "empty" };
  if (byteLength(raw) > DRAFT_RECOVERY_MAX_BYTES) {
    removeDraftKey(storage);
    return { status: "empty" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    removeDraftKey(storage);
    return { status: "empty" };
  }
  const draft = readDraftRecovery(parsed);
  if (!draft) {
    removeDraftKey(storage);
    return { status: "empty" };
  }
  return { status: "restored", draft };
}

export function saveDraftRecovery(storage: Storage, draft: DraftRecovery): SaveDraftResult {
  const validated = readDraftRecovery(draft);
  if (!validated) return { status: "unavailable" };
  const omitted = omittedSlices(draft, validated);
  let text: string;
  try {
    text = JSON.stringify(validated);
  } catch {
    return { status: "unavailable" };
  }
  if (byteLength(text) > DRAFT_RECOVERY_MAX_BYTES) return { status: "unavailable" };
  try {
    storage.setItem(DRAFT_RECOVERY_STORAGE_KEY, text);
  } catch {
    return { status: "unavailable" };
  }
  if (omitted.length > 0) return { status: "partial", omitted };
  return { status: "saved" };
}

export function clearDraftRecovery(storage: Storage): "cleared" | "unavailable" {
  try {
    storage.removeItem(DRAFT_RECOVERY_STORAGE_KEY);
    return "cleared";
  } catch {
    return "unavailable";
  }
}

export function createDraftPersistence(options?: { delayMs?: number; timer?: DraftTimer }): DraftPersistence {
  const delayMs = options?.delayMs ?? DRAFT_SAVE_DELAY_MS;
  const timer = options?.timer ?? browserTimer;
  let generation = 1;
  let ready = false;
  let writeToken = 0;
  let timerHandle: unknown = null;
  let pendingDraft: DraftRecovery | null = null;
  let pendingGeneration = 0;
  let view: RecoveryView = SERVER_VIEW;
  const listeners = new Set<() => void>();

  function publish(next: RecoveryView) {
    view = next;
    for (const listener of listeners) listener();
  }

  function cancelTimer() {
    if (timerHandle === null) return;
    timer.cancel(timerHandle);
    timerHandle = null;
  }

  function commit(storage: Storage): SaveDraftResult | "idle" {
    if (!ready || pendingDraft === null || pendingGeneration !== generation) return "idle";
    const result = saveDraftRecovery(storage, pendingDraft);
    // Quota and size failures stay pending. An invalid document cannot succeed on a later flush.
    if (result.status !== "unavailable" || readDraftRecovery(pendingDraft) === null) pendingDraft = null;
    return result;
  }

  return {
    generation() {
      return generation;
    },
    restore(storage) {
      ready = true;
      const loaded = loadDraftRecovery(storage);
      if (pendingDraft !== null && pendingGeneration === generation) return loaded;
      publish({
        ready: true,
        generation,
        draft: loaded.status === "restored" ? loaded.draft : null,
      });
      return loaded;
    },
    schedule(storage, draft, requestedGeneration) {
      if (!ready || requestedGeneration !== generation) return;
      pendingDraft = draft;
      pendingGeneration = requestedGeneration;
      publish({ ready: true, generation, draft });
      writeToken += 1;
      const token = writeToken;
      cancelTimer();
      timerHandle = timer.schedule(() => {
        if (token !== writeToken) return;
        commit(storage);
      }, delayMs);
    },
    flush(storage) {
      writeToken += 1;
      cancelTimer();
      return commit(storage);
    },
    reset(storage) {
      writeToken += 1;
      cancelTimer();
      pendingDraft = null;
      pendingGeneration = 0;
      generation += 1;
      const cleared = storage ? clearDraftRecovery(storage) : "unavailable";
      publish({ ready: true, generation, draft: null });
      return { generation, storage: cleared === "cleared" ? "cleared" : "unavailable" };
    },
    acceptsGeneration(requestedGeneration) {
      return ready && requestedGeneration === generation;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return view;
    },
    getServerSnapshot() {
      return SERVER_VIEW;
    },
  };
}

function omittedSlices(draft: DraftRecovery, validated: DraftRecovery): RecoverySlice[] {
  const omitted: RecoverySlice[] = [];
  if (!outputPreserved(draft.output, validated.output)) omitted.push("output");
  if (draft.analysis !== null && validated.analysis === null) omitted.push("analysis");
  if (draft.writing !== null && validated.writing === null) omitted.push("writing");
  return omitted;
}

function outputPreserved(input: DraftRecovery["output"], validated: DraftRecovery["output"]): boolean {
  if (!isRecord(input) || typeof input.markdown !== "string" || input.markdown !== validated.markdown) return false;
  if (input.assembled == null) return validated.assembled == null;
  if (!isRecord(input.assembled) || validated.assembled == null || input.assembled.markdown !== validated.assembled.markdown) {
    return false;
  }
  const config = parseStoredProjectConfig(input.assembled.config);
  return config !== null && JSON.stringify(config) === JSON.stringify(validated.assembled.config);
}

function readOutput(value: unknown): DraftRecovery["output"] {
  if (!isRecord(value)) return { markdown: "", assembled: null };
  return {
    markdown: typeof value.markdown === "string" ? value.markdown : "",
    assembled: readAssembled(value.assembled),
  };
}

function readAssembled(value: unknown): DraftRecovery["output"]["assembled"] {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || typeof value.markdown !== "string") return null;
  const config = parseStoredProjectConfig(value.config);
  if (!config) return null;
  return { config, markdown: value.markdown };
}

function readAnalysis(value: unknown): DraftRecovery["analysis"] {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || !sameKeys(value, ["requestId", "fingerprint", "result", "session", "privacyAcknowledged"])) {
    return null;
  }
  if (!isPositiveInteger(value.requestId) || typeof value.fingerprint !== "string" || typeof value.privacyAcknowledged !== "boolean") {
    return null;
  }
  const result = readAnalysisResult(value.result);
  const session = parseReviewSession(value.session);
  if (!result || !session) return null;
  if (session.requestId !== value.requestId || session.fingerprint !== value.fingerprint) return null;
  return {
    requestId: value.requestId,
    fingerprint: value.fingerprint,
    result,
    session,
    privacyAcknowledged: value.privacyAcknowledged,
  };
}

function readWriting(value: unknown): WritingSession | null {
  if (value === null || value === undefined) return null;
  return parseStoredWritingSession(value);
}

function removeDraftKey(storage: Storage) {
  try {
    storage.removeItem(DRAFT_RECOVERY_STORAGE_KEY);
  } catch {
    // A failed delete still leaves the caller with an empty recovery result.
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function sameKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
