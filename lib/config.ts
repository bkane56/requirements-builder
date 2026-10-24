import type { Mode } from "./constants";

export type ProjectConfig = {
  projectName: string;
  description: string;
  businessRequirements: string;
  acceptanceCriteria: string;
  stretchGoals: string;
  mode: Mode;
};

export const defaultConfig: ProjectConfig = {
  projectName: "",
  description: "",
  businessRequirements: "",
  acceptanceCriteria: "",
  stretchGoals: "",
  mode: "fast",
};
