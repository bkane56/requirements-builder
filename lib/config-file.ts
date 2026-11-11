import { defaultConfig, type ProjectConfig } from "./config";
import {
  APP_TYPES,
  BACKEND_FRAMEWORKS,
  FRONTENDS,
  MODES,
  OPTIONAL_MODULES,
  RUNTIMES,
  type LanguageToolchain,
  type OptionalModule,
} from "./constants";
import { normalizeSelections } from "./selection-rules";

export const CONFIG_FORMAT = "requirements-builder-config";
export const CONFIG_FORMAT_VERSION = 1;
export const CONFIG_FILE_NAME = "PROJECT_CONFIGURATION.json";
export const CONFIG_FILE_MAX_BYTES = 256 * 1024;

export type ConfigFileError = "not-json" | "too-large" | "wrong-format" | "invalid";

export type ParsedConfigFile = {
  config: ProjectConfig;
  libraryChanged: boolean;
};

type ParseResult = { ok: true; value: ParsedConfigFile } | { ok: false; error: ConfigFileError };

const TEXT_FIELDS = [
  "projectName",
  "description",
  "businessRequirements",
  "acceptanceCriteria",
  "stretchGoals",
] as const;

function moduleVersionsDiffer(
  saved: Record<string, string>,
  current: Record<string, string>,
): boolean {
  const savedKeys = Object.keys(saved).sort();
  const currentKeys = Object.keys(current).sort();
  if (savedKeys.length !== currentKeys.length) return true;
  return savedKeys.some((key, index) => key !== currentKeys[index] || saved[key] !== current[key]);
}

export function serializeConfig(config: ProjectConfig, moduleVersions: Record<string, string>): string {
  const normalized = normalizeSelections(config);
  const file = {
    format: CONFIG_FORMAT,
    formatVersion: CONFIG_FORMAT_VERSION,
    moduleVersions: orderedVersions(moduleVersions),
    config: orderedConfig(normalized),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function parseConfigText(text: string, currentVersions: Record<string, string>): ParseResult {
  if (new TextEncoder().encode(text).length > CONFIG_FILE_MAX_BYTES) return { ok: false, error: "too-large" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "not-json" };
  }

  if (!isRecord(parsed)) return { ok: false, error: "wrong-format" };
  if (parsed.format !== CONFIG_FORMAT || parsed.formatVersion !== CONFIG_FORMAT_VERSION) {
    return { ok: false, error: "wrong-format" };
  }

  const moduleVersions = readVersionMap(parsed.moduleVersions);
  const config = readConfig(parsed.config);
  if (!moduleVersions || !config) return { ok: false, error: "invalid" };

  return {
    ok: true,
    value: {
      config: normalizeSelections(config),
      libraryChanged: moduleVersionsDiffer(moduleVersions, currentVersions),
    },
  };
}

function orderedVersions(versions: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(versions).sort().map((key) => [key, versions[key]]));
}

function orderedConfig(config: ProjectConfig): ProjectConfig {
  return {
    projectName: config.projectName,
    description: config.description,
    businessRequirements: config.businessRequirements,
    acceptanceCriteria: config.acceptanceCriteria,
    stretchGoals: config.stretchGoals,
    mode: config.mode,
    appType: config.appType,
    uiLanguages: config.uiLanguages,
    backendLanguages: config.backendLanguages,
    runtime: config.runtime,
    backendFramework: config.backendFramework,
    frontend: config.frontend,
    exposesApi: config.exposesApi,
    modules: Object.fromEntries(OPTIONAL_MODULES.map((key) => [key, config.modules[key]])) as ProjectConfig["modules"],
    coverage: {
      enabled: config.coverage.enabled,
      linePercent: config.coverage.linePercent,
      branchPercent: config.coverage.branchPercent,
    },
  };
}

function readConfig(value: unknown): ProjectConfig | null {
  if (!isRecord(value)) return null;
  const text = readTextFields(value);
  const modules = readModules(value.modules);
  const coverage = readCoverage(value.coverage);
  const uiLanguages = readStack(value.uiLanguages);
  const backendLanguages = readStack(value.backendLanguages);
  if (
    !text ||
    !modules ||
    !coverage ||
    !uiLanguages ||
    !backendLanguages ||
    !includes(MODES, value.mode) ||
    !includes(APP_TYPES, value.appType) ||
    !includes(RUNTIMES, value.runtime) ||
    !includes(BACKEND_FRAMEWORKS, value.backendFramework) ||
    !includes(FRONTENDS, value.frontend) ||
    typeof value.exposesApi !== "boolean"
  ) {
    return null;
  }

  return {
    ...defaultConfig,
    ...text,
    mode: value.mode,
    appType: value.appType,
    uiLanguages,
    backendLanguages,
    runtime: value.runtime,
    backendFramework: value.backendFramework,
    frontend: value.frontend,
    exposesApi: value.exposesApi,
    modules,
    coverage,
  };
}

function readTextFields(value: Record<string, unknown>): Pick<ProjectConfig, (typeof TEXT_FIELDS)[number]> | null {
  const text = {} as Pick<ProjectConfig, (typeof TEXT_FIELDS)[number]>;
  for (const key of TEXT_FIELDS) {
    if (typeof value[key] !== "string") return null;
    text[key] = value[key];
  }
  return text;
}

function readModules(value: unknown): ProjectConfig["modules"] | null {
  if (!isRecord(value)) return null;
  const modules = {} as Record<OptionalModule, boolean>;
  for (const key of OPTIONAL_MODULES) {
    if (typeof value[key] !== "boolean") return null;
    modules[key] = value[key];
  }
  return modules;
}

function readCoverage(value: unknown): ProjectConfig["coverage"] | null {
  if (!isRecord(value) || typeof value.enabled !== "boolean") return null;
  if (!isFiniteNumber(value.linePercent) || !isFiniteNumber(value.branchPercent)) return null;
  return {
    enabled: value.enabled,
    linePercent: value.linePercent,
    branchPercent: value.branchPercent,
  };
}

function readStack(value: unknown): LanguageToolchain[] | null {
  if (!Array.isArray(value) || !value.every((entry) => isRecord(entry))) return null;
  return value as LanguageToolchain[];
}

function readVersionMap(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const versions: Record<string, string> = {};
  for (const [key, version] of Object.entries(value)) {
    if (typeof version !== "string") return null;
    versions[key] = version;
  }
  return versions;
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
