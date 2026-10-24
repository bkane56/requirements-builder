import type { ProjectConfig } from "./config";
import { API_MODULES, APP_TYPE_LABELS, FIXED_API_BY_APP_TYPE, INPUT_LIMITS } from "./constants";
import { allowedBackendFrameworks, allowedFrontends, allowedRuntimes } from "./selection-rules";

export type ValidationErrors = Partial<Record<keyof ProjectConfig, string>>;

const isBlank = (value: string) => value.trim().length === 0;

const isPercent = (value: number) => Number.isInteger(value) && value >= 0 && value <= 100;

const BACKEND_FRAMEWORK_ERRORS = {
  "spring-boot": "Spring Boot requires Java and an HTTP API.",
  fastapi: "FastAPI requires Python and an HTTP API.",
  "nodejs-api": "The Node.js API module requires the Node.js runtime and an HTTP API.",
} as const;

function validateSelections(config: ProjectConfig, errors: ValidationErrors) {
  const fixedApi = FIXED_API_BY_APP_TYPE[config.appType];
  if (fixedApi !== undefined && config.exposesApi !== fixedApi) {
    errors.exposesApi = fixedApi
      ? `${APP_TYPE_LABELS[config.appType]} projects must include an HTTP API.`
      : `${APP_TYPE_LABELS[config.appType]} projects cannot include an HTTP API.`;
  }

  if (!allowedRuntimes(config).includes(config.runtime)) {
    errors.runtime = "The Node.js runtime requires TypeScript or JavaScript.";
  }

  if (config.backendFramework !== "none" && !allowedBackendFrameworks(config).includes(config.backendFramework)) {
    errors.backendFramework = BACKEND_FRAMEWORK_ERRORS[config.backendFramework];
  }

  if (!allowedFrontends(config).includes(config.frontend)) {
    errors.frontend =
      config.appType === "web-app"
        ? "Choose a frontend option for a Web App."
        : "Frontend frameworks apply only to Web App projects.";
  }

  if (!config.exposesApi && API_MODULES.some((key) => config.modules[key])) {
    errors.modules = "Swagger/OpenAPI and Postman require an HTTP API.";
  }

  if (config.coverage.enabled && !(isPercent(config.coverage.linePercent) && isPercent(config.coverage.branchPercent))) {
    errors.coverage = "Coverage targets must be whole numbers from 0 to 100.";
  }
}

export function validateConfig(config: ProjectConfig): ValidationErrors {
  const errors: ValidationErrors = {};

  if (isBlank(config.projectName)) {
    errors.projectName = "Project name is required.";
  } else if (config.projectName.length > INPUT_LIMITS.projectName) {
    errors.projectName = `Project name must be ${INPUT_LIMITS.projectName} characters or fewer.`;
  }

  if (config.description.length > INPUT_LIMITS.description) {
    errors.description = `Description must be ${INPUT_LIMITS.description} characters or fewer.`;
  }

  if (isBlank(config.businessRequirements)) {
    errors.businessRequirements = "Business requirements are required.";
  } else if (config.businessRequirements.length > INPUT_LIMITS.longText) {
    errors.businessRequirements = `Business requirements must be ${INPUT_LIMITS.longText} characters or fewer.`;
  }

  if (config.acceptanceCriteria.length > INPUT_LIMITS.longText) {
    errors.acceptanceCriteria = `Acceptance criteria must be ${INPUT_LIMITS.longText} characters or fewer.`;
  }

  if (config.stretchGoals.length > INPUT_LIMITS.longText) {
    errors.stretchGoals = `Stretch goals must be ${INPUT_LIMITS.longText} characters or fewer.`;
  }

  validateSelections(config, errors);

  return errors;
}

export function hasErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}
