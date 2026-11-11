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

export const STACK_SIDES = ["ui", "backend"] as const;
export type StackSide = (typeof STACK_SIDES)[number];

export const STACK_SIDE_LABELS: Record<StackSide, string> = {
  ui: "UI",
  backend: "Backend",
};

// Catalog order is the stable order for each side.
export const UI_LANGUAGES = ["typescript", "javascript", "other"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

export const BACKEND_LANGUAGES = ["java", "python", "typescript", "javascript", "other"] as const;
export type BackendLanguage = (typeof BACKEND_LANGUAGES)[number];

export const NODE_LANGUAGES: readonly Language[] = ["typescript", "javascript"];

export const JS_PACKAGE_MANAGERS = ["yarn", "npm", "pnpm"] as const;
export type JsPackageManager = (typeof JS_PACKAGE_MANAGERS)[number];

export const JS_PACKAGE_MANAGER_LABELS: Record<JsPackageManager, string> = {
  yarn: "Yarn",
  npm: "npm",
  pnpm: "pnpm",
};

export const NODE_VERSIONS = ["26", "24"] as const;
export type NodeVersion = (typeof NODE_VERSIONS)[number];

export const NODE_VERSION_LABELS: Record<NodeVersion, string> = {
  "26": "Node.js 26 (Active LTS)",
  "24": "Node.js 24 (Maintenance LTS)",
};

export const JS_TEST_RUNNERS = ["vitest", "jest"] as const;
export type JsTestRunner = (typeof JS_TEST_RUNNERS)[number];

export const JS_TEST_RUNNER_LABELS: Record<JsTestRunner, string> = {
  vitest: "Vitest",
  jest: "Jest",
};

export const JS_LINTERS = ["eslint-prettier", "biome"] as const;
export type JsLinter = (typeof JS_LINTERS)[number];

export const JS_LINTER_LABELS: Record<JsLinter, string> = {
  "eslint-prettier": "ESLint + Prettier",
  biome: "Biome",
};

// 7.0.2 is the latest stable release. 6.0.3 is the previous stable line. 7.1 is still a release candidate.
export const TYPESCRIPT_VERSIONS = ["7.0", "6.0"] as const;
export type TypeScriptVersion = (typeof TYPESCRIPT_VERSIONS)[number];

export const TYPESCRIPT_VERSION_LABELS: Record<TypeScriptVersion, string> = {
  "7.0": "TypeScript 7.0",
  "6.0": "TypeScript 6.0",
};

export const JAVA_PACKAGE_MANAGERS = ["maven", "gradle"] as const;
export type JavaPackageManager = (typeof JAVA_PACKAGE_MANAGERS)[number];

export const JAVA_PACKAGE_MANAGER_LABELS: Record<JavaPackageManager, string> = {
  maven: "Maven",
  gradle: "Gradle",
};

export const JAVA_VERSIONS = ["17", "21", "25"] as const;
export type JavaVersion = (typeof JAVA_VERSIONS)[number];

export const JAVA_VERSION_LABELS: Record<JavaVersion, string> = {
  "17": "Java 17",
  "21": "Java 21",
  "25": "Java 25",
};

export const JAVA_LINTERS = ["spotless", "checkstyle"] as const;
export type JavaLinter = (typeof JAVA_LINTERS)[number];

export const JAVA_LINTER_LABELS: Record<JavaLinter, string> = {
  spotless: "Spotless",
  checkstyle: "Checkstyle",
};

export const PYTHON_PACKAGE_MANAGERS = ["uv", "poetry", "pip"] as const;
export type PythonPackageManager = (typeof PYTHON_PACKAGE_MANAGERS)[number];

export const PYTHON_PACKAGE_MANAGER_LABELS: Record<PythonPackageManager, string> = {
  uv: "uv",
  poetry: "Poetry",
  pip: "pip",
};

export const PYTHON_VERSIONS = ["3.13", "3.14"] as const;
export type PythonVersion = (typeof PYTHON_VERSIONS)[number];

export const PYTHON_VERSION_LABELS: Record<PythonVersion, string> = {
  "3.13": "Python 3.13",
  "3.14": "Python 3.14",
};

export const PYTHON_TEST_RUNNERS = ["pytest", "unittest"] as const;
export type PythonTestRunner = (typeof PYTHON_TEST_RUNNERS)[number];

export const PYTHON_TEST_RUNNER_LABELS: Record<PythonTestRunner, string> = {
  pytest: "pytest",
  unittest: "unittest",
};

export const PYTHON_LINTERS = ["ruff", "black-ruff"] as const;
export type PythonLinter = (typeof PYTHON_LINTERS)[number];

export const PYTHON_LINTER_LABELS: Record<PythonLinter, string> = {
  ruff: "Ruff",
  "black-ruff": "Black + Ruff",
};

export type TypeScriptToolchain = {
  language: "typescript";
  packageManager: JsPackageManager;
  languageVersion: TypeScriptVersion;
  nodeVersion: NodeVersion;
  testRunner: JsTestRunner;
  linter: JsLinter;
};

export type JavaScriptToolchain = {
  language: "javascript";
  packageManager: JsPackageManager;
  nodeVersion: NodeVersion;
  testRunner: JsTestRunner;
  linter: JsLinter;
};

export type JavaToolchain = {
  language: "java";
  packageManager: JavaPackageManager;
  languageVersion: JavaVersion;
  linter: JavaLinter;
};

export type PythonToolchain = {
  language: "python";
  packageManager: PythonPackageManager;
  languageVersion: PythonVersion;
  testRunner: PythonTestRunner;
  linter: PythonLinter;
};

export type OtherToolchain = {
  language: "other";
};

export type LanguageToolchain =
  | TypeScriptToolchain
  | JavaScriptToolchain
  | JavaToolchain
  | PythonToolchain
  | OtherToolchain;

export type UiToolchain = TypeScriptToolchain | JavaScriptToolchain | OtherToolchain;
export type BackendToolchain = LanguageToolchain;

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

export const UI_FRAMEWORKS = ["nextjs", "react-vite"] as const;
export type UiFrameworkId = (typeof UI_FRAMEWORKS)[number];

export const UI_FRAMEWORK_LABELS: Record<UiFrameworkId, string> = {
  nextjs: "Next.js",
  "react-vite": "React + Vite",
};

export const CLIENT_STATES = ["none", "redux-toolkit", "zustand", "context"] as const;
export type ClientState = (typeof CLIENT_STATES)[number];

export const CLIENT_STATE_LABELS: Record<ClientState, string> = {
  none: "None",
  "redux-toolkit": "Redux Toolkit",
  zustand: "Zustand",
  context: "React context",
};

export const DATA_LIBRARIES = ["none", "tanstack-query"] as const;
export type DataLibrary = (typeof DATA_LIBRARIES)[number];

export const DATA_LIBRARY_LABELS: Record<DataLibrary, string> = {
  none: "None",
  "tanstack-query": "TanStack Query",
};

export const REACT_ROUTERS = ["react-router", "tanstack-router", "none"] as const;
export type ReactRouter = (typeof REACT_ROUTERS)[number];

export const REACT_ROUTER_LABELS: Record<ReactRouter, string> = {
  "react-router": "React Router",
  "tanstack-router": "TanStack Router",
  none: "None",
};

export type NextJsFramework = {
  framework: "nextjs";
  state: ClientState;
  dataLibrary: DataLibrary;
};

export type ReactViteFramework = {
  framework: "react-vite";
  routing: ReactRouter;
  state: ClientState;
  dataLibrary: DataLibrary;
};

export type UiFramework = NextJsFramework | ReactViteFramework;

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

export const TEMPLATE_PLACEHOLDERS = [
  "lineCoverage",
  "branchCoverage",
  "sideLabel",
  "languageVersion",
  "nodeVersion",
  "packageManagerSentence",
  "manifestSentence",
  "installCommand",
  "verifyCommand",
  "testCommand",
  "lintCommand",
  "typecheckCommand",
  "buildCommand",
  "testRunnerSentence",
  "linterSentence",
  "springRunCommand",
  "apiStartCommand",
  "routingSentence",
  "stateSentence",
  "dataSentence",
] as const;
export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];

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
  backendLanguage:
    "Which backend language and toolchain should be used? None was selected, so no backend language conventions are included.",
  backendOther:
    'Which backend language and toolchain should be used for the "Other" selection? No conventions are included for that choice.',
  uiLanguage:
    "Which UI language and toolchain should be used? None was selected for this Web App, so no UI language conventions are included.",
  uiOther:
    'Which UI language and toolchain should be used for the "Other" selection? No conventions are included for that choice.',
  nodeVersions:
    "The UI and backend selections use different Node.js versions. Which version should each package target?",
  frontend:
    "Which UI framework should be used? None was selected for this Web App, so no UI framework conventions are included.",
} as const;

export const NO_STRETCH_GOALS =
  "No stretch goals were provided. Treat every functional requirement above as must-have.";
