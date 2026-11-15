import { describe, expect, it } from "vitest";
import { configsMatch, defaultConfig, type ProjectConfig } from "../lib/config";
import { defaultToolchain } from "../lib/toolchain";

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

  it("detects a toolchain change and matches the same toolchain built twice", () => {
    const java = { ...sample, backendLanguages: [defaultToolchain("java")] };
    const gradle = {
      ...java,
      backendLanguages: [{ ...defaultToolchain("java"), packageManager: "gradle" as const }],
    };
    expect(configsMatch(java, gradle)).toBe(false);
    expect(configsMatch(java, { ...java, backendLanguages: [defaultToolchain("java")] })).toBe(true);
  });

  it("detects a structured requirement change and treats a missing field as free text", () => {
    const removed = { ...sample };
    delete removed.requirementsContent;
    expect(configsMatch(sample, removed)).toBe(true);
    const changed = {
      ...sample,
      requirementsContent: {
        ...sample.requirementsContent!,
        mode: "structured" as const,
      },
    };
    expect(configsMatch(sample, changed)).toBe(false);
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