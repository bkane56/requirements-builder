import { describe, expect, it } from "vitest";
import { assembleRequirements } from "../lib/assemble-requirements";
import { defaultConfig, type ProjectConfig } from "../lib/config";
import { MISSING_TEXT, NO_STRETCH_GOALS, OPEN_QUESTIONS, SECTIONS } from "../lib/constants";
import { loadTemplates } from "../lib/load-templates";
import { MODULES } from "../lib/module-registry";

const templates = loadTemplates();

const config = (overrides: Partial<ProjectConfig> = {}): ProjectConfig => ({
  ...defaultConfig,
  projectName: "Receipt Tracker",
  businessRequirements: "Users can upload a receipt and see its total.",
  acceptanceCriteria: "Uploading a valid receipt shows the total within 2 seconds.",
  ...overrides,
});

const headings = (markdown: string) =>
  markdown.split("\n").filter((line) => line.startsWith("## ")).map((line) => line.slice(3));

describe("assembleRequirements", () => {
  it("produces identical output for identical input", () => {
    expect(assembleRequirements(config(), templates)).toBe(assembleRequirements(config(), templates));
  });

  it("emits section headings in the documented order", () => {
    const order = SECTIONS.map((section) => section.title);
    const emitted = headings(assembleRequirements(config({ mode: "project" }), templates));
    expect(emitted).toEqual(order.filter((title) => emitted.includes(title)));
  });

  it("includes Fast Mode delivery and omits Project Mode sections in Fast Mode", () => {
    const markdown = assembleRequirements(config({ mode: "fast" }), templates);
    expect(markdown).toContain("`fast-delivery` v1.0.0");
    expect(markdown).not.toContain("`project-delivery`");
    expect(markdown).not.toContain("`project-extended`");
    expect(headings(markdown)).not.toContain("Architecture and Dependencies");
    expect(markdown).toContain("#### Must-have");
    expect(markdown).toContain("#### Stretch");
    expect(markdown).toContain("#### Verification after each stage");
  });

  it("includes extended sections and the Project Mode delivery plan in Project Mode", () => {
    const markdown = assembleRequirements(config({ mode: "project" }), templates);
    expect(headings(markdown)).toContain("Architecture and Dependencies");
    expect(markdown).toContain("`project-extended` v1.0.0");
    expect(markdown).toContain("`project-delivery` v1.0.0");
    expect(markdown).not.toContain("`fast-delivery`");
  });

  it("produces a shorter document in Fast Mode than in Project Mode", () => {
    const fast = assembleRequirements(config({ mode: "fast" }), templates);
    const project = assembleRequirements(config({ mode: "project" }), templates);
    expect(fast.length).toBeLessThan(project.length);
  });

  it("lists each included module exactly once with its version", () => {
    const markdown = assembleRequirements(config({ mode: "project" }), templates);
    const modulesSection = markdown.split("## Included Modules")[1];
    for (const included of MODULES.filter((m) => m.appliesTo(config({ mode: "project" })))) {
      const listing = `- \`${included.id}\` v${included.version}: ${included.title}`;
      expect(modulesSection.split(listing).length - 1).toBe(1);
      expect(markdown.split(`### Module: \`${included.id}\``).length - 1).toBe(1);
    }
  });

  it("preserves user-provided text verbatim, including Markdown, braces, whitespace, and non-ASCII", () => {
    const businessRequirements = "  - Track cafe receipts in EUR\n\n# Not a section\n\tUse {{lineCoverage}} literally  \n";
    const acceptanceCriteria = "1. Total shows 12,50 EUR\n2. Rejects files over 5 MB ";
    const stretchGoals = "Export to CSV {{unknown}}";
    const description = "Personal expense helper. Handles naïve résumé text and 東京 receipts.";
    const markdown = assembleRequirements(
      config({ businessRequirements, acceptanceCriteria, stretchGoals, description, projectName: " Receipts {{x}} " }),
      templates,
    );
    expect(markdown).toContain(`\n\n${businessRequirements}\n\n`);
    expect(markdown).toContain(`\n\n${acceptanceCriteria}\n\n`);
    expect(markdown).toContain(`\n\n${stretchGoals}\n\n`);
    expect(markdown).toContain(`\n\n${description}\n\n`);
    expect(markdown).toContain("- Project name:  Receipts {{x}} \n");
  });

  it("flags missing acceptance criteria as an open question instead of inventing them", () => {
    const markdown = assembleRequirements(config({ acceptanceCriteria: "   " }), templates);
    expect(markdown).toContain(MISSING_TEXT.acceptanceCriteria);
    expect(markdown).toContain(`- ${OPEN_QUESTIONS.acceptanceCriteria}`);
  });

  it("flags missing business requirements instead of inventing them", () => {
    const markdown = assembleRequirements(config({ businessRequirements: "" }), templates);
    expect(markdown).toContain(MISSING_TEXT.businessRequirements);
    expect(markdown).toContain(`- ${OPEN_QUESTIONS.businessRequirements}`);
  });

  it("omits the assumptions section when nothing is missing", () => {
    const markdown = assembleRequirements(config(), templates);
    expect(headings(markdown)).not.toContain("Assumptions and Unresolved Questions");
  });

  it("states that all requirements are must-have when no stretch goals are given", () => {
    expect(assembleRequirements(config(), templates)).toContain(NO_STRETCH_GOALS);
  });

  it("omits the description block when the description is blank", () => {
    expect(assembleRequirements(config({ description: " " }), templates)).not.toContain("### Description");
  });

  it("contains no unresolved template placeholders", () => {
    const markdown = assembleRequirements(config({ mode: "project" }), templates);
    expect(markdown).not.toMatch(/\{\{[^}]*\}\}/);
  });

  it("throws when a resolved module has no template", () => {
    const incomplete = { ...templates };
    delete incomplete["business-core"];
    expect(() => assembleRequirements(config(), incomplete)).toThrow('Missing template for module "business-core".');
  });

  it("throws when a template contains an unresolved placeholder", () => {
    const broken = { ...templates, "engineering-core": "- Use {{packageManager}}" };
    expect(() => assembleRequirements(config(), broken)).toThrow(
      'Template for module "engineering-core" contains an unresolved placeholder.',
    );
  });
});
