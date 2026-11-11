import type { ProjectConfig } from "./config";
import {
  API_MODULES,
  FIXED_API_BY_APP_TYPE,
  type BackendFramework,
  type Frontend,
  type Runtime,
  type StackSide,
} from "./constants";
import { hasLanguage, normalizeStack, type NormalizeStackOptions } from "./toolchain";

export type NormalizeOptions = {
  syncSide?: StackSide;
  syncLanguage?: NormalizeStackOptions["syncLanguage"];
};

export function isApiChoiceFixed(config: ProjectConfig): boolean {
  return FIXED_API_BY_APP_TYPE[config.appType] !== undefined;
}

export function allowedRuntimes(config: ProjectConfig): Runtime[] {
  return hasLanguage(config.backendLanguages, "typescript") || hasLanguage(config.backendLanguages, "javascript")
    ? ["none", "nodejs"]
    : ["none"];
}

export function allowedBackendFrameworks(config: ProjectConfig): BackendFramework[] {
  const allowed: BackendFramework[] = ["none"];
  if (!config.exposesApi) return allowed;
  if (hasLanguage(config.backendLanguages, "java")) allowed.push("spring-boot");
  if (hasLanguage(config.backendLanguages, "python")) allowed.push("fastapi");
  if (config.runtime === "nodejs") allowed.push("nodejs-api");
  return allowed;
}

export function allowedFrontends(config: ProjectConfig): Frontend[] {
  return config.appType === "web-app" ? ["nextjs", "react-vite", "no-preference"] : ["none"];
}

// Resets selections that no longer apply after a parent choice changes. Order matters:
// languages, then API inclusion, then runtime, then backend framework, because each depends on the previous.
export function normalizeSelections(config: ProjectConfig, options: NormalizeOptions = {}): ProjectConfig {
  const exposesApi = FIXED_API_BY_APP_TYPE[config.appType] ?? config.exposesApi;
  let next: ProjectConfig = {
    ...config,
    exposesApi,
    uiLanguages:
      config.appType === "web-app"
        ? normalizeStack(config.uiLanguages, "ui", {
            syncLanguage: options.syncSide === "ui" ? options.syncLanguage : undefined,
          })
        : [],
    backendLanguages: normalizeStack(config.backendLanguages, "backend", {
      syncLanguage: options.syncSide === "backend" ? options.syncLanguage : undefined,
    }),
  };

  if (!allowedRuntimes(next).includes(next.runtime)) next = { ...next, runtime: "none" };
  if (!allowedBackendFrameworks(next).includes(next.backendFramework)) next = { ...next, backendFramework: "none" };

  const frontends = allowedFrontends(next);
  if (!frontends.includes(next.frontend)) {
    next = { ...next, frontend: next.appType === "web-app" ? "no-preference" : "none" };
  }

  if (!exposesApi && API_MODULES.some((key) => next.modules[key])) {
    const modules = { ...next.modules };
    for (const key of API_MODULES) modules[key] = false;
    next = { ...next, modules };
  }

  return next;
}
