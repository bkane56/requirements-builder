import { describe, expect, it } from "vitest";
import { defaultConfig, type ProjectConfig } from "../lib/config";
import { INPUT_LIMITS } from "../lib/constants";
import { hasErrors, validateConfig } from "../lib/validate-config";

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
