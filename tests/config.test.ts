import { describe, expect, it } from "vitest";
import { configsMatch, defaultConfig, type ProjectConfig } from "../lib/config";

const sample: ProjectConfig = {
  ...defaultConfig,
  projectName: "Receipt Tracker",
  businessRequirements: "Users can upload a receipt.",
  coverage: { enabled: true, linePercent: 85, branchPercent: 80 },
};

describe("configsMatch", () => {
  it("matches a configuration with itself and with a shallow copy", () => {
    expect(configsMatch(sample, sample)).toBe(true);
    expect(configsMatch(sample, { ...sample, modules: { ...sample.modules }, coverage: { ...sample.coverage } })).toBe(true);
  });

  it("detects a text change and treats a reversal as unchanged", () => {
    const changed = { ...sample, projectName: "Receipt Tracker " };
    expect(configsMatch(sample, changed)).toBe(false);
    expect(configsMatch(sample, { ...changed, projectName: sample.projectName })).toBe(true);
  });

  it("detects a module flag change", () => {
    expect(configsMatch(sample, { ...sample, modules: { ...sample.modules, persistence: true } })).toBe(false);
  });

  it("treats NaN coverage targets as equal to each other and different from a number", () => {
    const missing = { ...sample, coverage: { enabled: true, linePercent: Number.NaN, branchPercent: Number.NaN } };
    const sameMissing = { ...sample, coverage: { enabled: true, linePercent: Number.NaN, branchPercent: Number.NaN } };
    expect(configsMatch(missing, sameMissing)).toBe(true);
    expect(configsMatch(sample, missing)).toBe(false);
  });
});