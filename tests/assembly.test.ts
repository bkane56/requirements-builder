import { describe, expect, it } from "vitest";
import { assembleRequirements } from "../lib/assemble-requirements";
import { defaultConfig, type ProjectConfig } from "../lib/config";
import { MISSING_TEXT, NO_STRETCH_GOALS, OPEN_QUESTIONS, SECTIONS } from "../lib/constants";
import { loadTemplates } from "../lib/load-templates";
import { MODULES } from "../lib/module-registry";
import {
  addAcceptanceCriterion,
  addFunctionalRequirement,
  updateFunctionalRequirement,
  beginStructuredRequirements,
} from "../lib/requirements-content";
import { defaultToolchain } from "../lib/toolchain";
import { defaultUiFramework } from "../lib/ui-framework";

const backend = (...languages: Parameters<typeof defaultToolchain>[0][]) => languages.map((language) => defaultToolchain(language));

const templates = loadTemplates();

const config = (overrides: Partial<ProjectConfig> = {}): ProjectConfig => ({
  ...defaultConfig,
  projectName: "Receipt Tracker",
  businessRequirements: "Users can upload a receipt and see its total.",
  acceptanceCriteria: "Uploading a valid receipt shows the total within 2 seconds.",
  backendLanguages: backend("typescript"),
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
      config({ backendLanguages: [], uiLanguages: [], uiFrameworks: [], appType: "web-app" }),
      templates,
    );
    expect(markdown).toContain(`- ${OPEN_QUESTIONS.backendLanguage}`);
    expect(markdown).toContain(`- ${OPEN_QUESTIONS.uiLanguage}`);
    expect(markdown).toContain(`- ${OPEN_QUESTIONS.frontend}`);
    expect(markdown).toContain("- Backend languages: None selected");
    expect(markdown).toContain("- UI languages: None selected");
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
        backendLanguages: backend("java"),
        exposesApi: true,
        backendFramework: "spring-boot",
        modules: modules({ openapi: true, postman: true }),
      }),
      templates,
    );
    const ids = includedModuleIds(markdown);
    expect(ids).toEqual(expect.arrayContaining(["java-backend", "spring-boot", "openapi-swagger", "postman"]));
    for (const id of ["python-backend", "fastapi", "typescript-backend", "typescript-ui", "javascript-backend", "nodejs-runtime", "nodejs-api"]) {
      expect(ids).not.toContain(id);
    }
    expect(markdown).toContain("- Backend languages: Java 17, Maven, JUnit 5, Spotless");
    expect(markdown).toContain("./mvnw spring-boot:run");
    expect(markdown).not.toMatch(/\buv\b|yarn|Node\.js/i);
  });

  it("Python AI agent without an API includes agent guidance and no API documentation", () => {
    const markdown = assembleRequirements(
      config({
        appType: "ai-agent",
        backendLanguages: backend("python"),
        exposesApi: false,
        modules: modules({ openapi: true, postman: true }),
      }),
      templates,
    );
    const ids = includedModuleIds(markdown);
    expect(ids).toEqual(expect.arrayContaining(["python-backend", "agent-tool-calling"]));
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
    expect(ids).toEqual(expect.arrayContaining(["typescript-backend", "nodejs-runtime", "nodejs-api"]));
    expect(markdown).toContain("Run on Node.js 26");
    expect(markdown).toContain("- Runtime: Node.js");
    expect(markdown).not.toMatch(/Maven|mvnw|Spring|\buv\b|pytest|Pydantic/);
  });

  it("uses npm commands for an npm toolchain and does not emit Yarn commands", () => {
    const markdown = assembleRequirements(
      config({ backendLanguages: [{ ...defaultToolchain("typescript"), packageManager: "npm" }] }),
      templates,
    );
    expect(markdown).toContain("npm ci");
    expect(markdown).toContain("commit `package-lock.json`");
    expect(markdown).toContain("Do not create `yarn.lock`");
    expect(markdown).not.toContain("yarn install --frozen-lockfile");
  });

  it("uses Gradle commands for a Gradle and Spring Boot toolchain", () => {
    const markdown = assembleRequirements(
      config({
        appType: "rest-api",
        exposesApi: true,
        backendFramework: "spring-boot",
        backendLanguages: [{ ...defaultToolchain("java"), packageManager: "gradle" }],
      }),
      templates,
    );
    expect(markdown).toContain("./gradlew clean check");
    expect(markdown).toContain("./gradlew bootRun");
    expect(markdown).not.toContain("./mvnw");
  });

  it("includes a UI TypeScript module and a backend Java module in one document", () => {
    const markdown = assembleRequirements(
      config({
        appType: "web-app",
        uiFrameworks: [defaultUiFramework("nextjs")],
        uiLanguages: backend("typescript"),
        backendLanguages: backend("java"),
      }),
      templates,
    );
    const ids = includedModuleIds(markdown);
    expect(ids).toContain("typescript-ui");
    expect(ids).toContain("java-backend");
    expect(markdown).toContain("These conventions apply to the UI package.");
    expect(markdown).toContain("These conventions apply to the Backend package.");
    expect(markdown).toContain("yarn install --frozen-lockfile");
    expect(markdown).toContain("./mvnw clean verify");
    expect(markdown).toContain("- Full stack: this Web App includes both a UI and a backend.");
  });

  it("emits confirmed structured requirements once and omits proposed items", () => {
    const businessRequirements = "  Show the people list.\nKeep the spacing.  ";
    let content = beginStructuredRequirements(
      config().requirementsContent!,
      "copy",
      businessRequirements,
      "The application builds and its tests pass.",
    );
    content = addFunctionalRequirement(content, "Selecting a person opens that person's detail.");
    content = addFunctionalRequirement(content, "The API uses mock data until a database is requested.");
    content = addFunctionalRequirement(content, "The first version has no authentication.");
    content = addFunctionalRequirement(content, "Person records include an unspecified nickname field.");
    content = updateFunctionalRequirement(content, "FR-005", { status: "proposed" });
    content = addAcceptanceCriterion(content, {
      scope: "requirement",
      text: "The detail page shows the person returned by the API.",
      requirementIds: ["FR-002"],
    });
    const markdown = assembleRequirements(
      config({
        businessRequirements,
        acceptanceCriteria: "The application builds and its tests pass.",
        requirementsContent: content,
      }),
      templates,
    );
    expect(markdown).toContain("### Confirmed functional requirements");
    expect(markdown).toContain("### Confirmed acceptance criteria");
    expect(markdown).not.toContain("### User-provided requirements");
    expect(markdown).toContain("**FR-001.**   Show the people list.\nKeep the spacing.  ");
    expect(markdown).toContain("**FR-002.** Selecting a person opens that person's detail.");
    expect(markdown).toContain("**FR-003.** The API uses mock data until a database is requested.");
    expect(markdown).toContain("**FR-004.** The first version has no authentication.");
    expect(markdown).not.toContain("unspecified nickname");
    expect(markdown).toContain("**AC-001.** The application builds and its tests pass.\nApplies to the whole project.");
    expect(markdown).toContain("**AC-002.** The detail page shows the person returned by the API.\nApplies to FR-002.");
    expect(markdown.split(businessRequirements)).toHaveLength(2);
    expect(markdown).toContain("Which acceptance criterion applies to FR-001? None references it.");
    expect(markdown).not.toContain(OPEN_QUESTIONS.acceptanceCriteria);
  });

  it("keeps free-text requirements authoritative until structured mode is selected", () => {
    const content = addFunctionalRequirement(config().requirementsContent!, "Structured only.");
    const markdown = assembleRequirements(config({ requirementsContent: { ...content, mode: "free-text" } }), templates);
    expect(markdown).toContain("Users can upload a receipt and see its total.");
    expect(markdown).toContain("### User-provided requirements");
    expect(markdown).not.toContain("### Confirmed functional requirements");
    expect(markdown).not.toContain("Structured only.");
    expect(markdown).not.toContain("**FR-001.**");
  });

  it("does not ask which requirement a project-wide criterion covers", () => {
    const content = beginStructuredRequirements(
      config().requirementsContent!,
      "copy",
      "Show the people list.",
      "Automated tests pass.",
    );
    const markdown = assembleRequirements(
      config({
        businessRequirements: "Show the people list.",
        acceptanceCriteria: "Automated tests pass.",
        requirementsContent: addFunctionalRequirement(content, "Open a person."),
      }),
      templates,
    );
    expect(markdown).toContain("Applies to the whole project.");
    expect(markdown).not.toContain("Which acceptance criterion applies to");
    expect(markdown).not.toContain(OPEN_QUESTIONS.acceptanceCriteria);
    expect(markdown).not.toContain(MISSING_TEXT.acceptanceCriteria);
  });

  it("asks which UI language to use when a Web App has none", () => {
    const markdown = assembleRequirements(
      config({ appType: "web-app", uiFrameworks: [defaultUiFramework("nextjs")], uiLanguages: [], backendLanguages: backend("java") }),
      templates,
    );
    expect(markdown).toContain(`- ${OPEN_QUESTIONS.uiLanguage}`);
  });

  it("keeps UI and backend toolchains distinct when both sides use TypeScript", () => {
    const markdown = assembleRequirements(
      config({
        appType: "web-app",
        uiFrameworks: [defaultUiFramework("react-vite")],
        uiLanguages: [{ ...defaultToolchain("typescript"), packageManager: "npm", nodeVersion: "24" }],
        backendLanguages: backend("typescript"),
      }),
      templates,
    );
    expect(markdown).toContain("npm ci");
    expect(markdown).toContain("yarn install --frozen-lockfile");
    expect(markdown).toContain("- UI and backend packages: separate. Each side keeps its own package manifest.");
    expect(markdown).toContain(`- ${OPEN_QUESTIONS.nodeVersions}`);
  });

  it("Next.js web app includes frontend and accessibility guidance without a database mandate", () => {
    const markdown = assembleRequirements(
      config({ appType: "web-app", uiFrameworks: [defaultUiFramework("nextjs")], uiLanguages: backend("typescript"), backendLanguages: [] }),
      templates,
    );
    const ids = includedModuleIds(markdown);
    expect(ids).toContain("nextjs-react");
    expect(ids).not.toContain("react-vite");
    expect(ids).not.toContain("persistence-optional");
    expect(markdown).toContain("WCAG 2.2 AA");
    expect(markdown).toContain("Do not add React Router or another client router.");
    expect(markdown).toContain("Do not add a client state library.");
    expect(markdown).not.toContain("- Full stack:");
  });

  it("keeps separate React options and includes the backend framework for a full-stack app", () => {
    const markdown = assembleRequirements(
      config({
        appType: "web-app",
        exposesApi: true,
        backendFramework: "spring-boot",
        backendLanguages: backend("java"),
        uiLanguages: backend("typescript"),
        uiFrameworks: [
          { ...defaultUiFramework("nextjs"), state: "redux-toolkit", dataLibrary: "tanstack-query" },
          { ...defaultUiFramework("react-vite"), routing: "tanstack-router", state: "zustand" },
        ],
      }),
      templates,
    );
    const ids = includedModuleIds(markdown);
    expect(ids).toEqual(expect.arrayContaining(["nextjs-react", "react-vite", "spring-boot", "java-backend", "typescript-ui"]));
    expect(markdown).toContain("Use Redux Toolkit for shared client state.");
    expect(markdown).toContain("Use TanStack Query for server data, cache, and request status.");
    expect(markdown).toContain("Use TanStack Router for browser routes.");
    expect(markdown).toContain("Use Zustand for shared client state.");
    expect(markdown).toContain("Do not add React Router or another client router.");
    expect(markdown).toContain("- Full stack: this Web App includes both a UI and a backend.");
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
