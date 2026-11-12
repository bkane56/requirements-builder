import {
  APP_TYPE_LABELS,
  BACKEND_FRAMEWORK_LABELS,
  LANGUAGE_LABELS,
  RUNTIME_LABELS,
  type AppType,
  type BackendFramework,
  type Language,
  type Mode,
  type OptionalModule,
  type Runtime,
  type UiFramework,
} from "../constants";
import {
  requirementsOf,
  type CriterionScope,
  type RequirementSource,
  type RequirementsContent,
  type RequirementStatus,
} from "../requirements-content";
import { uiFrameworkSummary } from "../ui-framework";

export type AnalysisRequirements =
  | {
      kind: "free-text";
      businessRequirements: string;
      acceptanceCriteria: string;
    }
  | {
      kind: "structured";
      functionalRequirements: Array<{
        id: string;
        text: string;
        status: RequirementStatus;
        source: RequirementSource;
      }>;
      acceptanceCriteria: Array<{
        id: string;
        text: string;
        status: RequirementStatus;
        source: RequirementSource;
        scope: CriterionScope;
        requirementIds: string[];
      }>;
    };

export type AnalysisInput = {
  projectName: string;
  description: string;
  documentMode: Mode;
  requirements: AnalysisRequirements;
  stack: {
    applicationType: string;
    uiLanguages: string[];
    uiFrameworks: string[];
    backendLanguages: string[];
    runtime: string;
    backendFramework: string;
    httpApi: boolean;
    modules: Record<OptionalModule, boolean>;
  };
};

export type AnalysisSource = {
  projectName: string;
  description: string;
  businessRequirements: string;
  acceptanceCriteria: string;
  mode: Mode;
  appType: AppType;
  uiLanguages: readonly { language: Language }[];
  backendLanguages: readonly { language: Language }[];
  runtime: Runtime;
  backendFramework: BackendFramework;
  uiFrameworks: readonly UiFramework[];
  exposesApi: boolean;
  modules: Record<OptionalModule, boolean>;
  requirementsContent?: RequirementsContent;
};

export function buildAnalysisInput(config: AnalysisSource): AnalysisInput {
  const content = requirementsOf(config);
  const requirements: AnalysisRequirements =
    content.mode === "structured"
      ? {
          kind: "structured",
          functionalRequirements: content.functionalRequirements.map((item) => ({
            id: item.id,
            text: item.text,
            status: item.status,
            source: item.source,
          })),
          acceptanceCriteria: content.acceptanceCriteria.map((item) => ({
            id: item.id,
            text: item.text,
            status: item.status,
            source: item.source,
            scope: item.scope,
            requirementIds: [...item.requirementIds],
          })),
        }
      : {
          kind: "free-text",
          businessRequirements: config.businessRequirements,
          acceptanceCriteria: config.acceptanceCriteria,
        };

  return {
    projectName: config.projectName,
    description: config.description,
    documentMode: config.mode,
    requirements,
    stack: {
      applicationType: APP_TYPE_LABELS[config.appType],
      uiLanguages: config.uiLanguages.map((entry) => LANGUAGE_LABELS[entry.language]),
      uiFrameworks: config.uiFrameworks.map((entry) => uiFrameworkSummary(entry)),
      backendLanguages: config.backendLanguages.map((entry) => LANGUAGE_LABELS[entry.language]),
      runtime: RUNTIME_LABELS[config.runtime],
      backendFramework: BACKEND_FRAMEWORK_LABELS[config.backendFramework],
      httpApi: config.exposesApi,
      modules: moduleFlags(config.modules),
    },
  };
}

export function analysisFingerprint(input: AnalysisInput): string {
  return JSON.stringify(input);
}

export function analysisRequirementIds(input: AnalysisInput): ReadonlySet<string> {
  if (input.requirements.kind === "free-text") return new Set();
  return new Set([
    ...input.requirements.functionalRequirements.map((item) => item.id),
    ...input.requirements.acceptanceCriteria.map((item) => item.id),
  ]);
}

export type AnalysisApplyDecision = "current" | "stale" | "ignore";

export function decideAnalysisUpdate(input: {
  requestId: number;
  latestStartedId: number;
  latestAppliedId: number;
  responseFingerprint: string;
  currentFingerprint: string;
}): AnalysisApplyDecision {
  if (input.requestId < input.latestAppliedId) return "ignore";
  if (input.requestId !== input.latestStartedId) return "ignore";
  if (input.responseFingerprint !== input.currentFingerprint) return "stale";
  return "current";
}

function moduleFlags(modules: Record<OptionalModule, boolean>): Record<OptionalModule, boolean> {
  return {
    integrationTests: modules.integrationTests,
    goldenDataset: modules.goldenDataset,
    persistence: modules.persistence,
    security: modules.security,
    openapi: modules.openapi,
    postman: modules.postman,
  };
}
