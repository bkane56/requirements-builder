import type { ProjectConfig } from "./config";
import type { SectionId } from "./constants";

export type ModuleCategory = "business" | "general" | "delivery";

export type RequirementModule = {
  id: string;
  title: string;
  version: string;
  category: ModuleCategory;
  section: SectionId;
  file: string;
  appliesTo: (config: ProjectConfig) => boolean;
};

const always = () => true;
const fastOnly = (config: ProjectConfig) => config.mode === "fast";
const projectOnly = (config: ProjectConfig) => config.mode === "project";

// Array order is the stable output order within each section.
export const MODULES: RequirementModule[] = [
  {
    id: "business-core",
    title: "Business requirements handling",
    version: "1.0.0",
    category: "business",
    section: "business-objectives",
    file: "business/business-core.md",
    appliesTo: always,
  },
  {
    id: "engineering-core",
    title: "Engineering core standards",
    version: "1.0.0",
    category: "general",
    section: "stack",
    file: "general/engineering-core.md",
    appliesTo: always,
  },
  {
    id: "project-extended",
    title: "Project Mode extended sections",
    version: "1.0.0",
    category: "delivery",
    section: "architecture",
    file: "delivery/project-extended.md",
    appliesTo: projectOnly,
  },
  {
    id: "fast-delivery",
    title: "Fast Mode delivery plan",
    version: "1.0.0",
    category: "delivery",
    section: "implementation",
    file: "delivery/fast-delivery.md",
    appliesTo: fastOnly,
  },
  {
    id: "project-delivery",
    title: "Project Mode delivery plan",
    version: "1.0.0",
    category: "delivery",
    section: "implementation",
    file: "delivery/project-delivery.md",
    appliesTo: projectOnly,
  },
  {
    id: "definition-of-done",
    title: "Definition of Done",
    version: "1.0.0",
    category: "delivery",
    section: "done",
    file: "delivery/definition-of-done.md",
    appliesTo: always,
  },
];

export function resolveModules(config: ProjectConfig): RequirementModule[] {
  return MODULES.filter((module) => module.appliesTo(config));
}
