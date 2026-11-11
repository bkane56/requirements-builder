import type { ProjectConfig } from "./config";
import { API_MODULES, APP_TYPE_LABELS, FIXED_API_BY_APP_TYPE, INPUT_LIMITS } from "./constants";
import { allowedBackendFrameworks, allowedRuntimes } from "./selection-rules";
import { isLegalStack } from "./toolchain";
import { isLegalUiFrameworks } from "./ui-framework";
import { VALIDATION_TEXT } from "./ui-text";

// Line and branch targets are separate keys so each input can be marked and focused on its own.
export type ValidationErrors = Partial<
  Record<Exclude<keyof ProjectConfig, "coverage"> | "linePercent" | "branchPercent", string>
>;

const isBlank = (value: string) => value.trim().length === 0;

const isPercent = (value: number) => Number.isInteger(value) && value >= 0 && value <= 100;

const BACKEND_FRAMEWORK_ERRORS = {
  "spring-boot": VALIDATION_TEXT.springBoot,
  fastapi: VALIDATION_TEXT.fastapi,
  "nodejs-api": VALIDATION_TEXT.nodeApi,
} as const;

function validateSelections(config: ProjectConfig, errors: ValidationErrors) {
  const fixedApi = FIXED_API_BY_APP_TYPE[config.appType];
  if (fixedApi !== undefined && config.exposesApi !== fixedApi) {
    errors.exposesApi = fixedApi
      ? VALIDATION_TEXT.httpApiRequired(APP_TYPE_LABELS[config.appType])
      : VALIDATION_TEXT.httpApiForbidden(APP_TYPE_LABELS[config.appType]);
  }

  if (config.appType !== "web-app" && config.uiLanguages.length > 0) {
    errors.uiLanguages = VALIDATION_TEXT.uiLanguagesOnlyWebApp;
  } else if (!isLegalStack(config.uiLanguages, "ui")) {
    errors.uiLanguages = VALIDATION_TEXT.uiLanguages;
  }

  if (!isLegalStack(config.backendLanguages, "backend")) {
    errors.backendLanguages = VALIDATION_TEXT.backendLanguages;
  }

  if (!allowedRuntimes(config).includes(config.runtime)) {
    errors.runtime = VALIDATION_TEXT.nodeRuntime;
  }

  if (config.backendFramework !== "none" && !allowedBackendFrameworks(config).includes(config.backendFramework)) {
    errors.backendFramework = BACKEND_FRAMEWORK_ERRORS[config.backendFramework];
  }

  if (config.appType !== "web-app" && config.uiFrameworks.length > 0) {
    errors.uiFrameworks = VALIDATION_TEXT.uiFrameworksOnlyWebApp;
  } else if (!isLegalUiFrameworks(config.uiFrameworks)) {
    errors.uiFrameworks = VALIDATION_TEXT.uiFrameworks;
  }

  if (!config.exposesApi && API_MODULES.some((key) => config.modules[key])) {
    errors.modules = VALIDATION_TEXT.apiModulesRequireApi;
  }

  if (config.coverage.enabled) {
    if (!isPercent(config.coverage.linePercent)) {
      errors.linePercent = VALIDATION_TEXT.lineCoverage;
    }
    if (!isPercent(config.coverage.branchPercent)) {
      errors.branchPercent = VALIDATION_TEXT.branchCoverage;
    }
  }
}

export function validateConfig(config: ProjectConfig): ValidationErrors {
  const errors: ValidationErrors = {};

  if (isBlank(config.projectName)) {
    errors.projectName = VALIDATION_TEXT.projectNameRequired;
  } else if (config.projectName.length > INPUT_LIMITS.projectName) {
    errors.projectName = VALIDATION_TEXT.projectNameTooLong(INPUT_LIMITS.projectName);
  }

  if (config.description.length > INPUT_LIMITS.description) {
    errors.description = VALIDATION_TEXT.descriptionTooLong(INPUT_LIMITS.description);
  }

  if (isBlank(config.businessRequirements)) {
    errors.businessRequirements = VALIDATION_TEXT.businessRequirementsRequired;
  } else if (config.businessRequirements.length > INPUT_LIMITS.longText) {
    errors.businessRequirements = VALIDATION_TEXT.businessRequirementsTooLong(INPUT_LIMITS.longText);
  }

  if (config.acceptanceCriteria.length > INPUT_LIMITS.longText) {
    errors.acceptanceCriteria = VALIDATION_TEXT.acceptanceCriteriaTooLong(INPUT_LIMITS.longText);
  }

  if (config.stretchGoals.length > INPUT_LIMITS.longText) {
    errors.stretchGoals = VALIDATION_TEXT.stretchGoalsTooLong(INPUT_LIMITS.longText);
  }

  validateSelections(config, errors);

  return errors;
}

export function hasErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}
