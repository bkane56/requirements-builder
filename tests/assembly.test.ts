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
  language: "typescript",
  ...overrides,
});

const modules = (overrides: Partial<ProjectConfig["modules"]>) => ({ ...defaultConfig.modules, ...overrides });

const headings = (markdown: string) =>
  markdown.split("\n").filter((line) => line.startsWith("## ")).map((line) => line.slice(3));

const includedModuleIds = (markdown: string) =>
  [...markdown.matchAll(/^### Module: `([^`]+)`/gm)].map((match) => match[1]);

const versionOf = (id: string) => MODULES.find((module) => module.id === id)?.version;

describe("assembleRequirements", () => {
  it("produces identical output for identical input", () => {
    expect(assembleRequirements(config(), templates)).toBe(assembleRequirements(config(), templates));
  });

  it("emits section headings in the documented order", () => {
    const order = SECTIONS.map((section) => section.title);
    const emitted = headings(
      assembleRequirements(config({ mode: "project", appType: "rest-api", exposesApi: true }), templates),
    );
    expect(emitted).toEqual(order.filter((title) => emitted.includes(title)));
  });

  it("includes Fast Mode delivery and omits Project Mode sections in Fast Mode", () => {
    const markdown = assembleRequirements(config({ mode: "fast" }), templates);
    expect(markdown).toContain(`\`fast-delivery\` v${versionOf("fast-delivery")}`);
    expect(markdown).not.toContain("`project-delivery`");
    expect(markdown).not.toContain("`project-extended`");
    expect(headings(markdown)).not.toContain("Architecture and Dependencies");
    expect(markdown).toContain("#### Must-have");
    expect(markdown).toContain("#### Stretch");
    expect(markdown).toContain("#### Verification after each stage");
  });

  it("includes Architecture and Complexity Constraints only in Fast Mode", () => {
    const fast = assembleRequirements(config({ mode: "fast" }), templates);
    expect(fast).toContain("#### Architecture and Complexity Constraints");
    expect(fast).toContain("Do not add speculative abstraction for hypothetical future needs.");
    expect(fast).toContain("Do not create unnecessary files, classes, interfaces, factories, wrappers, or service layers.");
    expect(fast).toContain("Do not add a dependency unless the platform or standard library cannot reasonably meet the need.");

    const project = assembleRequirements(config({ mode: "project" }), templates);
    expect(project).not.toContain("#### Architecture and Complexity Constraints");
  });

  it("includes extended sections and the Project Mode delivery plan in Project Mode", () => {
    const markdown = assembleRequirements(config({ mode: "project" }), templates);
    expect(headings(markdown)).toContain("Architecture and Dependencies");
    expect(markdown).toContain(`\`project-extended\` v${versionOf("project-extended")}`);
    expect(markdown).toContain(`\`project-delivery\` v${versionOf("project-delivery")}`);
    expect(markdown).not.toContain("`fast-delivery`");
  });

  it("produces a shorter document in Fast Mode than in Project Mode", () => {
    const fast = assembleRequirements(config({ mode: "fast" }), templates);
    const project = assembleRequirements(config({ mode: "project" }), templates);
    expect(fast.length).toBeLessThan(project.length);
  });

  it("lists each included module exactly once with its version", () => {
    const projectConfig = config({ mode: "project", appType: "rest-api", exposesApi: true });
    const markdown = assembleRequirements(projectConfig, templates);
    const modulesSection = markdown.split("## Included Modules")[1];
    for (const included of MODULES.filter((m) => m.appliesTo(projectConfig))) {
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

  it("flags an unspecified language and frontend as open questions", () => {
    const markdown = assembleRequirements(
      config({ language: "other", appType: "web-app", frontend: "no-preference" }),
      templates,
    );
    expect(markdown).toContain(`- ${OPEN_QUESTIONS.language}`);
    expect(markdown).toContain(`- ${OPEN_QUESTIONS.frontend}`);
    expect(markdown).not.toContain("- Package manager:");
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

  it("throws when a template contains an unknown placeholder", () => {
    const broken = { ...templates, "engineering-core": "- Use {{packageManager}}" };
    expect(() => assembleRequirements(config(), broken)).toThrow(
      'Template for module "engineering-core" contains an unresolved placeholder {{packageManager}}.',
    );
  });
});

describe("technology module selection", () => {
  it("Java REST API with Spring Boot, OpenAPI, and Postman includes Java modules and no Python or Node guidance", () => {
    const markdown = assembleRequirements(
      config({
        appType: "rest-api",
        language: "java",
        exposesApi: true,
        backendFramework: "spring-boot",
        modules: modules({ openapi: true, postman: true }),
      }),
      templates,
    );
    const ids = includedModuleIds(markdown);
    expect(ids).toEqual(expect.arrayContaining(["java-17-maven", "spring-boot", "openapi-swagger", "postman"]));
    for (const id of ["python-uv", "fastapi", "typescript-yarn", "javascript-yarn", "nodejs-runtime", "nodejs-api"]) {
      expect(ids).not.toContain(id);
    }
    expect(markdown).toContain("- Package manager: Maven (default for Java)");
    expect(markdown).not.toMatch(/\buv\b|yarn|Node\.js/i);
  });

  it("Python AI agent without an API includes agent guidance and no API documentation", () => {
    const markdown = assembleRequirements(
      config({
        appType: "ai-agent",
        language: "python",
        exposesApi: false,
        modules: modules({ openapi: true, postman: true }),
      }),
      templates,
    );
    const ids = includedModuleIds(markdown);
    expect(ids).toEqual(expect.arrayContaining(["python-uv", "agent-tool-calling"]));
    expect(ids).not.toContain("openapi-swagger");
    expect(ids).not.toContain("postman");
    expect(headings(markdown)).not.toContain("API Contract and Documentation");
  });

  it("Node.js TypeScript API includes Node guidance and no Java or Python conventions", () => {
    const markdown = assembleRequirements(
      config({ appType: "rest-api", exposesApi: true, runtime: "nodejs", backendFramework: "nodejs-api" }),
      templates,
    );
    const ids = includedModuleIds(markdown);
    expect(ids).toEqual(expect.arrayContaining(["typescript-yarn", "nodejs-runtime", "nodejs-api"]));
    expect(markdown).toContain("- Runtime: Node.js");
    expect(markdown).not.toMatch(/Maven|mvnw|Spring|\buv\b|pytest|Pydantic/);
  });

  it("Next.js web app includes frontend and accessibility guidance without a database mandate", () => {
    const markdown = assembleRequirements(config({ appType: "web-app", frontend: "nextjs" }), templates);
    const ids = includedModuleIds(markdown);
    expect(ids).toContain("nextjs-react");
    expect(ids).not.toContain("react-vite");
    expect(ids).not.toContain("persistence-optional");
    expect(markdown).toContain("WCAG 2.2 AA");
  });

  it("CLI project includes no frontend or API modules", () => {
    const ids = includedModuleIds(assembleRequirements(config({ appType: "cli-library" }), templates));
    for (const id of ["nextjs-react", "react-vite", "openapi-swagger", "postman", "nodejs-api", "spring-boot", "fastapi"]) {
      expect(ids).not.toContain(id);
    }
  });

  it("includes optional modules only when selected", () => {
    const off = includedModuleIds(
      assembleRequirements(
        config({ modules: modules({ integrationTests: false, goldenDataset: false, persistence: false, security: false }) }),
        templates,
      ),
    );
    for (const id of ["integration-tests", "golden-dataset", "persistence-optional", "security-baseline"]) {
      expect(off).not.toContain(id);
    }
    expect(off).toEqual(expect.arrayContaining(["unit-tests", "local-build-run"]));

    const on = includedModuleIds(
      assembleRequirements(
        config({ modules: modules({ integrationTests: true, goldenDataset: true, persistence: true, security: true }) }),
        templates,
      ),
    );
    expect(on).toEqual(
      expect.arrayContaining(["integration-tests", "golden-dataset", "persistence-optional", "security-baseline"]),
    );
  });

  it("renders the selected coverage targets and requires behavioral tests for critical rules", () => {
    const markdown = assembleRequirements(
      config({ coverage: { enabled: true, linePercent: 90, branchPercent: 75 } }),
      templates,
    );
    expect(markdown).toContain("at least 90% line coverage and 75% branch coverage of functional and business-logic code");
    expect(markdown).toContain("Every critical business rule must have explicit behavioral tests");
    expect(markdown).toContain("Excluded code does not count as tested business behavior.");
  });

  it("omits coverage targets when coverage is disabled", () => {
    const markdown = assembleRequirements(
      config({ coverage: { enabled: false, linePercent: 90, branchPercent: 75 } }),
      templates,
    );
    expect(includedModuleIds(markdown)).not.toContain("coverage-targets");
    expect(markdown).not.toContain("90% line coverage");
  });
});
