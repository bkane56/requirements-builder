export const MODES = ["fast", "project"] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABELS: Record<Mode, string> = {
  fast: "Fast Mode",
  project: "Project Mode",
};

export const MODE_DESCRIPTIONS: Record<Mode, string> = {
  fast: "Concise document focused on a working first slice. Engineering quality standards are not reduced.",
  project: "Fuller document that adds architecture, operations, and maintenance sections.",
};

export const APP_TYPES = ["rest-api", "ai-agent", "web-app", "cli-library", "other"] as const;
export type AppType = (typeof APP_TYPES)[number];

export const APP_TYPE_LABELS: Record<AppType, string> = {
  "rest-api": "REST API",
  "ai-agent": "AI Agent",
  "web-app": "Web App",
  "cli-library": "CLI / Library",
  other: "Other",
};

// App types whose HTTP API inclusion is fixed; other types let the user choose.
export const FIXED_API_BY_APP_TYPE: Partial<Record<AppType, boolean>> = {
  "rest-api": true,
  "cli-library": false,
};

export const LANGUAGES = ["java", "python", "typescript", "javascript", "other"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  java: "Java",
  python: "Python",
  typescript: "TypeScript",
  javascript: "JavaScript",
  other: "Other",
};

export const NODE_LANGUAGES: readonly Language[] = ["typescript", "javascript"];

// Package managers are fixed per language until selectable managers are implemented.
export const DEFAULT_PACKAGE_MANAGERS: Record<Language, string | null> = {
  java: "Maven",
  python: "uv",
  typescript: "Yarn",
  javascript: "Yarn",
  other: null,
};

export const RUNTIMES = ["none", "nodejs"] as const;
export type Runtime = (typeof RUNTIMES)[number];

export const RUNTIME_LABELS: Record<Runtime, string> = {
  none: "None / not applicable",
  nodejs: "Node.js",
};

export const BACKEND_FRAMEWORKS = ["none", "spring-boot", "fastapi", "nodejs-api"] as const;
export type BackendFramework = (typeof BACKEND_FRAMEWORKS)[number];

export const BACKEND_FRAMEWORK_LABELS: Record<BackendFramework, string> = {
  none: "None",
  "spring-boot": "Spring Boot",
  fastapi: "FastAPI",
  "nodejs-api": "Node.js API (framework-neutral)",
};

export const FRONTENDS = ["none", "nextjs", "react-vite", "no-preference"] as const;
export type Frontend = (typeof FRONTENDS)[number];

export const FRONTEND_LABELS: Record<Frontend, string> = {
  none: "None",
  nextjs: "Next.js",
  "react-vite": "React + Vite",
  "no-preference": "No preference",
};

export const OPTIONAL_MODULES = [
  "integrationTests",
  "goldenDataset",
  "persistence",
  "security",
  "openapi",
  "postman",
] as const;
export type OptionalModule = (typeof OPTIONAL_MODULES)[number];

export const OPTIONAL_MODULE_LABELS: Record<OptionalModule, string> = {
  integrationTests: "Integration tests",
  goldenDataset: "Golden dataset (deterministic fixtures and expected outputs)",
  persistence: "Persistence (database only if requirements warrant it)",
  security: "Security baseline",
  openapi: "Swagger / OpenAPI documentation",
  postman: "Postman collection",
};

export const API_MODULES: readonly OptionalModule[] = ["openapi", "postman"];

export const COVERAGE_DEFAULTS = {
  enabled: true,
  linePercent: 85,
  branchPercent: 80,
} as const;

export const INPUT_LIMITS = {
  projectName: 120,
  description: 1000,
  longText: 20000,
} as const;

export const SECTIONS = [
  { id: "metadata", title: "Project Metadata and Summary" },
  { id: "business-objectives", title: "Business Objectives and Scope" },
  { id: "functional", title: "Functional Requirements" },
  { id: "acceptance", title: "Acceptance Criteria" },
  { id: "assumptions", title: "Assumptions and Unresolved Questions" },
  { id: "stack", title: "Technical Stack and Coding Conventions" },
  { id: "architecture", title: "Architecture and Dependencies" },
  { id: "data", title: "Data Handling and Golden Dataset" },
  { id: "testing", title: "Testing and Verification" },
  { id: "api", title: "API Contract and Documentation" },
  { id: "security", title: "Security and Nonfunctional Requirements" },
  { id: "implementation", title: "Implementation Phases and Priorities" },
  { id: "done", title: "Definition of Done" },
  { id: "modules", title: "Included Modules" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export const USER_CONTENT_HEADING = "User-provided requirements";

export const MISSING_TEXT = {
  businessRequirements:
    "Not provided. Business requirements must be supplied by the user before implementation. Do not invent them.",
  acceptanceCriteria:
    "Not provided. Measurable acceptance criteria must be supplied by the user before implementation.",
} as const;

export const OPEN_QUESTIONS = {
  businessRequirements: "What are the business requirements? None were provided.",
  acceptanceCriteria:
    "What are the measurable acceptance criteria for each functional requirement? None were provided.",
  language:
    'Which programming language and toolchain should be used? "Other" was selected, so no language conventions are included.',
  frontend: "Which frontend framework should be used? No preference was selected.",
} as const;

export const NO_STRETCH_GOALS =
  "No stretch goals were provided. Treat every functional requirement above as must-have.";
