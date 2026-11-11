import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleRequirements } from "../lib/assemble-requirements";
import { configsMatch, defaultConfig, type ProjectConfig } from "../lib/config";
import {
  CONFIG_FILE_MAX_BYTES,
  CONFIG_FORMAT,
  CONFIG_FORMAT_VERSION,
  parseConfigText,
  serializeConfig,
} from "../lib/config-file";
import { loadTemplates } from "../lib/load-templates";
import { moduleVersionMap } from "../lib/module-registry";
import { normalizeSelections } from "../lib/selection-rules";
import { defaultToolchain } from "../lib/toolchain";
import { defaultUiFramework } from "../lib/ui-framework";

const templates = loadTemplates();
const versions = moduleVersionMap();
const fixtureDirectory = path.join(process.cwd(), "tests", "fixtures", "configs");

function readFixture(name: string): ProjectConfig {
  return JSON.parse(fs.readFileSync(path.join(fixtureDirectory, name), "utf8")) as ProjectConfig;
}

describe("configuration file", () => {
  it("round-trips every golden configuration into the same document", () => {
    for (const name of fs.readdirSync(fixtureDirectory)) {
      const config = readFixture(name);
      const parsed = parseConfigText(serializeConfig(config, versions), versions);
      expect(parsed.ok, name).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.value.libraryChanged, name).toBe(false);
      expect(configsMatch(parsed.value.config, normalizeSelections(config)), name).toBe(true);
      expect(assembleRequirements(parsed.value.config, templates), name).toBe(assembleRequirements(config, templates));
    }
  });

  it("keeps user text exactly and repairs choices the form cannot store", () => {
    const config: ProjectConfig = {
      ...defaultConfig,
      projectName: "Receipt Tracker",
      businessRequirements: "  keep  \u2014 \u{1F680} {{lineCoverage}}\n",
    };
    const file = JSON.parse(serializeConfig(config, versions)) as {
      config: ProjectConfig;
    };
    file.config.appType = "other";
    file.config.uiLanguages = [defaultToolchain("typescript")];
    file.config.backendLanguages = [
      { language: "java", packageManager: "cargo", languageVersion: "17", linter: "spotless" },
    ] as unknown as ProjectConfig["backendLanguages"];

    const parsed = parseConfigText(JSON.stringify(file), versions);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.config.businessRequirements).toBe(config.businessRequirements);
    expect(parsed.value.config.uiLanguages).toEqual([]);
    expect(parsed.value.config.backendLanguages).toEqual([defaultToolchain("java")]);
  });

  it("imports an older file that stored one frontend value", () => {
    const file = JSON.parse(serializeConfig(defaultConfig, versions)) as { config: Record<string, unknown> };
    delete file.config.uiFrameworks;
    file.config.appType = "web-app";
    file.config.frontend = "react-vite";
    const parsed = parseConfigText(JSON.stringify(file), versions);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.config.uiFrameworks).toEqual([defaultUiFramework("react-vite")]);

    file.config.frontend = "no-preference";
    const unspecified = parseConfigText(JSON.stringify(file), versions);
    expect(unspecified.ok).toBe(true);
    if (!unspecified.ok) return;
    expect(unspecified.value.config.uiFrameworks).toEqual([]);
  });

  it("reports a template library change without changing the imported choices", () => {
    const text = serializeConfig(defaultConfig, { "business-core": "9.9.9" });
    const parsed = parseConfigText(text, versions);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.libraryChanged).toBe(true);
    expect(configsMatch(parsed.value.config, normalizeSelections(defaultConfig))).toBe(true);
  });

  it("ignores extra file keys and rejects an unsupported file", () => {
    const file = JSON.parse(serializeConfig(defaultConfig, versions)) as Record<string, unknown>;
    file.note = "ignored";
    const parsed = parseConfigText(JSON.stringify(file), versions);
    expect(parsed.ok).toBe(true);

    expect(parseConfigText("{", versions)).toEqual({ ok: false, error: "not-json" });
    expect(parseConfigText("[]", versions)).toEqual({ ok: false, error: "wrong-format" });
    expect(parseConfigText(JSON.stringify({ format: "other", formatVersion: CONFIG_FORMAT_VERSION }), versions)).toEqual({
      ok: false,
      error: "wrong-format",
    });
    expect(parseConfigText(JSON.stringify({ format: CONFIG_FORMAT, formatVersion: 2 }), versions)).toEqual({
      ok: false,
      error: "wrong-format",
    });
    expect(parseConfigText(JSON.stringify({ format: CONFIG_FORMAT, formatVersion: 1, moduleVersions: versions }), versions)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(parseConfigText("x".repeat(CONFIG_FILE_MAX_BYTES + 1), versions)).toEqual({ ok: false, error: "too-large" });
  });
});
