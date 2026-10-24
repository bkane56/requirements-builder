import type { ProjectConfig } from "./config";
import type { SectionId } from "./constants";

export type ModuleCategory =
  | "business"
  | "general"
  | "language"
  | "runtime"
  | "backend"
  | "frontend"
  | "ai"
  | "data"
  | "testing"
  | "verification"
  | "api"
  | "security"
  | "delivery";

export type RequirementModule = {
  id: string;
  title: string;
  version: string;
  category: ModuleCategory;
  section: SectionId;
  file: string;
  appliesTo: (config: ProjectConfig) => boolean;
};

const always = () => true;

// Array order is the stable output order within each section.
export const MODULES: RequirementModule[] = [
  {
    id: "business-core",
    title: "Business requirements handling",
    version: "1.0.0",
    category: "business",
    section: "business-objectives",
    file: "business/business-core.md",
    appliesTo: always,
  },
  {
    id: "engineering-core",
    title: "Engineering core standards",
    version: "1.0.0",
    category: "general",
    section: "stack",
    file: "general/engineering-core.md",
    appliesTo: always,
  },
  {
    id: "java-17-maven",
    title: "Java 17 with Maven",
    version: "1.0.0",
    category: "language",
    section: "stack",
    file: "languages/java-17-maven.md",
    appliesTo: (config) => config.language === "java",
  },
  {
    id: "python-uv",
    title: "Python with uv",
    version: "1.0.0",
    category: "language",
    section: "stack",
    file: "languages/python-uv.md",
    appliesTo: (config) => config.language === "python",
  },
  {
    id: "typescript-yarn",
    title: "TypeScript with Yarn",
    version: "1.0.0",
    category: "language",
    section: "stack",
    file: "languages/typescript-yarn.md",
    appliesTo: (config) => config.language === "typescript",
  },
  {
    id: "javascript-yarn",
    title: "JavaScript with Yarn",
    version: "1.0.0",
    category: "language",
    section: "stack",
    file: "languages/javascript-yarn.md",
    appliesTo: (config) => config.language === "javascript",
  },
  {
    id: "nodejs-runtime",
    title: "Node.js runtime",
    version: "1.0.0",
    category: "runtime",
    section: "stack",
    file: "runtime/nodejs-runtime.md",
    appliesTo: (config) => config.runtime === "nodejs",
  },
  {
    id: "spring-boot",
    title: "Spring Boot service",
    version: "1.0.0",
    category: "backend",
    section: "stack",
    file: "frameworks/spring-boot.md",
    appliesTo: (config) => config.backendFramework === "spring-boot",
  },
  {
    id: "fastapi",
    title: "FastAPI service",
    version: "1.0.0",
    category: "backend",
    section: "stack",
    file: "frameworks/fastapi.md",
    appliesTo: (config) => config.backendFramework === "fastapi",
  },
  {
    id: "nodejs-api",
    title: "Node.js backend API",
    version: "1.0.0",
    category: "backend",
    section: "stack",
    file: "frameworks/nodejs-api.md",
    appliesTo: (config) => config.backendFramework === "nodejs-api",
  },
  {
    id: "nextjs-react",
    title: "Next.js and React frontend",
    version: "1.0.0",
    category: "frontend",
    section: "stack",
    file: "frameworks/nextjs-react.md",
    appliesTo: (config) => config.frontend === "nextjs",
  },
  {
    id: "react-vite",
    title: "React and Vite frontend",
    version: "1.0.0",
    category: "frontend",
    section: "stack",
    file: "frameworks/react-vite.md",
    appliesTo: (config) => config.frontend === "react-vite",
  },
  {
    id: "project-extended",
    title: "Project Mode extended sections",
    version: "1.0.0",
    category: "delivery",
    section: "architecture",
    file: "delivery/project-extended.md",
    appliesTo: (config) => config.mode === "project",
  },
  {
    id: "agent-tool-calling",
    title: "AI agent tool calling",
    version: "1.0.0",
    category: "ai",
    section: "architecture",
    file: "ai/agent-tool-calling.md",
    appliesTo: (config) => config.appType === "ai-agent",
  },
  {
    id: "golden-dataset",
    title: "Golden dataset",
    version: "1.0.0",
    category: "testing",
    section: "data",
    file: "testing/golden-dataset.md",
    appliesTo: (config) => config.modules.goldenDataset,
  },
  {
    id: "persistence-optional",
    title: "Persistence",
    version: "1.0.0",
    category: "data",
    section: "data",
    file: "data/persistence-optional.md",
    appliesTo: (config) => config.modules.persistence,
  },
  {
    id: "unit-tests",
    title: "Unit tests",
    version: "1.0.0",
    category: "testing",
    section: "testing",
    file: "testing/unit-tests.md",
    appliesTo: always,
  },
  {
    id: "integration-tests",
    title: "Integration tests",
    version: "1.0.0",
    category: "testing",
    section: "testing",
    file: "testing/integration-tests.md",
    appliesTo: (config) => config.modules.integrationTests,
  },
  {
    id: "coverage-targets",
    title: "Coverage targets",
    version: "1.0.0",
    category: "testing",
    section: "testing",
    file: "testing/coverage-targets.md",
    appliesTo: (config) => config.coverage.enabled,
  },
  {
    id: "local-build-run",
    title: "Local build and run verification",
    version: "1.0.0",
    category: "verification",
    section: "testing",
    file: "testing/local-build-run.md",
    appliesTo: always,
  },
  {
    id: "openapi-swagger",
    title: "Swagger / OpenAPI documentation",
    version: "1.0.0",
    category: "api",
    section: "api",
    file: "api/openapi-swagger.md",
    appliesTo: (config) => config.exposesApi && config.modules.openapi,
  },
  {
    id: "postman",
    title: "Postman collection",
    version: "1.0.0",
    category: "api",
    section: "api",
    file: "api/postman.md",
    appliesTo: (config) => config.exposesApi && config.modules.postman,
  },
  {
    id: "security-baseline",
    title: "Security baseline",
    version: "1.0.0",
    category: "security",
    section: "security",
    file: "security/security-baseline.md",
    appliesTo: (config) => config.modules.security,
  },
  {
    id: "fast-delivery",
    title: "Fast Mode delivery plan and complexity constraints",
    version: "1.1.0",
    category: "delivery",
    section: "implementation",
    file: "delivery/fast-delivery.md",
    appliesTo: (config) => config.mode === "fast",
  },
  {
    id: "project-delivery",
    title: "Project Mode delivery plan",
    version: "1.0.0",
    category: "delivery",
    section: "implementation",
    file: "delivery/project-delivery.md",
    appliesTo: (config) => config.mode === "project",
  },
  {
    id: "definition-of-done",
    title: "Definition of Done",
    version: "1.0.0",
    category: "delivery",
    section: "done",
    file: "delivery/definition-of-done.md",
    appliesTo: always,
  },
];

export function resolveModules(config: ProjectConfig): RequirementModule[] {
  return MODULES.filter((module) => module.appliesTo(config));
}
