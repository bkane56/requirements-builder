import { describe, expect, it } from "vitest";
import { defaultConfig, type ProjectConfig } from "../lib/config";
import {
  allowedBackendFrameworks,
  allowedFrontends,
  allowedRuntimes,
  isApiChoiceFixed,
  normalizeSelections,
} from "../lib/selection-rules";

const config = (overrides: Partial<ProjectConfig> = {}): ProjectConfig => ({ ...defaultConfig, ...overrides });

describe("allowed options", () => {
  it("offers the Node.js runtime only for TypeScript and JavaScript", () => {
    expect(allowedRuntimes(config({ language: "typescript" }))).toEqual(["none", "nodejs"]);
    expect(allowedRuntimes(config({ language: "javascript" }))).toEqual(["none", "nodejs"]);
    for (const language of ["java", "python", "other"] as const) {
      expect(allowedRuntimes(config({ language }))).toEqual(["none"]);
    }
  });

  it("offers backend frameworks only when an HTTP API is included, matched to language and runtime", () => {
    expect(allowedBackendFrameworks(config({ language: "java", exposesApi: false }))).toEqual(["none"]);
    expect(allowedBackendFrameworks(config({ language: "java", exposesApi: true }))).toEqual(["none", "spring-boot"]);
    expect(allowedBackendFrameworks(config({ language: "python", exposesApi: true }))).toEqual(["none", "fastapi"]);
    expect(allowedBackendFrameworks(config({ language: "typescript", exposesApi: true }))).toEqual(["none"]);
    expect(allowedBackendFrameworks(config({ language: "typescript", runtime: "nodejs", exposesApi: true }))).toEqual([
      "none",
      "nodejs-api",
    ]);
    expect(allowedBackendFrameworks(config({ language: "other", exposesApi: true }))).toEqual(["none"]);
  });

  it("offers frontend frameworks only for Web App projects", () => {
    expect(allowedFrontends(config({ appType: "web-app" }))).toEqual(["nextjs", "react-vite", "no-preference"]);
    for (const appType of ["rest-api", "ai-agent", "cli-library", "other"] as const) {
      expect(allowedFrontends(config({ appType }))).toEqual(["none"]);
    }
  });

  it("fixes the API choice for REST API and CLI projects only", () => {
    expect(isApiChoiceFixed(config({ appType: "rest-api" }))).toBe(true);
    expect(isApiChoiceFixed(config({ appType: "cli-library" }))).toBe(true);
    expect(isApiChoiceFixed(config({ appType: "web-app" }))).toBe(false);
    expect(isApiChoiceFixed(config({ appType: "ai-agent" }))).toBe(false);
  });
});

describe("normalizeSelections", () => {
  const nodeApi = config({
    appType: "rest-api",
    language: "typescript",
    runtime: "nodejs",
    backendFramework: "nodejs-api",
    exposesApi: true,
    modules: { ...defaultConfig.modules, openapi: true, postman: true },
  });

  it("leaves a compatible configuration unchanged", () => {
    expect(normalizeSelections(nodeApi)).toEqual(nodeApi);
  });

  it("resets the Node.js runtime and Node API framework when the language changes to Java", () => {
    const next = normalizeSelections({ ...nodeApi, language: "java" });
    expect(next.runtime).toBe("none");
    expect(next.backendFramework).toBe("none");
    expect(next.exposesApi).toBe(true);
    expect(next.modules.openapi).toBe(true);
  });

  it("resets the Node API framework when the runtime is cleared", () => {
    expect(normalizeSelections({ ...nodeApi, runtime: "none" }).backendFramework).toBe("none");
  });

  it("forces an HTTP API for REST API projects", () => {
    expect(normalizeSelections(config({ appType: "rest-api", exposesApi: false })).exposesApi).toBe(true);
  });

  it("removes the API, backend framework, and API documentation when switching to a CLI project", () => {
    const next = normalizeSelections({ ...nodeApi, appType: "cli-library" });
    expect(next.exposesApi).toBe(false);
    expect(next.backendFramework).toBe("none");
    expect(next.modules.openapi).toBe(false);
    expect(next.modules.postman).toBe(false);
    expect(next.runtime).toBe("nodejs");
  });

  it("clears API documentation when the HTTP API is turned off", () => {
    const next = normalizeSelections({ ...nodeApi, appType: "ai-agent", exposesApi: false });
    expect(next.modules.openapi).toBe(false);
    expect(next.modules.postman).toBe(false);
    expect(next.backendFramework).toBe("none");
  });

  it("defaults the frontend to No preference for Web App and resets it when leaving Web App", () => {
    const webApp = normalizeSelections(config({ appType: "web-app" }));
    expect(webApp.frontend).toBe("no-preference");
    const withNext = normalizeSelections({ ...webApp, frontend: "nextjs" });
    expect(withNext.frontend).toBe("nextjs");
    expect(normalizeSelections({ ...withNext, appType: "cli-library" }).frontend).toBe("none");
  });

  it("does not change user-entered text", () => {
    const text = config({ projectName: " Name ", businessRequirements: "  {{x}}\n", appType: "cli-library" });
    const next = normalizeSelections(text);
    expect(next.projectName).toBe(" Name ");
    expect(next.businessRequirements).toBe("  {{x}}\n");
  });
});
