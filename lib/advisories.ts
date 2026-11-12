import type { ProjectConfig } from "./config";
import { hasBackendSelection, hasUserInterface } from "./selection-rules";
import { UI_TEXT } from "./ui-text";

export const ADVISORY_IDS = ["integration-tests-http-fullstack"] as const;

export type AdvisoryId = (typeof ADVISORY_IDS)[number];
export type AdvisorySeverity = "info" | "recommendation";
export type AdvisoryField = "integrationTests";

export type ConfigurationAdvisory = {
  id: AdvisoryId;
  severity: AdvisorySeverity;
  message: string;
  field?: AdvisoryField;
};

export function evaluateAdvisories(config: ProjectConfig): ConfigurationAdvisory[] {
  if (
    config.appType === "web-app" &&
    hasUserInterface(config) &&
    config.exposesApi &&
    hasBackendSelection(config) &&
    !config.modules.integrationTests
  ) {
    return [
      {
        id: "integration-tests-http-fullstack",
        severity: "recommendation",
        message: UI_TEXT.advisories.integrationTestsHttpFullStack,
        field: "integrationTests",
      },
    ];
  }
  return [];
}
