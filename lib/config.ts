import {
  COVERAGE_DEFAULTS,
  OPTIONAL_MODULES,
  type AppType,
  type BackendFramework,
  type Frontend,
  type Language,
  type Mode,
  type OptionalModule,
  type Runtime,
} from "./constants";

export type ProjectConfig = {
  projectName: string;
  description: string;
  businessRequirements: string;
  acceptanceCriteria: string;
  stretchGoals: string;
  mode: Mode;
  appType: AppType;
  language: Language;
  runtime: Runtime;
  backendFramework: BackendFramework;
  frontend: Frontend;
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
  mode: "fast",
  appType: "other",
  language: "other",
  runtime: "none",
  backendFramework: "none",
  frontend: "none",
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
    left.mode === right.mode &&
    left.appType === right.appType &&
    left.language === right.language &&
    left.runtime === right.runtime &&
    left.backendFramework === right.backendFramework &&
    left.frontend === right.frontend &&
    left.exposesApi === right.exposesApi &&
    OPTIONAL_MODULES.every((key) => left.modules[key] === right.modules[key]) &&
    left.coverage.enabled === right.coverage.enabled &&
    Object.is(left.coverage.linePercent, right.coverage.linePercent) &&
    Object.is(left.coverage.branchPercent, right.coverage.branchPercent)
  );
}
