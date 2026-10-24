import type { ProjectConfig } from "./config";
import {
  APP_TYPE_LABELS,
  BACKEND_FRAMEWORK_LABELS,
  DEFAULT_PACKAGE_MANAGERS,
  FRONTEND_LABELS,
  LANGUAGE_LABELS,
  MISSING_TEXT,
  MODE_LABELS,
  NO_STRETCH_GOALS,
  OPEN_QUESTIONS,
  RUNTIME_LABELS,
  SECTIONS,
  USER_CONTENT_HEADING,
  type SectionId,
} from "./constants";
import type { Templates } from "./load-templates";
import { resolveModules, type RequirementModule } from "./module-registry";

const PLACEHOLDER = /\{\{([^}]*)\}\}/g;

const isBlank = (value: string) => value.trim().length === 0;

function technologySummary(config: ProjectConfig): string[] {
  const packageManager = DEFAULT_PACKAGE_MANAGERS[config.language];
  return [
    `- Application type: ${APP_TYPE_LABELS[config.appType]}`,
    `- Language: ${LANGUAGE_LABELS[config.language]}`,
    ...(packageManager ? [`- Package manager: ${packageManager} (default for ${LANGUAGE_LABELS[config.language]})`] : []),
    ...(config.runtime !== "none" ? [`- Runtime: ${RUNTIME_LABELS[config.runtime]}`] : []),
    ...(config.backendFramework !== "none" ? [`- Backend framework: ${BACKEND_FRAMEWORK_LABELS[config.backendFramework]}`] : []),
    ...(config.frontend !== "none" ? [`- Frontend: ${FRONTEND_LABELS[config.frontend]}`] : []),
    `- HTTP API: ${config.exposesApi ? "Included" : "Not included"}`,
  ];
}

// User-entered text is inserted verbatim: never trimmed, escaped, or substituted.
function userBlocks(sectionId: SectionId, config: ProjectConfig, modules: RequirementModule[]): string[] {
  switch (sectionId) {
    case "metadata": {
      const summary = [
        `- Project name: ${config.projectName}`,
        `- Mode: ${MODE_LABELS[config.mode]}`,
        ...technologySummary(config),
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
      if (config.language === "other") questions.push(OPEN_QUESTIONS.language);
      if (config.frontend === "no-preference") questions.push(OPEN_QUESTIONS.frontend);
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

function placeholderValues(config: ProjectConfig): Record<string, string> {
  return {
    lineCoverage: String(config.coverage.linePercent),
    branchCoverage: String(config.coverage.branchPercent),
  };
}

// Single pass, so substituted values are never re-scanned for placeholders.
function fillPlaceholders(moduleId: string, content: string, values: Record<string, string>): string {
  return content.replace(PLACEHOLDER, (match, key: string) => {
    if (!Object.hasOwn(values, key)) {
      throw new Error(`Template for module "${moduleId}" contains an unresolved placeholder ${match}.`);
    }
    return values[key];
  });
}

function moduleBlock(module: RequirementModule, templates: Templates, values: Record<string, string>): string {
  const content = templates[module.id];
  if (content === undefined) {
    throw new Error(`Missing template for module "${module.id}".`);
  }
  const filled = fillPlaceholders(module.id, content, values);
  return `### Module: \`${module.id}\` v${module.version}\n\n${filled.trimEnd()}`;
}

export function assembleRequirements(config: ProjectConfig, templates: Templates): string {
  const modules = resolveModules(config);
  const values = placeholderValues(config);
  const parts = ["# Project Requirements"];

  for (const section of SECTIONS) {
    const blocks = [
      ...userBlocks(section.id, config, modules),
      ...modules
        .filter((module) => module.section === section.id)
        .map((module) => moduleBlock(module, templates, values)),
    ];
    if (blocks.length > 0) {
      parts.push(`## ${section.title}`, ...blocks);
    }
  }

  return `${parts.join("\n\n")}\n`;
}
