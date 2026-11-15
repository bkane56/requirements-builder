import { describe, expect, it } from "vitest";
import { defaultConfig, type ProjectConfig } from "../lib/config";
import { INPUT_LIMITS } from "../lib/constants";
import { addFunctionalRequirement, updateAcceptanceCriterion, updateFunctionalRequirement, beginStructuredRequirements, type RequirementsContent } from "../lib/requirements-content";
import { defaultToolchain } from "../lib/toolchain";
import { defaultUiFramework } from "../lib/ui-framework";
import { hasErrors, requirementsItemErrors, validateConfig, type ValidationErrors } from "../lib/validate-config";

const backend = (...languages: Parameters<typeof defaultToolchain>[0][]) => languages.map((language) => defaultToolchain(language));

const valid: ProjectConfig = {
  ...defaultConfig,
  projectName: "Receipt Tracker",
  businessRequirements: "Users can upload a receipt.",
};

describe("validateConfig", () => {
  it("requires a confirmed functional requirement in structured mode and checks criterion scope", () => {
    const structured = {
      ...valid,
      businessRequirements: "",
      requirementsContent: beginStructuredRequirements(valid.requirementsContent!, "empty", "", ""),
    };
    expect(validateConfig(structured).requirementsContent).toBe(
      "Add a confirmed functional requirement, or return to free-text requirements.",
    );
    expect(validateConfig(structured).businessRequirements).toBeUndefined();

    let content = addFunctionalRequirement(structured.requirementsContent, "Show the people list.");
    content = addFunctionalRequirement(content, "Use a database.");
    content = updateFunctionalRequirement(content, "FR-002", { status: "proposed" });
    expect(validateConfig({ ...structured, requirementsContent: content })).toEqual({});

    content = {
      ...content,
      acceptanceCriteria: [
        {
          id: "AC-001",
          scope: "project",
          requirementIds: ["FR-001"],
          text: "Tests pass.",
          source: "user",
          status: "confirmed",
        },
      ],
    };
    expect(validateConfig({ ...structured, requirementsContent: content }).requirementsContent).toBe(
      "AC-001 is project-wide and cannot reference a functional requirement.",
    );
    content = updateAcceptanceCriterion(content, "AC-001", { scope: "requirement", requirementIds: [] });
    expect(validateConfig({ ...structured, requirementsContent: content }).requirementsContent).toBe(
      "AC-001 must reference at least one functional requirement.",
    );
    content = updateAcceptanceCriterion(content, "AC-001", { requirementIds: ["FR-001"] });
    expect(validateConfig({ ...structured, requirementsContent: content })).toEqual({});
  });

  it("reports a specific item error before the missing confirmed requirement message", () => {
    const structured = {
      ...valid,
      businessRequirements: "",
      requirementsContent: beginStructuredRequirements(valid.requirementsContent!, "empty", "", ""),
    };
    const blank = addFunctionalRequirement(structured.requirementsContent, "   ");
    expect(validateConfig({ ...structured, requirementsContent: blank }).requirementsContent).toBe("FR-001 needs text.");
    expect(requirementsItemErrors({ ...structured, requirementsContent: blank })["FR-001"]).toEqual({
      message: "FR-001 needs text.",
      blocking: true,
    });
  });

  it("rejects malformed identifiers and broken criterion relationships", () => {
    const structured = {
      ...valid,
      requirementsContent: addFunctionalRequirement(
        beginStructuredRequirements(valid.requirementsContent!, "empty", "", ""),
        "Show the people list.",
      ),
    };
    const withContent = (requirementsContent: RequirementsContent) =>
      validateConfig({ ...structured, requirementsContent }).requirementsContent;

    const requirements = structured.requirementsContent;
    expect(withContent({
      ...requirements,
      functionalRequirements: [{ ...requirements.functionalRequirements[0], id: "FR-1" }],
    })).toBe("FR-1 is not a valid identifier.");
    expect(withContent({
      ...requirements,
      functionalRequirements: [requirements.functionalRequirements[0], requirements.functionalRequirements[0]],
    })).toBe("FR-001 is used more than once.");
    expect(withContent({
      ...requirements,
      acceptanceCriteria: [
        { id: "AC-1", scope: "project", requirementIds: [], text: "Tests pass.", source: "user", status: "confirmed" },
      ],
    })).toBe("AC-1 is not a valid identifier.");
    expect(withContent({
      ...requirements,
      acceptanceCriteria: [
        { id: "AC-001", scope: "project", requirementIds: [], text: "Tests pass.", source: "user", status: "confirmed" },
        { id: "AC-001", scope: "project", requirementIds: [], text: "Again.", source: "user", status: "confirmed" },
      ],
    })).toBe("AC-001 is used more than once.");
    expect(withContent({
      ...requirements,
      acceptanceCriteria: [
        {
          id: "AC-001",
          scope: "requirement",
          requirementIds: ["FR-001", "FR-001"],
          text: "Repeated.",
          source: "user",
          status: "confirmed",
        },
      ],
    })).toBe("AC-001 lists FR-001 more than once.");
    expect(withContent({
      ...requirements,
      acceptanceCriteria: [
        {
          id: "AC-001",
          scope: "requirement",
          requirementIds: ["FR-404"],
          text: "Missing.",
          source: "user",
          status: "confirmed",
        },
      ],
    })).toBe("AC-001 references FR-404, which does not exist.");
    expect(withContent({
      ...requirements,
      acceptanceCriteria: [
        { id: "AC-001", scope: "requirement", requirementIds: [], text: "Unlinked.", source: "user", status: "proposed" },
      ],
    })).toBe("AC-001 must reference at least one functional requirement.");
    expect(withContent({
      ...requirements,
      acceptanceCriteria: [
        { id: "AC-001", scope: "project", requirementIds: ["FR-001"], text: "Linked.", source: "ai", status: "proposed" },
      ],
    })).toBe("AC-001 is project-wide and cannot reference a functional requirement.");
  });

  it("lets an incomplete proposal stay editable without blocking confirmed requirements", () => {
    let content = addFunctionalRequirement(
      beginStructuredRequirements(valid.requirementsContent!, "empty", "", ""),
      "Show the people list.",
    );
    content = addFunctionalRequirement(content, "");
    content = updateFunctionalRequirement(content, "FR-002", { status: "proposed" });
    content = {
      ...content,
      functionalRequirements: content.functionalRequirements.map((item) =>
        item.id === "FR-002" ? { ...item, source: "ai" as const } : item,
      ),
    };
    const proposedOnly = updateFunctionalRequirement(
      addFunctionalRequirement(beginStructuredRequirements(valid.requirementsContent!, "empty", "", ""), "Maybe later."),
      "FR-001",
      { status: "proposed" },
    );
    expect(validateConfig({ ...valid, requirementsContent: proposedOnly }).requirementsContent).toBe(
      "Add a confirmed functional requirement, or return to free-text requirements.",
    );

    const config = { ...valid, requirementsContent: content };
    expect(validateConfig(config)).toEqual({});
    expect(requirementsItemErrors(config)["FR-002"]).toEqual({ message: "FR-002 needs text.", blocking: false });

    const approved = updateFunctionalRequirement(content, "FR-002", { status: "confirmed" });
    expect(approved.functionalRequirements[1]).toMatchObject({ source: "ai", status: "confirmed", text: "" });
    expect(validateConfig({ ...valid, requirementsContent: approved }).requirementsContent).toBe("FR-002 needs text.");

    const oversized = updateFunctionalRequirement(content, "FR-002", { text: "x".repeat(INPUT_LIMITS.longText + 1) });
    expect(validateConfig({ ...valid, requirementsContent: oversized })).toEqual({});
    expect(requirementsItemErrors({ ...valid, requirementsContent: oversized })["FR-002"]?.blocking).toBe(false);
    const confirmedOversized = updateFunctionalRequirement(oversized, "FR-002", { status: "confirmed" });
    expect(validateConfig({ ...valid, requirementsContent: confirmedOversized }).requirementsContent).toBe(
      `FR-002 must be ${INPUT_LIMITS.longText} characters or fewer.`,
    );
  });

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
      backendLanguages: backend("typescript"),
      runtime: "nodejs",
      backendFramework: "nodejs-api",
      exposesApi: true,
      modules: { ...valid.modules, openapi: true, postman: true },
    });
    expect(errors).toEqual({});
  });

  it.each([
    [{ backendLanguages: backend("java"), runtime: "nodejs" }, "runtime", "The Node.js runtime requires TypeScript or JavaScript on the backend."],
    [{ backendLanguages: backend("python"), exposesApi: true, backendFramework: "spring-boot" }, "backendFramework", "Spring Boot requires Java and an HTTP API."],
    [{ backendLanguages: backend("java"), exposesApi: true, backendFramework: "fastapi" }, "backendFramework", "FastAPI requires Python and an HTTP API."],
    [{ backendLanguages: backend("typescript"), exposesApi: true, backendFramework: "nodejs-api" }, "backendFramework", "The Node.js API module requires the Node.js runtime and an HTTP API."],
    [{ backendLanguages: backend("java"), exposesApi: false, backendFramework: "spring-boot" }, "backendFramework", "Spring Boot requires Java and an HTTP API."],
    [{ appType: "cli-library", uiLanguages: backend("typescript") }, "uiLanguages", "UI languages apply only to Web App projects."],
    [{ backendLanguages: [{ language: "java", packageManager: "yarn", languageVersion: "17", linter: "spotless" }] }, "backendLanguages", "Backend language options must match the supported choices."],
    [{ appType: "cli-library", uiFrameworks: [defaultUiFramework("nextjs")] }, "uiFrameworks", "UI frameworks apply only to Web App projects."],
    [
      {
        appType: "web-app",
        uiFrameworks: [{ framework: "react-vite", routing: "pages", state: "none", dataLibrary: "none" }],
      },
      "uiFrameworks",
      "UI framework options must match the supported choices.",
    ],
    [
      { appType: "web-app", uiFrameworks: [defaultUiFramework("nextjs")], uiLanguages: [] },
      "uiLanguages",
      "Select a UI language for the selected UI framework.",
    ],
    [{ appType: "rest-api", exposesApi: false }, "exposesApi", "REST API projects must include an HTTP API."],
    [{ appType: "cli-library", exposesApi: true }, "exposesApi", "CLI / Library projects cannot include an HTTP API."],
    [{ exposesApi: false, modules: { ...defaultConfig.modules, postman: true } }, "modules", "Swagger/OpenAPI and Postman require an HTTP API."],
  ] as [Partial<ProjectConfig>, keyof ValidationErrors, string][])(
    "rejects incompatible selection %o",
    (overrides, field, message) => {
      expect(validateConfig({ ...valid, ...overrides })[field]).toBe(message);
    },
  );

  it("accepts a UI framework when TypeScript, JavaScript, or Other is selected", () => {
    for (const language of ["typescript", "javascript", "other"] as const) {
      const errors = validateConfig({
        ...valid,
        appType: "web-app",
        uiFrameworks: [defaultUiFramework("react-vite")],
        uiLanguages: [defaultToolchain(language)],
      });
      expect(errors.uiLanguages).toBeUndefined();
    }
    expect(validateConfig({ ...valid, appType: "cli-library" }).uiLanguages).toBeUndefined();
  });

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
