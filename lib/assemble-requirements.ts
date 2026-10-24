import type { ProjectConfig } from "./config";
import {
  MISSING_TEXT,
  MODE_LABELS,
  NO_STRETCH_GOALS,
  OPEN_QUESTIONS,
  SECTIONS,
  USER_CONTENT_HEADING,
  type SectionId,
} from "./constants";
import type { Templates } from "./load-templates";
import { resolveModules, type RequirementModule } from "./module-registry";

const UNRESOLVED_PLACEHOLDER = /\{\{[^}]*\}\}/;

const isBlank = (value: string) => value.trim().length === 0;

// User-entered text is inserted verbatim: never trimmed, escaped, or substituted.
function userBlocks(sectionId: SectionId, config: ProjectConfig, modules: RequirementModule[]): string[] {
  switch (sectionId) {
    case "metadata": {
      const summary = [
        `- Project name: ${config.projectName}`,
        `- Mode: ${MODE_LABELS[config.mode]}`,
        "- Assembly: deterministic, generated without AI",
      ].join("\n");
      return isBlank(config.description)
        ? [summary]
        : [summary, "### Description (user-provided)", config.description];
    }
    case "functional":
      return [
        `### ${USER_CONTENT_HEADING}`,
        isBlank(config.businessRequirements) ? MISSING_TEXT.businessRequirements : config.businessRequirements,
      ];
    case "acceptance":
      return [
        `### ${USER_CONTENT_HEADING}`,
        isBlank(config.acceptanceCriteria) ? MISSING_TEXT.acceptanceCriteria : config.acceptanceCriteria,
      ];
    case "assumptions": {
      const questions: string[] = [];
      if (isBlank(config.businessRequirements)) questions.push(OPEN_QUESTIONS.businessRequirements);
      if (isBlank(config.acceptanceCriteria)) questions.push(OPEN_QUESTIONS.acceptanceCriteria);
      return questions.length === 0
        ? []
        : ["### Open questions", questions.map((question) => `- ${question}`).join("\n")];
    }
    case "implementation":
      return [
        "### Stretch goals (user-provided)",
        isBlank(config.stretchGoals) ? NO_STRETCH_GOALS : config.stretchGoals,
      ];
    case "modules":
      return [
        modules.map((module) => `- \`${module.id}\` v${module.version}: ${module.title}`).join("\n"),
      ];
    default:
      return [];
  }
}

function moduleBlock(module: RequirementModule, templates: Templates): string {
  const content = templates[module.id];
  if (content === undefined) {
    throw new Error(`Missing template for module "${module.id}".`);
  }
  if (UNRESOLVED_PLACEHOLDER.test(content)) {
    throw new Error(`Template for module "${module.id}" contains an unresolved placeholder.`);
  }
  return `### Module: \`${module.id}\` v${module.version}\n\n${content.trimEnd()}`;
}

export function assembleRequirements(config: ProjectConfig, templates: Templates): string {
  const modules = resolveModules(config);
  const parts = ["# Project Requirements"];

  for (const section of SECTIONS) {
    const blocks = [
      ...userBlocks(section.id, config, modules),
      ...modules
        .filter((module) => module.section === section.id)
        .map((module) => moduleBlock(module, templates)),
    ];
    if (blocks.length > 0) {
      parts.push(`## ${section.title}`, ...blocks);
    }
  }

  return `${parts.join("\n\n")}\n`;
}
