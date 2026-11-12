import {
  APP_TYPES,
  BACKEND_FRAMEWORKS,
  CLIENT_STATES,
  DATA_LIBRARIES,
  LANGUAGES,
  MODES,
  OPTIONAL_MODULES,
  REACT_ROUTERS,
  RUNTIMES,
  UI_FRAMEWORKS,
  type Language,
  type OptionalModule,
  type UiFramework,
} from "../constants";
import { parseRequirementsContent, type RequirementsContent } from "../requirements-content";
import { type AnalysisSource } from "./analysis-input";
import { ANALYSIS_REQUEST_MAX_BYTES } from "./analysis-schema";
import { analyzeRequirements, type AnalysisErrorCode, type AnalysisOutcome } from "./analyze";
import type { AnalysisProvider } from "./provider";

export type AnalysisDependencies = {
  provider: AnalysisProvider | null;
  allowRequest: () => boolean;
  timeoutMs: number;
  retryDelayMs?: number;
};

const ERROR_STATUS: Record<AnalysisErrorCode, number> = {
  unavailable: 503,
  "too-large": 413,
  "invalid-request": 400,
  timeout: 504,
  provider: 502,
  "invalid-response": 502,
  "rate-limited": 429,
};

export async function handleAnalysisPost(request: Request, dependencies: AnalysisDependencies): Promise<Response> {
  const body = await readRequestBody(request);
  if (body === "too-large") return analysisResponse({ ok: false, error: "too-large" });
  if (dependencies.provider === null) return analysisResponse({ ok: false, error: "unavailable" });
  if (!dependencies.allowRequest()) return analysisResponse({ ok: false, error: "rate-limited" });
  if (body === "invalid") return analysisResponse({ ok: false, error: "invalid-request" });
  const config = readAnalysisConfig(body.config);
  if (!config) return analysisResponse({ ok: false, error: "invalid-request" });
  const outcome = await analyzeRequirements(config, dependencies.provider, {
    timeoutMs: dependencies.timeoutMs,
    retryDelayMs: dependencies.retryDelayMs,
  });
  return analysisResponse(outcome);
}

export function readAnalysisConfig(value: unknown): AnalysisSource | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.projectName !== "string" ||
    typeof value.description !== "string" ||
    typeof value.businessRequirements !== "string" ||
    typeof value.acceptanceCriteria !== "string"
  ) {
    return null;
  }
  if (!includes(MODES, value.mode) || !includes(APP_TYPES, value.appType)) return null;
  if (!includes(RUNTIMES, value.runtime) || !includes(BACKEND_FRAMEWORKS, value.backendFramework)) return null;
  if (typeof value.exposesApi !== "boolean") return null;
  const uiLanguages = readLanguages(value.uiLanguages);
  const backendLanguages = readLanguages(value.backendLanguages);
  const uiFrameworks = readFrameworks(value.uiFrameworks);
  const modules = readModules(value.modules);
  const requirementsContent = readRequirements(value);
  if (!uiLanguages || !backendLanguages || !uiFrameworks || !modules || requirementsContent === null) return null;
  return {
    projectName: value.projectName,
    description: value.description,
    businessRequirements: value.businessRequirements,
    acceptanceCriteria: value.acceptanceCriteria,
    mode: value.mode,
    appType: value.appType,
    uiLanguages,
    backendLanguages,
    runtime: value.runtime,
    backendFramework: value.backendFramework,
    uiFrameworks,
    exposesApi: value.exposesApi,
    modules,
    requirementsContent,
  };
}

function readRequirements(value: Record<string, unknown>): RequirementsContent | undefined | null {
  if (!Object.hasOwn(value, "requirementsContent")) return undefined;
  const parsed = parseRequirementsContent(value.requirementsContent);
  if (!parsed || !isRecord(value.requirementsContent)) return null;
  const functionalRequirements = copyFunctionalRequirements(value.requirementsContent.functionalRequirements);
  const acceptanceCriteria = copyAcceptanceCriteria(value.requirementsContent.acceptanceCriteria);
  if (!functionalRequirements || !acceptanceCriteria) return null;
  return {
    mode: parsed.mode,
    nextFunctionalNumber: parsed.nextFunctionalNumber,
    nextCriterionNumber: parsed.nextCriterionNumber,
    functionalRequirements,
    acceptanceCriteria,
  };
}

function copyFunctionalRequirements(value: unknown): RequirementsContent["functionalRequirements"] | null {
  if (!Array.isArray(value)) return null;
  const items: RequirementsContent["functionalRequirements"] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.text !== "string") return null;
    if (item.status !== "confirmed" && item.status !== "proposed") return null;
    if (item.source !== "user" && item.source !== "ai") return null;
    items.push({ id: item.id, text: item.text, status: item.status, source: item.source });
  }
  return items;
}

function copyAcceptanceCriteria(value: unknown): RequirementsContent["acceptanceCriteria"] | null {
  if (!Array.isArray(value)) return null;
  const items: RequirementsContent["acceptanceCriteria"] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.text !== "string" || !Array.isArray(item.requirementIds)) {
      return null;
    }
    if (item.status !== "confirmed" && item.status !== "proposed") return null;
    if (item.source !== "user" && item.source !== "ai") return null;
    if (item.scope !== "project" && item.scope !== "requirement") return null;
    const requirementIds = item.requirementIds.filter((id): id is string => typeof id === "string");
    if (requirementIds.length !== item.requirementIds.length) return null;
    items.push({
      id: item.id,
      text: item.text,
      status: item.status,
      source: item.source,
      scope: item.scope,
      requirementIds,
    });
  }
  return items;
}

function readLanguages(value: unknown): { language: Language }[] | null {
  if (!Array.isArray(value)) return null;
  const entries: { language: Language }[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !includes(LANGUAGES, entry.language)) return null;
    entries.push({ language: entry.language });
  }
  return entries;
}

function readFrameworks(value: unknown): UiFramework[] | null {
  if (!Array.isArray(value)) return null;
  const entries: UiFramework[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !includes(UI_FRAMEWORKS, entry.framework)) return null;
    if (!includes(CLIENT_STATES, entry.state) || !includes(DATA_LIBRARIES, entry.dataLibrary)) return null;
    if (entry.framework === "nextjs") {
      entries.push({ framework: "nextjs", state: entry.state, dataLibrary: entry.dataLibrary });
      continue;
    }
    if (!includes(REACT_ROUTERS, entry.routing)) return null;
    entries.push({
      framework: "react-vite",
      routing: entry.routing,
      state: entry.state,
      dataLibrary: entry.dataLibrary,
    });
  }
  return entries;
}

function readModules(value: unknown): Record<OptionalModule, boolean> | null {
  if (!isRecord(value)) return null;
  const modules = {} as Record<OptionalModule, boolean>;
  for (const key of OPTIONAL_MODULES) {
    if (typeof value[key] !== "boolean") return null;
    modules[key] = value[key];
  }
  return modules;
}

async function readRequestBody(request: Request): Promise<{ config: unknown } | "too-large" | "invalid"> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return "invalid";
  }
  if (new TextEncoder().encode(text).byteLength > ANALYSIS_REQUEST_MAX_BYTES) return "too-large";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || !Object.hasOwn(parsed, "config")) return "invalid";
    return { config: parsed.config };
  } catch {
    return "invalid";
  }
}

function analysisResponse(outcome: AnalysisOutcome): Response {
  return Response.json(outcome, { status: outcome.ok ? 200 : ERROR_STATUS[outcome.error] });
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
