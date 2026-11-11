import {
  BACKEND_LANGUAGES,
  JAVA_LINTERS,
  JAVA_PACKAGE_MANAGERS,
  JAVA_VERSIONS,
  JS_LINTERS,
  JS_PACKAGE_MANAGERS,
  JS_TEST_RUNNERS,
  NODE_VERSIONS,
  PYTHON_LINTERS,
  PYTHON_PACKAGE_MANAGERS,
  PYTHON_TEST_RUNNERS,
  PYTHON_VERSIONS,
  STACK_SIDE_LABELS,
  TYPESCRIPT_VERSIONS,
  UI_LANGUAGES,
  JAVA_LINTER_LABELS,
  JAVA_PACKAGE_MANAGER_LABELS,
  JS_LINTER_LABELS,
  JS_PACKAGE_MANAGER_LABELS,
  JS_TEST_RUNNER_LABELS,
  PYTHON_LINTER_LABELS,
  PYTHON_PACKAGE_MANAGER_LABELS,
  PYTHON_TEST_RUNNER_LABELS,
  type JavaLinter,
  type JavaPackageManager,
  type JavaScriptToolchain,
  type JavaToolchain,
  type JsLinter,
  type JsPackageManager,
  type JsTestRunner,
  type Language,
  type LanguageToolchain,
  type NodeVersion,
  type PythonLinter,
  type PythonPackageManager,
  type PythonTestRunner,
  type PythonToolchain,
  type StackSide,
  type TypeScriptToolchain,
} from "./constants";

export type NormalizeStackOptions = {
  syncLanguage?: "typescript" | "javascript";
};

export type ToolchainPatch = Partial<{
  packageManager: string;
  languageVersion: string;
  nodeVersion: string;
  testRunner: string;
  linter: string;
}>;

type JsCommands = {
  packageManagerSentence: string;
  installCommand: string;
  lintCommand: string;
  typecheckCommand: string;
  testCommand: string;
  buildCommand: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function defaultToolchain(language: "typescript"): TypeScriptToolchain;
export function defaultToolchain(language: "javascript"): JavaScriptToolchain;
export function defaultToolchain(language: "java"): JavaToolchain;
export function defaultToolchain(language: "python"): PythonToolchain;
export function defaultToolchain(language: "other"): { language: "other" };
export function defaultToolchain(language: Language): LanguageToolchain;
export function defaultToolchain(language: Language): LanguageToolchain {
  switch (language) {
    case "typescript":
      return {
        language: "typescript",
        packageManager: "yarn",
        languageVersion: "7.0",
        nodeVersion: "26",
        testRunner: "vitest",
        linter: "eslint-prettier",
      };
    case "javascript":
      return {
        language: "javascript",
        packageManager: "yarn",
        nodeVersion: "26",
        testRunner: "vitest",
        linter: "eslint-prettier",
      };
    case "java":
      return {
        language: "java",
        packageManager: "maven",
        languageVersion: "17",
        linter: "spotless",
      };
    case "python":
      return {
        language: "python",
        packageManager: "uv",
        languageVersion: "3.13",
        testRunner: "pytest",
        linter: "ruff",
      };
    case "other":
      return { language: "other" };
  }
}

function allowedLanguages(side: StackSide): readonly Language[] {
  return side === "ui" ? UI_LANGUAGES : BACKEND_LANGUAGES;
}

function isLegalEntry(entry: Record<string, unknown>): boolean {
  switch (entry.language) {
    case "other":
      return true;
    case "typescript":
      return (
        isOneOf(JS_PACKAGE_MANAGERS, entry.packageManager) &&
        isOneOf(TYPESCRIPT_VERSIONS, entry.languageVersion) &&
        isOneOf(NODE_VERSIONS, entry.nodeVersion) &&
        isOneOf(JS_TEST_RUNNERS, entry.testRunner) &&
        isOneOf(JS_LINTERS, entry.linter)
      );
    case "javascript":
      return (
        isOneOf(JS_PACKAGE_MANAGERS, entry.packageManager) &&
        isOneOf(NODE_VERSIONS, entry.nodeVersion) &&
        isOneOf(JS_TEST_RUNNERS, entry.testRunner) &&
        isOneOf(JS_LINTERS, entry.linter)
      );
    case "java":
      return (
        isOneOf(JAVA_PACKAGE_MANAGERS, entry.packageManager) &&
        isOneOf(JAVA_VERSIONS, entry.languageVersion) &&
        isOneOf(JAVA_LINTERS, entry.linter)
      );
    case "python":
      return (
        isOneOf(PYTHON_PACKAGE_MANAGERS, entry.packageManager) &&
        isOneOf(PYTHON_VERSIONS, entry.languageVersion) &&
        isOneOf(PYTHON_TEST_RUNNERS, entry.testRunner) &&
        isOneOf(PYTHON_LINTERS, entry.linter)
      );
    default:
      return false;
  }
}

export function isLegalStack(entries: unknown, side: StackSide): entries is LanguageToolchain[] {
  if (!Array.isArray(entries)) return false;
  const allowed = allowedLanguages(side);
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!isRecord(entry) || !isOneOf(allowed, entry.language)) return false;
    if (seen.has(entry.language)) return false;
    seen.add(entry.language);
    if (!isLegalEntry(entry)) return false;
  }
  return true;
}

function pick<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return isOneOf(values, value) ? value : fallback;
}

function coerceEntry(language: Language, raw: Record<string, unknown>): LanguageToolchain {
  switch (language) {
    case "typescript": {
      const defaults = defaultToolchain("typescript");
      return {
        language: "typescript",
        packageManager: pick(JS_PACKAGE_MANAGERS, raw.packageManager, defaults.packageManager),
        languageVersion: pick(TYPESCRIPT_VERSIONS, raw.languageVersion, defaults.languageVersion),
        nodeVersion: pick(NODE_VERSIONS, raw.nodeVersion, defaults.nodeVersion),
        testRunner: pick(JS_TEST_RUNNERS, raw.testRunner, defaults.testRunner),
        linter: pick(JS_LINTERS, raw.linter, defaults.linter),
      };
    }
    case "javascript": {
      const defaults = defaultToolchain("javascript");
      return {
        language: "javascript",
        packageManager: pick(JS_PACKAGE_MANAGERS, raw.packageManager, defaults.packageManager),
        nodeVersion: pick(NODE_VERSIONS, raw.nodeVersion, defaults.nodeVersion),
        testRunner: pick(JS_TEST_RUNNERS, raw.testRunner, defaults.testRunner),
        linter: pick(JS_LINTERS, raw.linter, defaults.linter),
      };
    }
    case "java": {
      const defaults = defaultToolchain("java");
      return {
        language: "java",
        packageManager: pick(JAVA_PACKAGE_MANAGERS, raw.packageManager, defaults.packageManager),
        languageVersion: pick(JAVA_VERSIONS, raw.languageVersion, defaults.languageVersion),
        linter: pick(JAVA_LINTERS, raw.linter, defaults.linter),
      };
    }
    case "python": {
      const defaults = defaultToolchain("python");
      return {
        language: "python",
        packageManager: pick(PYTHON_PACKAGE_MANAGERS, raw.packageManager, defaults.packageManager),
        languageVersion: pick(PYTHON_VERSIONS, raw.languageVersion, defaults.languageVersion),
        testRunner: pick(PYTHON_TEST_RUNNERS, raw.testRunner, defaults.testRunner),
        linter: pick(PYTHON_LINTERS, raw.linter, defaults.linter),
      };
    }
    case "other":
      return { language: "other" };
  }
}

type JsShared = {
  packageManager: JsPackageManager;
  nodeVersion: NodeVersion;
  testRunner: JsTestRunner;
  linter: JsLinter;
};

function syncJavaScriptFamily(
  entries: LanguageToolchain[],
  prefer: "typescript" | "javascript" | undefined,
): LanguageToolchain[] {
  const typescript = entries.find((entry): entry is TypeScriptToolchain => entry.language === "typescript");
  const javascript = entries.find((entry): entry is JavaScriptToolchain => entry.language === "javascript");
  if (!typescript || !javascript) return entries;
  const source = prefer === "javascript" ? javascript : typescript;
  const shared: JsShared = {
    packageManager: source.packageManager,
    nodeVersion: source.nodeVersion,
    testRunner: source.testRunner,
    linter: source.linter,
  };
  return entries.map((entry) => {
    if (entry.language !== "typescript" && entry.language !== "javascript") return entry;
    return { ...entry, ...shared };
  });
}

// Drops unknown languages, replaces unsupported option values with defaults, keeps one entry per
// language, syncs the shared JavaScript and TypeScript fields, and sorts into catalog order.
export function normalizeStack(
  entries: unknown,
  side: StackSide,
  options: NormalizeStackOptions = {},
): LanguageToolchain[] {
  if (!Array.isArray(entries)) return [];
  const allowed = allowedLanguages(side);
  const seen = new Set<string>();
  const coerced: LanguageToolchain[] = [];
  for (const raw of entries) {
    if (!isRecord(raw) || !isOneOf(allowed, raw.language) || seen.has(raw.language)) continue;
    seen.add(raw.language);
    coerced.push(coerceEntry(raw.language, raw));
  }
  const synced = syncJavaScriptFamily(coerced, options.syncLanguage);
  return [...synced].sort(
    (left, right) => allowed.indexOf(left.language) - allowed.indexOf(right.language),
  );
}

export function replaceToolchain(
  entries: LanguageToolchain[],
  language: Language,
  patch: ToolchainPatch,
): LanguageToolchain[] {
  return entries.map((entry) => {
    if (entry.language !== language || entry.language === "other") return entry;
    return { ...entry, ...patch } as LanguageToolchain;
  });
}

export function hasLanguage(entries: LanguageToolchain[], language: Language): boolean {
  return entries.some((entry) => entry.language === language);
}

export function nodeVersionOf(entries: LanguageToolchain[]): NodeVersion | null {
  const typescript = entries.find((entry): entry is TypeScriptToolchain => entry.language === "typescript");
  if (typescript) return typescript.nodeVersion;
  const javascript = entries.find((entry): entry is JavaScriptToolchain => entry.language === "javascript");
  return javascript ? javascript.nodeVersion : null;
}

export function hasJavaScriptFamily(entries: LanguageToolchain[]): boolean {
  return hasLanguage(entries, "typescript") || hasLanguage(entries, "javascript");
}

export function toolchainSummary(entry: LanguageToolchain): string {
  switch (entry.language) {
    case "other":
      return "Other";
    case "typescript":
      return `TypeScript ${entry.languageVersion}, Node.js ${entry.nodeVersion}, ${JS_PACKAGE_MANAGER_LABELS[entry.packageManager]}, ${JS_TEST_RUNNER_LABELS[entry.testRunner]}, ${JS_LINTER_LABELS[entry.linter]}`;
    case "javascript":
      return `JavaScript, Node.js ${entry.nodeVersion}, ${JS_PACKAGE_MANAGER_LABELS[entry.packageManager]}, ${JS_TEST_RUNNER_LABELS[entry.testRunner]}, ${JS_LINTER_LABELS[entry.linter]}`;
    case "java":
      return `Java ${entry.languageVersion}, ${JAVA_PACKAGE_MANAGER_LABELS[entry.packageManager]}, JUnit 5, ${JAVA_LINTER_LABELS[entry.linter]}`;
    case "python":
      return `Python ${entry.languageVersion}, ${PYTHON_PACKAGE_MANAGER_LABELS[entry.packageManager]}, ${PYTHON_TEST_RUNNER_LABELS[entry.testRunner]}, ${PYTHON_LINTER_LABELS[entry.linter]}`;
  }
}

function jsCommands(manager: JsPackageManager): JsCommands {
  switch (manager) {
    case "yarn":
      return {
        packageManagerSentence:
          "Use Yarn for dependency management and commit `yarn.lock`. Do not create `package-lock.json` or `pnpm-lock.yaml`.",
        installCommand: "yarn install --frozen-lockfile",
        lintCommand: "yarn lint",
        typecheckCommand: "yarn typecheck",
        testCommand: "yarn test",
        buildCommand: "yarn build",
      };
    case "npm":
      return {
        packageManagerSentence:
          "Use npm for dependency management and commit `package-lock.json`. Do not create `yarn.lock` or `pnpm-lock.yaml`.",
        installCommand: "npm ci",
        lintCommand: "npm run lint",
        typecheckCommand: "npm run typecheck",
        testCommand: "npm test",
        buildCommand: "npm run build",
      };
    case "pnpm":
      return {
        packageManagerSentence:
          "Use pnpm for dependency management and commit `pnpm-lock.yaml`. Do not create `package-lock.json` or `yarn.lock`.",
        installCommand: "pnpm install --frozen-lockfile",
        lintCommand: "pnpm lint",
        typecheckCommand: "pnpm typecheck",
        testCommand: "pnpm test",
        buildCommand: "pnpm build",
      };
  }
}

function jsTestRunnerSentence(runner: JsTestRunner): string {
  return runner === "vitest" ? "Use Vitest as the test runner." : "Use Jest as the test runner.";
}

function jsLinterSentence(linter: JsLinter): string {
  return linter === "biome"
    ? "Use Biome for linting and formatting."
    : "Use ESLint for linting and Prettier for formatting.";
}

function javaCommands(manager: JavaPackageManager): {
  packageManagerSentence: string;
  manifestSentence: string;
  verifyCommand: string;
  testCommand: string;
  springRunCommand: string;
} {
  if (manager === "gradle") {
    return {
      packageManagerSentence:
        "Use Gradle for build and dependency management. Prefer the Gradle Wrapper (`./gradlew`) and commit it. Do not introduce Maven or Ant.",
      manifestSentence: "Pin plugin and dependency versions in the Gradle build file.",
      verifyCommand: "./gradlew clean check",
      testCommand: "./gradlew test",
      springRunCommand: "./gradlew bootRun",
    };
  }
  return {
    packageManagerSentence:
      "Use Maven for build and dependency management. Prefer the Maven Wrapper (`./mvnw`) and commit it. Do not introduce Gradle or Ant.",
    manifestSentence: "Pin plugin and dependency versions in `pom.xml`.",
    verifyCommand: "./mvnw clean verify",
    testCommand: "./mvnw test",
    springRunCommand: "./mvnw spring-boot:run",
  };
}

function javaLinterSentence(linter: JavaLinter): string {
  return linter === "checkstyle" ? "Enforce Java style with Checkstyle." : "Format Java with Spotless.";
}

function pythonCommands(manager: PythonPackageManager, runner: PythonTestRunner): {
  packageManagerSentence: string;
  manifestSentence: string;
  installCommand: string;
  testCommand: string;
  apiStartCommand: string;
} {
  const testCommand =
    runner === "pytest"
      ? manager === "uv"
        ? "uv run pytest"
        : manager === "poetry"
          ? "poetry run pytest"
          : "python -m pytest"
      : manager === "uv"
        ? "uv run python -m unittest"
        : manager === "poetry"
          ? "poetry run python -m unittest"
          : "python -m unittest";
  switch (manager) {
    case "uv":
      return {
        packageManagerSentence:
          "Use `uv` for Python versions, virtual environments, and dependencies. Do not call `pip` or Poetry directly.",
        manifestSentence:
          "Declare dependencies in `pyproject.toml`, commit `uv.lock`, and pin the Python version in `.python-version`.",
        installCommand: "uv sync",
        testCommand,
        apiStartCommand: "uv run uvicorn",
      };
    case "poetry":
      return {
        packageManagerSentence:
          "Use Poetry for dependency management and virtual environments. Do not call `pip` or `uv` directly.",
        manifestSentence:
          "Declare dependencies in `pyproject.toml` and commit `poetry.lock`. Pin the Python version in `.python-version`.",
        installCommand: "poetry install",
        testCommand,
        apiStartCommand: "poetry run uvicorn",
      };
    case "pip":
      return {
        packageManagerSentence:
          "Use `pip` inside a virtual environment for dependencies. Do not call `uv` or Poetry directly.",
        manifestSentence:
          "Declare dependencies in `requirements.txt` and pin direct dependencies. Pin the Python version in `.python-version`.",
        installCommand: "python -m pip install -r requirements.txt",
        testCommand,
        apiStartCommand: "python -m uvicorn",
      };
  }
}

function pythonLinterSentence(linter: PythonLinter): string {
  return linter === "black-ruff"
    ? "Use Ruff for linting and Black for formatting."
    : "Use Ruff for linting and formatting.";
}

function pythonTestRunnerSentence(runner: PythonTestRunner): string {
  return runner === "pytest" ? "Use pytest as the test runner." : "Use the Python unittest runner.";
}

export function springRunCommand(entries: LanguageToolchain[]): string {
  const java = entries.find((entry): entry is JavaToolchain => entry.language === "java");
  return javaCommands(java?.packageManager ?? "maven").springRunCommand;
}

export function apiStartCommand(entries: LanguageToolchain[]): string {
  const python = entries.find((entry): entry is PythonToolchain => entry.language === "python");
  return pythonCommands(python?.packageManager ?? "uv", python?.testRunner ?? "pytest").apiStartCommand;
}

export function toolchainPlaceholderValues(entry: LanguageToolchain, side: StackSide): Record<string, string> {
  const normalized = coerceEntry(entry.language, entry);
  const sideLabel = STACK_SIDE_LABELS[side];
  switch (normalized.language) {
    case "other":
      return { sideLabel };
    case "typescript":
    case "javascript": {
      const commands = jsCommands(normalized.packageManager);
      return {
        sideLabel,
        languageVersion: normalized.language === "typescript" ? normalized.languageVersion : "",
        nodeVersion: normalized.nodeVersion,
        packageManagerSentence: commands.packageManagerSentence,
        manifestSentence: "",
        installCommand: commands.installCommand,
        verifyCommand: "",
        testCommand: commands.testCommand,
        lintCommand: commands.lintCommand,
        typecheckCommand: commands.typecheckCommand,
        buildCommand: commands.buildCommand,
        testRunnerSentence: jsTestRunnerSentence(normalized.testRunner),
        linterSentence: jsLinterSentence(normalized.linter),
      };
    }
    case "java": {
      const commands = javaCommands(normalized.packageManager);
      return {
        sideLabel,
        languageVersion: normalized.languageVersion,
        nodeVersion: "",
        packageManagerSentence: commands.packageManagerSentence,
        manifestSentence: commands.manifestSentence,
        installCommand: "",
        verifyCommand: commands.verifyCommand,
        testCommand: commands.testCommand,
        lintCommand: "",
        typecheckCommand: "",
        buildCommand: "",
        testRunnerSentence: "Use JUnit 5 for tests.",
        linterSentence: javaLinterSentence(normalized.linter),
        springRunCommand: commands.springRunCommand,
      };
    }
    case "python": {
      const commands = pythonCommands(normalized.packageManager, normalized.testRunner);
      return {
        sideLabel,
        languageVersion: normalized.languageVersion,
        nodeVersion: "",
        packageManagerSentence: commands.packageManagerSentence,
        manifestSentence: commands.manifestSentence,
        installCommand: commands.installCommand,
        verifyCommand: "",
        testCommand: commands.testCommand,
        lintCommand: "",
        typecheckCommand: "",
        buildCommand: "",
        testRunnerSentence: pythonTestRunnerSentence(normalized.testRunner),
        linterSentence: pythonLinterSentence(normalized.linter),
        apiStartCommand: commands.apiStartCommand,
      };
    }
  }
}

export function toolchainsEqual(left: LanguageToolchain, right: LanguageToolchain): boolean {
  if (left.language !== right.language) return false;
  switch (left.language) {
    case "other":
      return true;
    case "typescript":
      return (
        right.language === "typescript" &&
        left.packageManager === right.packageManager &&
        left.languageVersion === right.languageVersion &&
        left.nodeVersion === right.nodeVersion &&
        left.testRunner === right.testRunner &&
        left.linter === right.linter
      );
    case "javascript":
      return (
        right.language === "javascript" &&
        left.packageManager === right.packageManager &&
        left.nodeVersion === right.nodeVersion &&
        left.testRunner === right.testRunner &&
        left.linter === right.linter
      );
    case "java":
      return (
        right.language === "java" &&
        left.packageManager === right.packageManager &&
        left.languageVersion === right.languageVersion &&
        left.linter === right.linter
      );
    case "python":
      return (
        right.language === "python" &&
        left.packageManager === right.packageManager &&
        left.languageVersion === right.languageVersion &&
        left.testRunner === right.testRunner &&
        left.linter === right.linter
      );
  }
}

export function stacksEqual(left: LanguageToolchain[], right: LanguageToolchain[]): boolean {
  return left.length === right.length && left.every((entry, index) => toolchainsEqual(entry, right[index]));
}
