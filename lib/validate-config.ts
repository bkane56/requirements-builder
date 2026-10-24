import type { ProjectConfig } from "./config";
import { INPUT_LIMITS } from "./constants";

export type ValidationErrors = Partial<Record<keyof ProjectConfig, string>>;

const isBlank = (value: string) => value.trim().length === 0;

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

  return errors;
}

export function hasErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}
