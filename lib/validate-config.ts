import type { ProjectConfig } from "./config";
import { API_MODULES, APP_TYPE_LABELS, FIXED_API_BY_APP_TYPE, INPUT_LIMITS } from "./constants";
import { allowedBackendFrameworks, allowedRuntimes } from "./selection-rules";
import {
  confirmedFunctionalRequirements,
  requirementIdNumber,
  requirementsOf,
  type AcceptanceCriterion,
  type FunctionalRequirement,
  type RequirementStatus,
} from "./requirements-content";
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
  } else if (config.appType === "web-app" && config.uiFrameworks.length > 0 && config.uiLanguages.length === 0) {
    errors.uiLanguages = VALIDATION_TEXT.uiLanguageRequired;
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

  const requirements = requirementsOf(config);
  if (requirements.mode !== "structured" && isBlank(config.businessRequirements)) {
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
  if (requirements.mode === "structured") {
    const message = requirementsContentError(config);
    if (message) errors.requirementsContent = message;
  }

  return errors;
}

export type StructuredItemError = {
  message: string;
  blocking: boolean;
};

type ItemIssue = StructuredItemError & { id: string };

export function requirementsItemErrors(config: ProjectConfig): Record<string, StructuredItemError> {
  const errors: Record<string, StructuredItemError> = {};
  for (const issue of structuredIssues(config)) {
    if (errors[issue.id]) continue;
    errors[issue.id] = { message: issue.message, blocking: issue.blocking };
  }
  return errors;
}

function requirementsContentError(config: ProjectConfig): string | undefined {
  const blocking = structuredIssues(config).find((issue) => issue.blocking);
  if (blocking) return blocking.message;
  if (confirmedFunctionalRequirements(requirementsOf(config)).length === 0) {
    return VALIDATION_TEXT.structuredRequirementRequired;
  }
  return undefined;
}

function structuredIssues(config: ProjectConfig): ItemIssue[] {
  const content = requirementsOf(config);
  if (content.mode !== "structured") return [];
  const issues: ItemIssue[] = [];
  const seenRequirements = new Set<string>();
  for (const item of content.functionalRequirements) {
    const issue = requirementIssue(item, seenRequirements);
    if (issue) issues.push({ id: item.id, ...issue });
  }
  const knownRequirementIds = new Set(content.functionalRequirements.map((item) => item.id));
  const seenCriteria = new Set<string>();
  for (const item of content.acceptanceCriteria) {
    const issue = criterionIssue(item, seenCriteria, knownRequirementIds);
    if (issue) issues.push({ id: item.id, ...issue });
  }
  return issues;
}

function requirementIssue(
  item: FunctionalRequirement,
  seen: Set<string>,
): StructuredItemError | undefined {
  const identifier = identifierIssue(item.id, "FR", seen);
  if (identifier) return { message: identifier, blocking: true };
  return textIssue(item);
}

function criterionIssue(
  item: AcceptanceCriterion,
  seen: Set<string>,
  knownRequirementIds: Set<string>,
): StructuredItemError | undefined {
  const identifier = identifierIssue(item.id, "AC", seen);
  if (identifier) return { message: identifier, blocking: true };
  const links = linkIssue(item, knownRequirementIds);
  if (links) return { message: links, blocking: true };
  return textIssue(item);
}

function identifierIssue(id: string, prefix: "FR" | "AC", seen: Set<string>): string | undefined {
  if (requirementIdNumber(prefix, id) === null) return VALIDATION_TEXT.invalidStructuredId(id);
  if (seen.has(id)) return VALIDATION_TEXT.duplicateStructuredId(id);
  seen.add(id);
  return undefined;
}

function linkIssue(item: AcceptanceCriterion, knownRequirementIds: Set<string>): string | undefined {
  if (item.scope === "project" && item.requirementIds.length > 0) return VALIDATION_TEXT.projectCriterionHasLinks(item.id);
  if (item.scope === "requirement" && item.requirementIds.length === 0) {
    return VALIDATION_TEXT.requirementCriterionNeedsLink(item.id);
  }
  const seenLinks = new Set<string>();
  for (const requirementId of item.requirementIds) {
    if (seenLinks.has(requirementId)) return VALIDATION_TEXT.duplicateCriterionLink(item.id, requirementId);
    seenLinks.add(requirementId);
    if (!knownRequirementIds.has(requirementId)) return VALIDATION_TEXT.criterionMissingRequirement(item.id, requirementId);
  }
  return undefined;
}

function textIssue(item: { id: string; text: string; status: RequirementStatus }): StructuredItemError | undefined {
  const blocking = item.status === "confirmed";
  if (isBlank(item.text)) return { message: VALIDATION_TEXT.structuredTextRequired(item.id), blocking };
  if (item.text.length > INPUT_LIMITS.longText) {
    return { message: VALIDATION_TEXT.structuredTextTooLong(item.id, INPUT_LIMITS.longText), blocking };
  }
  return undefined;
}

export function hasErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}
