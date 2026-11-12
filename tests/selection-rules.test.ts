import { describe, expect, it } from "vitest";
import { defaultConfig, type ProjectConfig } from "../lib/config";
import {
  allowedBackendFrameworks,
  allowedRuntimes,
  hasBackendSelection,
  hasUserInterface,
  isApiChoiceFixed,
  normalizeSelections,
} from "../lib/selection-rules";
import { defaultToolchain } from "../lib/toolchain";
import { defaultUiFramework } from "../lib/ui-framework";

const config = (overrides: Partial<ProjectConfig> = {}): ProjectConfig => ({ ...defaultConfig, ...overrides });

const backend = (...languages: Parameters<typeof defaultToolchain>[0][]) => languages.map((language) => defaultToolchain(language));

describe("allowed options", () => {
  it("offers the Node.js runtime only for backend TypeScript and JavaScript", () => {
    expect(allowedRuntimes(config({ backendLanguages: backend("typescript") }))).toEqual(["none", "nodejs"]);
    expect(allowedRuntimes(config({ backendLanguages: backend("javascript") }))).toEqual(["none", "nodejs"]);
    expect(allowedRuntimes(config({ uiLanguages: backend("typescript"), appType: "web-app" }))).toEqual(["none"]);
    for (const language of ["java", "python", "other"] as const) {
      expect(allowedRuntimes(config({ backendLanguages: backend(language) }))).toEqual(["none"]);
    }
  });

  it("offers backend frameworks only when an HTTP API is included, matched to language and runtime", () => {
    expect(allowedBackendFrameworks(config({ backendLanguages: backend("java"), exposesApi: false }))).toEqual(["none"]);
    expect(allowedBackendFrameworks(config({ backendLanguages: backend("java"), exposesApi: true }))).toEqual([
      "none",
      "spring-boot",
    ]);
    expect(allowedBackendFrameworks(config({ backendLanguages: backend("python"), exposesApi: true }))).toEqual([
      "none",
      "fastapi",
    ]);
    expect(allowedBackendFrameworks(config({ backendLanguages: backend("java", "python"), exposesApi: true }))).toEqual([
      "none",
      "spring-boot",
      "fastapi",
    ]);
    expect(allowedBackendFrameworks(config({ backendLanguages: backend("typescript"), exposesApi: true }))).toEqual(["none"]);
    expect(
      allowedBackendFrameworks(
        config({ backendLanguages: backend("typescript"), runtime: "nodejs", exposesApi: true }),
      ),
    ).toEqual(["none", "nodejs-api"]);
    expect(allowedBackendFrameworks(config({ backendLanguages: backend("other"), exposesApi: true }))).toEqual(["none"]);
  });

  it("keeps UI frameworks only on a Web App and leaves the backend in place", () => {
    const fullStack = normalizeSelections(
      config({
        appType: "web-app",
        exposesApi: true,
        uiFrameworks: [defaultUiFramework("nextjs"), defaultUiFramework("react-vite")],
        backendLanguages: backend("java"),
        backendFramework: "spring-boot",
      }),
    );
    expect(fullStack.uiFrameworks.map((entry) => entry.framework)).toEqual(["nextjs", "react-vite"]);
    expect(fullStack.backendLanguages).toEqual(backend("java"));
    expect(fullStack.backendFramework).toBe("spring-boot");
    expect(normalizeSelections({ ...fullStack, appType: "cli-library" }).uiFrameworks).toEqual([]);
    expect(normalizeSelections({ ...fullStack, appType: "cli-library" }).backendFramework).toBe("none");
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
    backendLanguages: backend("typescript"),
    runtime: "nodejs",
    backendFramework: "nodejs-api",
    exposesApi: true,
    modules: { ...defaultConfig.modules, openapi: true, postman: true },
  });

  it("leaves a compatible configuration unchanged", () => {
    expect(normalizeSelections(nodeApi)).toEqual(nodeApi);
  });

  it("resets the Node.js runtime and Node API framework when the language changes to Java", () => {
    const next = normalizeSelections({ ...nodeApi, backendLanguages: backend("java") });
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

  it("repairs an illegal UI framework option without changing the other framework", () => {
    const normalized = normalizeSelections(
      config({
        appType: "web-app",
        uiFrameworks: [
          { framework: "react-vite", routing: "pages", state: "redux-toolkit", dataLibrary: "none" },
          { ...defaultUiFramework("nextjs"), state: "zustand" },
        ] as unknown as ProjectConfig["uiFrameworks"],
      }),
    );
    expect(normalized.uiFrameworks).toEqual([
      { ...defaultUiFramework("nextjs"), state: "zustand" },
      { ...defaultUiFramework("react-vite"), routing: "react-router", state: "redux-toolkit" },
    ]);
  });

  it("does not add a UI language when a framework is selected and no language is present", () => {
    const next = normalizeSelections(
      config({ appType: "web-app", uiFrameworks: [defaultUiFramework("nextjs")], uiLanguages: [] }),
    );
    expect(next.uiLanguages).toEqual([]);
    expect(next.uiFrameworks).toEqual([defaultUiFramework("nextjs")]);
  });

  it("recognizes a UI or backend from either a language or a framework", () => {
    expect(hasUserInterface(config())).toBe(false);
    expect(hasUserInterface(config({ appType: "web-app", uiLanguages: [defaultToolchain("typescript")] }))).toBe(true);
    expect(hasUserInterface(config({ appType: "web-app", uiFrameworks: [defaultUiFramework("nextjs")] }))).toBe(true);
    expect(hasBackendSelection(config())).toBe(false);
    expect(hasBackendSelection(config({ backendLanguages: backend("java") }))).toBe(true);
    expect(hasBackendSelection(config({ backendFramework: "spring-boot" }))).toBe(true);
  });

  it("clears Spring Boot when Java is removed and FastAPI when Python is removed", () => {
    const spring = normalizeSelections(
      config({ appType: "rest-api", exposesApi: true, backendLanguages: backend("java"), backendFramework: "spring-boot" }),
    );
    expect(normalizeSelections({ ...spring, backendLanguages: [] }).backendFramework).toBe("none");

    const fastapi = normalizeSelections(
      config({
        appType: "ai-agent",
        exposesApi: true,
        backendLanguages: backend("python"),
        backendFramework: "fastapi",
      }),
    );
    expect(normalizeSelections({ ...fastapi, backendLanguages: backend("java") }).backendFramework).toBe("none");
  });

  it("clears UI languages when the app type is not a Web App", () => {
    const next = normalizeSelections(
      config({ appType: "rest-api", uiLanguages: backend("typescript"), backendLanguages: backend("java") }),
    );
    expect(next.uiLanguages).toEqual([]);
    expect(next.backendLanguages).toEqual(backend("java"));
  });

  it("repairs mismatched JavaScript and TypeScript package managers by copying TypeScript", () => {
    const next = normalizeSelections(
      config({
        backendLanguages: [
          defaultToolchain("typescript"),
          { ...defaultToolchain("javascript"), packageManager: "npm", nodeVersion: "24", testRunner: "jest", linter: "biome" },
        ],
      }),
    );
    expect(next.backendLanguages.map((entry) => entry.language)).toEqual(["typescript", "javascript"]);
    expect(next.backendLanguages[1]).toMatchObject({
      packageManager: "yarn",
      nodeVersion: "26",
      testRunner: "vitest",
      linter: "eslint-prettier",
    });
  });

  it("copies shared fields from the language that just changed", () => {
    const next = normalizeSelections(
      config({
        backendLanguages: [
          defaultToolchain("typescript"),
          { ...defaultToolchain("javascript"), packageManager: "npm", testRunner: "jest" },
        ],
      }),
      { syncSide: "backend", syncLanguage: "javascript" },
    );
    expect(next.backendLanguages[0]).toMatchObject({ packageManager: "npm", testRunner: "jest", languageVersion: "7.0" });
    expect(next.backendLanguages[1]).toMatchObject({ packageManager: "npm", testRunner: "jest" });
  });

  it("replaces an unsupported package manager with the language default", () => {
    const next = normalizeSelections(
      config({
        backendLanguages: [
          { language: "java", packageManager: "yarn", languageVersion: "17", linter: "spotless" } as unknown as ReturnType<
            typeof defaultToolchain
          >,
        ],
      }),
    );
    expect(next.backendLanguages).toEqual(backend("java"));
  });

  it("sorts a newly checked language into catalog order and keeps its default toolchain", () => {
    const next = normalizeSelections(
      config({ backendLanguages: [defaultToolchain("javascript"), defaultToolchain("java")] }),
    );
    expect(next.backendLanguages).toEqual(backend("java", "javascript"));
  });

  it("does not change user-entered text", () => {
    const text = config({ projectName: " Name ", businessRequirements: "  {{x}}\n", appType: "cli-library" });
    const next = normalizeSelections(text);
    expect(next.projectName).toBe(" Name ");
    expect(next.businessRequirements).toBe("  {{x}}\n");
  });
});
