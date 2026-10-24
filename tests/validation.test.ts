import { describe, expect, it } from "vitest";
import { defaultConfig, type ProjectConfig } from "../lib/config";
import { INPUT_LIMITS } from "../lib/constants";
import { hasErrors, validateConfig, type ValidationErrors } from "../lib/validate-config";

const valid: ProjectConfig = {
  ...defaultConfig,
  projectName: "Receipt Tracker",
  businessRequirements: "Users can upload a receipt.",
};

describe("validateConfig", () => {
  it("accepts a config with the required fields and empty optional fields", () => {
    const errors = validateConfig(valid);
    expect(errors).toEqual({});
    expect(hasErrors(errors)).toBe(false);
  });

  it("rejects the default empty config with messages for both required fields", () => {
    const errors = validateConfig(defaultConfig);
    expect(errors).toEqual({
      projectName: "Project name is required.",
      businessRequirements: "Business requirements are required.",
    });
    expect(hasErrors(errors)).toBe(true);
  });

  it("treats whitespace-only required fields as missing", () => {
    const errors = validateConfig({ ...valid, projectName: "  \t", businessRequirements: "\n\n " });
    expect(errors.projectName).toBe("Project name is required.");
    expect(errors.businessRequirements).toBe("Business requirements are required.");
  });

  it("accepts values exactly at the length limits", () => {
    const errors = validateConfig({
      ...valid,
      projectName: "a".repeat(INPUT_LIMITS.projectName),
      description: "a".repeat(INPUT_LIMITS.description),
      businessRequirements: "a".repeat(INPUT_LIMITS.longText),
      acceptanceCriteria: "a".repeat(INPUT_LIMITS.longText),
      stretchGoals: "a".repeat(INPUT_LIMITS.longText),
    });
    expect(errors).toEqual({});
  });

  it("accepts a compatible full technology configuration", () => {
    const errors = validateConfig({
      ...valid,
      appType: "rest-api",
      language: "typescript",
      runtime: "nodejs",
      backendFramework: "nodejs-api",
      exposesApi: true,
      modules: { ...valid.modules, openapi: true, postman: true },
    });
    expect(errors).toEqual({});
  });

  it.each([
    [{ language: "java", runtime: "nodejs" }, "runtime", "The Node.js runtime requires TypeScript or JavaScript."],
    [{ language: "python", exposesApi: true, backendFramework: "spring-boot" }, "backendFramework", "Spring Boot requires Java and an HTTP API."],
    [{ language: "java", exposesApi: true, backendFramework: "fastapi" }, "backendFramework", "FastAPI requires Python and an HTTP API."],
    [{ language: "typescript", exposesApi: true, backendFramework: "nodejs-api" }, "backendFramework", "The Node.js API module requires the Node.js runtime and an HTTP API."],
    [{ language: "java", exposesApi: false, backendFramework: "spring-boot" }, "backendFramework", "Spring Boot requires Java and an HTTP API."],
    [{ appType: "cli-library", frontend: "nextjs" }, "frontend", "Frontend frameworks apply only to Web App projects."],
    [{ appType: "web-app", frontend: "none" }, "frontend", "Choose a frontend option for a Web App."],
    [{ appType: "rest-api", exposesApi: false }, "exposesApi", "REST API projects must include an HTTP API."],
    [{ appType: "cli-library", exposesApi: true }, "exposesApi", "CLI / Library projects cannot include an HTTP API."],
    [{ exposesApi: false, modules: { ...defaultConfig.modules, postman: true } }, "modules", "Swagger/OpenAPI and Postman require an HTTP API."],
  ] as [Partial<ProjectConfig>, keyof ValidationErrors, string][])(
    "rejects incompatible selection %o",
    (overrides, field, message) => {
      expect(validateConfig({ ...valid, ...overrides })[field]).toBe(message);
    },
  );

  it.each([Number.NaN, -1, 101, 85.5])("rejects line coverage target %s without flagging branch", (value) => {
    const errors = validateConfig({ ...valid, coverage: { enabled: true, linePercent: value, branchPercent: 80 } });
    expect(errors.linePercent).toBe("Line coverage target must be a whole number from 0 to 100.");
    expect(errors.branchPercent).toBeUndefined();
  });

  it.each([Number.NaN, -1, 101, 85.5])("rejects branch coverage target %s without flagging line", (value) => {
    const errors = validateConfig({ ...valid, coverage: { enabled: true, linePercent: 85, branchPercent: value } });
    expect(errors.branchPercent).toBe("Branch coverage target must be a whole number from 0 to 100.");
    expect(errors.linePercent).toBeUndefined();
  });

  it("reports invalid line and branch targets independently", () => {
    const errors = validateConfig({ ...valid, coverage: { enabled: true, linePercent: -1, branchPercent: 101 } });
    expect(errors.linePercent).toBe("Line coverage target must be a whole number from 0 to 100.");
    expect(errors.branchPercent).toBe("Branch coverage target must be a whole number from 0 to 100.");
  });

  it("accepts coverage boundaries and ignores targets when coverage is disabled", () => {
    expect(validateConfig({ ...valid, coverage: { enabled: true, linePercent: 0, branchPercent: 100 } })).toEqual({});
    expect(validateConfig({ ...valid, coverage: { enabled: false, linePercent: Number.NaN, branchPercent: 101 } })).toEqual({});
  });

  it("rejects every field that exceeds its length limit", () => {
    const errors = validateConfig({
      ...valid,
      projectName: "a".repeat(INPUT_LIMITS.projectName + 1),
      description: "a".repeat(INPUT_LIMITS.description + 1),
      businessRequirements: "a".repeat(INPUT_LIMITS.longText + 1),
      acceptanceCriteria: "a".repeat(INPUT_LIMITS.longText + 1),
      stretchGoals: "a".repeat(INPUT_LIMITS.longText + 1),
    });
    expect(Object.keys(errors).sort()).toEqual(
      ["acceptanceCriteria", "businessRequirements", "description", "projectName", "stretchGoals"].sort(),
    );
  });
});
