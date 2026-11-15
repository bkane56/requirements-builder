import { describe, expect, it } from "vitest";
import { evaluateAdvisories } from "../lib/advisories";
import { defaultConfig, type ProjectConfig } from "../lib/config";
import { defaultToolchain } from "../lib/toolchain";
import { UI_TEXT } from "../lib/ui-text";
import { defaultUiFramework } from "../lib/ui-framework";

const config = (overrides: Partial<ProjectConfig> = {}): ProjectConfig => ({
  ...defaultConfig,
  ...overrides,
  modules: { ...defaultConfig.modules, ...overrides.modules },
});

const recommendation = {
  id: "integration-tests-http-fullstack",
  severity: "recommendation",
  message: UI_TEXT.advisories.integrationTestsHttpFullStack,
  field: "integrationTests",
} as const;

function httpFullStack(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return config({
    appType: "web-app",
    businessRequirements: "People can view personal data for each person.",
    uiLanguages: [defaultToolchain("typescript")],
    uiFrameworks: [{ ...defaultUiFramework("react-vite"), state: "redux-toolkit" }],
    backendLanguages: [defaultToolchain("java")],
    exposesApi: true,
    backendFramework: "spring-boot",
    ...overrides,
  });
}

function freezeConfig(value: ProjectConfig): ProjectConfig {
  const frozen = structuredClone(value);
  const visit = (current: unknown) => {
    if (!current || typeof current !== "object" || Object.isFrozen(current)) return;
    Object.freeze(current);
    for (const child of Object.values(current)) visit(child);
  };
  visit(frozen);
  return frozen;
}

describe("configuration advisories", () => {
  it("recommends integration tests for a Web App with a UI and an HTTP backend", () => {
    expect(evaluateAdvisories(httpFullStack())).toEqual([recommendation]);
    expect(recommendation.message).toBe(
      "This Web App includes a UI and an HTTP backend. Integration tests are recommended so the UI and API are verified together. You can assemble the document without enabling them.",
    );
  });

  it("does not modify the project configuration", () => {
    const input = freezeConfig(httpFullStack());
    const snapshot = structuredClone(input);
    expect(evaluateAdvisories(input)).toEqual([recommendation]);
    expect(input).toEqual(snapshot);
    expect(input.modules.integrationTests).toBe(false);
    expect(input.uiFrameworks[0]).toMatchObject({ framework: "react-vite", state: "redux-toolkit" });
  });

  it("accepts a UI language or a backend language without requiring the other framework", () => {
    expect(
      evaluateAdvisories(
        config({
          appType: "web-app",
          uiLanguages: [defaultToolchain("typescript")],
          backendLanguages: [defaultToolchain("java")],
          exposesApi: true,
        }),
      ),
    ).toEqual([recommendation]);
  });

  it("accepts a UI framework and a backend framework without requiring languages", () => {
    expect(
      evaluateAdvisories(
        config({
          appType: "web-app",
          uiFrameworks: [defaultUiFramework("nextjs")],
          exposesApi: true,
          backendFramework: "spring-boot",
        }),
      ),
    ).toEqual([recommendation]);
  });

  it.each([
    ["integration tests are already enabled", httpFullStack({ modules: { ...defaultConfig.modules, integrationTests: true } })],
    ["the project is not a Web App", httpFullStack({ appType: "rest-api" })],
    ["no UI is selected", httpFullStack({ uiLanguages: [], uiFrameworks: [] })],
    ["the HTTP API is off", httpFullStack({ exposesApi: false, backendFramework: "none" })],
    ["no backend is selected", httpFullStack({ backendLanguages: [], backendFramework: "none" })],
    [
      "Redux Toolkit and personal-data wording are the only extra signals",
      config({
        appType: "web-app",
        businessRequirements: "People can view personal data for each person.",
        uiFrameworks: [{ ...defaultUiFramework("react-vite"), state: "redux-toolkit" }],
        uiLanguages: [defaultToolchain("typescript")],
      }),
    ],
  ])("returns no advisory when %s", (_label, value) => {
    expect(evaluateAdvisories(value)).toEqual([]);
  });
});
