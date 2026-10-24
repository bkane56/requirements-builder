import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleRequirements } from "../lib/assemble-requirements";
import type { ProjectConfig } from "../lib/config";
import { loadTemplates } from "../lib/load-templates";
import { normalizeSelections } from "../lib/selection-rules";
import { validateConfig } from "../lib/validate-config";

// Expected documents are hand-reviewed reference files. Tests only read them; see README "Golden fixtures".
const FIXTURES_DIR = path.join(__dirname, "fixtures");
const CONFIGS_DIR = path.join(FIXTURES_DIR, "configs");
const EXPECTED_DIR = path.join(FIXTURES_DIR, "expected");

const caseNames = (dir: string, extension: string) =>
  fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(extension))
    .map((file) => path.basename(file, extension))
    .sort();

const CASES = caseNames(CONFIGS_DIR, ".json");
const templates = loadTemplates();

describe("golden fixtures", () => {
  it("pairs every configuration with exactly one expected document", () => {
    expect(CASES.length).toBeGreaterThan(0);
    expect(caseNames(EXPECTED_DIR, ".md")).toEqual(CASES);
  });

  describe.each(CASES)("%s", (name) => {
    const config = JSON.parse(fs.readFileSync(path.join(CONFIGS_DIR, `${name}.json`), "utf-8")) as ProjectConfig;
    const expected = fs.readFileSync(path.join(EXPECTED_DIR, `${name}.md`), "utf-8");

    it("is a valid configuration reachable through the UI", () => {
      expect(validateConfig(config)).toEqual({});
      expect(normalizeSelections(config)).toEqual(config);
    });

    it("assembles exactly the approved document", () => {
      expect(assembleRequirements(config, templates)).toBe(expected);
    });
  });
});
