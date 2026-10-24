import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SECTIONS, TEMPLATE_PLACEHOLDERS } from "../lib/constants";
import { TEMPLATES_DIR } from "../lib/load-templates";
import { MODULES } from "../lib/module-registry";

const PROJECT_ROOT = path.join(__dirname, "..");

function listFiles(dir: string, extensions: string[]): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath, extensions);
    return extensions.some((extension) => entry.name.endsWith(extension)) ? [fullPath] : [];
  });
}

const templateFiles = listFiles(TEMPLATES_DIR, [".md"]).map((file) => path.relative(TEMPLATES_DIR, file)).sort();
const readTemplate = (file: string) => fs.readFileSync(path.join(TEMPLATES_DIR, file), "utf-8");

describe("module registry and template files", () => {
  it("has a template file for every registered module", () => {
    const missing = MODULES.filter((module) => !fs.existsSync(path.join(TEMPLATES_DIR, module.file)));
    expect(missing.map((module) => module.file)).toEqual([]);
  });

  it("registers every template file exactly once", () => {
    expect(MODULES.map((module) => module.file).sort()).toEqual(templateFiles);
  });

  it("uses unique module IDs", () => {
    const ids = MODULES.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every module a semantic version, a title, and a known section", () => {
    const sectionIds: string[] = SECTIONS.map((section) => section.id);
    for (const registered of MODULES) {
      expect(registered.version, registered.id).toMatch(/^\d+\.\d+\.\d+$/);
      expect(registered.title.trim(), registered.id).not.toBe("");
      expect(sectionIds, registered.id).toContain(registered.section);
    }
  });
});

describe("template content", () => {
  it.each(templateFiles)("%s is non-empty and ends with a single newline", (file) => {
    const content = readTemplate(file);
    expect(content.trim()).not.toBe("");
    expect(content.endsWith("\n") && !content.endsWith("\n\n")).toBe(true);
  });

  // Section (##) and module (###) headings belong to the assembler; templates may only use #### or deeper.
  it.each(templateFiles)("%s does not use document-level headings", (file) => {
    expect(readTemplate(file)).not.toMatch(/^#{1,3} /m);
  });

  it.each(templateFiles)("%s only uses supported placeholders", (file) => {
    const keys = [...readTemplate(file).matchAll(/\{\{([^}]*)\}\}/g)].map((match) => match[1]);
    const supported: string[] = [...TEMPLATE_PLACEHOLDERS];
    expect(keys.filter((key) => !supported.includes(key))).toEqual([]);
  });

  it("uses every supported placeholder in at least one template", () => {
    const allContent = templateFiles.map(readTemplate).join("\n");
    for (const key of TEMPLATE_PLACEHOLDERS) {
      expect(allContent).toContain(`{{${key}}}`);
    }
  });
});

// requirements.md section 11: no emojis or em dashes in source code, generated sample code, comments, or naming.
// User-entered text is exempt and is preserved verbatim (see the verbatim golden fixture).
describe("banned characters in application source and templates", () => {
  const BANNED = /\u2014|\p{Extended_Pictographic}/u;
  const files = ["app", "components", "lib", "templates"].flatMap((dir) =>
    listFiles(path.join(PROJECT_ROOT, dir), [".ts", ".tsx", ".css", ".md"]),
  );

  it.each(files.map((file) => path.relative(PROJECT_ROOT, file)))("%s contains no em dashes or emojis", (file) => {
    const offending = fs
      .readFileSync(path.join(PROJECT_ROOT, file), "utf-8")
      .split("\n")
      .map((line, index) => ({ line: index + 1, text: line }))
      .filter(({ text }) => BANNED.test(text));
    expect(offending).toEqual([]);
  });
});
