import {
  COVERAGE_DEFAULTS,
  OPTIONAL_MODULES,
  type AppType,
  type BackendFramework,
  type LanguageToolchain,
  type Mode,
  type OptionalModule,
  type Runtime,
  type UiFramework,
} from "./constants";
import {
  defaultRequirementsContent,
  requirementsContentEqual,
  requirementsOf,
  type RequirementsContent,
} from "./requirements-content";
import { stacksEqual } from "./toolchain";
import { uiFrameworksEqual } from "./ui-framework";

export type ProjectConfig = {
  projectName: string;
  description: string;
  businessRequirements: string;
  acceptanceCriteria: string;
  stretchGoals: string;
  requirementsContent?: RequirementsContent;
  mode: Mode;
  appType: AppType;
  uiLanguages: LanguageToolchain[];
  backendLanguages: LanguageToolchain[];
  runtime: Runtime;
  backendFramework: BackendFramework;
  uiFrameworks: UiFramework[];
  exposesApi: boolean;
  modules: Record<OptionalModule, boolean>;
  coverage: { enabled: boolean; linePercent: number; branchPercent: number };
};

export const defaultConfig: ProjectConfig = {
  projectName: "",
  description: "",
  businessRequirements: "",
  acceptanceCriteria: "",
  stretchGoals: "",
  requirementsContent: defaultRequirementsContent(),
  mode: "fast",
  appType: "other",
  uiLanguages: [],
  backendLanguages: [],
  runtime: "none",
  backendFramework: "none",
  uiFrameworks: [],
  exposesApi: false,
  modules: {
    integrationTests: false,
    goldenDataset: true,
    persistence: false,
    security: true,
    openapi: false,
    postman: false,
  },
  coverage: { ...COVERAGE_DEFAULTS },
};

export function configsMatch(left: ProjectConfig, right: ProjectConfig): boolean {
  return (
    left.projectName === right.projectName &&
    left.description === right.description &&
    left.businessRequirements === right.businessRequirements &&
    left.acceptanceCriteria === right.acceptanceCriteria &&
    left.stretchGoals === right.stretchGoals &&
    requirementsContentEqual(requirementsOf(left), requirementsOf(right)) &&
    left.mode === right.mode &&
    left.appType === right.appType &&
    stacksEqual(left.uiLanguages, right.uiLanguages) &&
    stacksEqual(left.backendLanguages, right.backendLanguages) &&
    left.runtime === right.runtime &&
    left.backendFramework === right.backendFramework &&
    uiFrameworksEqual(left.uiFrameworks, right.uiFrameworks) &&
    left.exposesApi === right.exposesApi &&
    OPTIONAL_MODULES.every((key) => left.modules[key] === right.modules[key]) &&
    left.coverage.enabled === right.coverage.enabled &&
    Object.is(left.coverage.linePercent, right.coverage.linePercent) &&
    Object.is(left.coverage.branchPercent, right.coverage.branchPercent)
  );
}
