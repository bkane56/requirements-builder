import {
  COVERAGE_DEFAULTS,
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
