export const REQUIREMENT_SOURCES = ["user", "ai"] as const;
export const REQUIREMENT_STATUSES = ["confirmed", "proposed"] as const;
export const REQUIREMENTS_MODES = ["free-text", "structured"] as const;
export const CRITERION_SCOPES = ["project", "requirement"] as const;

export type RequirementSource = (typeof REQUIREMENT_SOURCES)[number];
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];
export type RequirementsMode = (typeof REQUIREMENTS_MODES)[number];
export type CriterionScope = (typeof CRITERION_SCOPES)[number];

export type FunctionalRequirement = {
  id: string;
  text: string;
  source: RequirementSource;
  status: RequirementStatus;
};

export type AcceptanceCriterion = {
  id: string;
  scope: CriterionScope;
  requirementIds: string[];
  text: string;
  source: RequirementSource;
  status: RequirementStatus;
};

export type RequirementsContent = {
  mode: RequirementsMode;
  nextFunctionalNumber: number;
  nextCriterionNumber: number;
  functionalRequirements: FunctionalRequirement[];
  acceptanceCriteria: AcceptanceCriterion[];
};

export function defaultRequirementsContent(): RequirementsContent {
  return {
    mode: "free-text",
    nextFunctionalNumber: 1,
    nextCriterionNumber: 1,
    functionalRequirements: [],
    acceptanceCriteria: [],
  };
}

export function requirementsOf(config: { requirementsContent?: RequirementsContent }): RequirementsContent {
  return config.requirementsContent ?? defaultRequirementsContent();
}

export function parseRequirementsContent(value: unknown): RequirementsContent | null {
  if (!isRecord(value)) return null;
  if (!includes(REQUIREMENTS_MODES, value.mode)) return null;
  if (!isCounter(value.nextFunctionalNumber) || !isCounter(value.nextCriterionNumber)) return null;
  const functionalRequirements = readFunctionalRequirements(value.functionalRequirements);
  const acceptanceCriteria = readAcceptanceCriteria(value.acceptanceCriteria);
  if (!functionalRequirements || !acceptanceCriteria) return null;
  const requirementIds = new Set(functionalRequirements.map((item) => item.id));
  if (requirementIds.size !== functionalRequirements.length) return null;
  if (new Set(acceptanceCriteria.map((item) => item.id)).size !== acceptanceCriteria.length) return null;
  for (const criterion of acceptanceCriteria) {
    if (criterion.scope === "project" && criterion.requirementIds.length > 0) return null;
    if (criterion.scope === "requirement" && criterion.requirementIds.length === 0) return null;
    if (new Set(criterion.requirementIds).size !== criterion.requirementIds.length) return null;
    if (criterion.requirementIds.some((id) => !requirementIds.has(id))) return null;
  }
  return normalizeRequirementsContent({
    mode: value.mode,
    nextFunctionalNumber: value.nextFunctionalNumber,
    nextCriterionNumber: value.nextCriterionNumber,
    functionalRequirements,
    acceptanceCriteria,
  });
}

export function formatRequirementId(prefix: "FR" | "AC", number: number): string {
  return `${prefix}-${String(number).padStart(3, "0")}`;
}

export function requirementIdNumber(prefix: "FR" | "AC", id: string): number | null {
  const match = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
  if (!match || match[1].length < 3) return null;
  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1) return null;
  return formatRequirementId(prefix, number) === id ? number : null;
}

export function normalizeRequirementsContent(content: RequirementsContent): RequirementsContent {
  const functionalRequirements = sortById(content.functionalRequirements, "FR").map((item) => ({ ...item }));
  const acceptanceCriteria = sortById(content.acceptanceCriteria, "AC").map((item) => ({
    ...item,
    requirementIds: [...item.requirementIds].sort((left, right) => compareIds("FR", left, right)),
  }));
  return {
    mode: content.mode,
    functionalRequirements,
    acceptanceCriteria,
    nextFunctionalNumber: raisedCounter(content.nextFunctionalNumber, functionalRequirements, "FR"),
    nextCriterionNumber: raisedCounter(content.nextCriterionNumber, acceptanceCriteria, "AC"),
  };
}

export function requirementsContentEqual(left: RequirementsContent, right: RequirementsContent): boolean {
  return JSON.stringify(normalizeRequirementsContent(left)) === JSON.stringify(normalizeRequirementsContent(right));
}

export function addFunctionalRequirement(content: RequirementsContent, text = ""): RequirementsContent {
  const current = normalizeRequirementsContent(content);
  const id = formatRequirementId("FR", current.nextFunctionalNumber);
  return normalizeRequirementsContent({
    ...current,
    nextFunctionalNumber: current.nextFunctionalNumber + 1,
    functionalRequirements: [
      ...current.functionalRequirements,
      { id, text, source: "user", status: "confirmed" },
    ],
  });
}

export function updateFunctionalRequirement(
  content: RequirementsContent,
  id: string,
  patch: Partial<Pick<FunctionalRequirement, "text" | "status">>,
): RequirementsContent {
  return {
    ...content,
    functionalRequirements: content.functionalRequirements.map((item) =>
      item.id === id ? { ...item, ...patch, id: item.id, source: item.source } : item,
    ),
  };
}

export function criteriaLinking(content: RequirementsContent, requirementId: string): AcceptanceCriterion[] {
  return content.acceptanceCriteria.filter((item) => item.requirementIds.includes(requirementId));
}

export function removeFunctionalRequirement(content: RequirementsContent, id: string): RequirementsContent {
  return {
    ...content,
    functionalRequirements: content.functionalRequirements.filter((item) => item.id !== id),
    acceptanceCriteria: content.acceptanceCriteria.map((item) => {
      if (!item.requirementIds.includes(id)) return item;
      const requirementIds = item.requirementIds.filter((requirementId) => requirementId !== id);
      if (item.scope === "requirement" && requirementIds.length === 0) {
        return { ...item, scope: "project", requirementIds };
      }
      return { ...item, requirementIds };
    }),
  };
}

export function addAcceptanceCriterion(
  content: RequirementsContent,
  input: { scope: CriterionScope; text?: string; requirementIds?: string[] },
): RequirementsContent {
  const current = normalizeRequirementsContent(content);
  const id = formatRequirementId("AC", current.nextCriterionNumber);
  const criterion: AcceptanceCriterion = {
    id,
    scope: input.scope,
    text: input.text ?? "",
    source: "user",
    status: "confirmed",
    requirementIds: input.scope === "project" ? [] : [...(input.requirementIds ?? [])],
  };
  return normalizeRequirementsContent({
    ...current,
    nextCriterionNumber: current.nextCriterionNumber + 1,
    acceptanceCriteria: [...current.acceptanceCriteria, criterion],
  });
}

export function updateAcceptanceCriterion(
  content: RequirementsContent,
  id: string,
  patch: Partial<Pick<AcceptanceCriterion, "text" | "status" | "scope" | "requirementIds">>,
): RequirementsContent {
  return {
    ...content,
    acceptanceCriteria: content.acceptanceCriteria.map((item) => {
      if (item.id !== id) return item;
      const scope = patch.scope ?? item.scope;
      const requirementIds = scope === "project" ? [] : (patch.requirementIds ?? item.requirementIds);
      return { ...item, ...patch, id: item.id, source: item.source, scope, requirementIds };
    }),
  };
}

export function removeAcceptanceCriterion(content: RequirementsContent, id: string): RequirementsContent {
  return {
    ...content,
    acceptanceCriteria: content.acceptanceCriteria.filter((item) => item.id !== id),
  };
}

export function beginStructuredRequirements(
  content: RequirementsContent,
  choice: "copy" | "empty",
  businessRequirements: string,
  acceptanceCriteria: string,
): RequirementsContent {
  const current = { ...normalizeRequirementsContent(content), mode: "structured" as const };
  if (choice === "empty") return current;
  if (current.functionalRequirements.length > 0 || current.acceptanceCriteria.length > 0) return current;
  let next: RequirementsContent = current;
  if (!isBlank(businessRequirements)) next = addFunctionalRequirement(next, businessRequirements);
  if (!isBlank(acceptanceCriteria)) {
    next = addAcceptanceCriterion(next, { scope: "project", text: acceptanceCriteria });
  }
  return next;
}

export function returnToFreeTextRequirements(content: RequirementsContent): RequirementsContent {
  return { ...content, mode: "free-text" };
}

export function confirmedFunctionalRequirements(content: RequirementsContent): FunctionalRequirement[] {
  return normalizeRequirementsContent(content).functionalRequirements.filter(
    (item) => item.status === "confirmed" && !isBlank(item.text),
  );
}

export function confirmedAcceptanceCriteria(content: RequirementsContent): AcceptanceCriterion[] {
  return normalizeRequirementsContent(content).acceptanceCriteria.filter(
    (item) => item.status === "confirmed" && !isBlank(item.text),
  );
}

export function formatFunctionalEntries(items: FunctionalRequirement[]): string {
  return items.map((item) => `**${item.id}.**${provenance(item)} ${item.text}`).join("\n\n");
}

export function formatAcceptanceEntries(items: AcceptanceCriterion[]): string {
  return items
    .map((item) => `**${item.id}.**${provenance(item)} ${item.text}\n${appliesTo(item)}`)
    .join("\n\n");
}

export function uncoveredRequirementIds(content: RequirementsContent): string[] {
  const criteria = confirmedAcceptanceCriteria(content).filter((item) => item.scope === "requirement");
  if (criteria.length === 0) return [];
  const covered = new Set(criteria.flatMap((item) => item.requirementIds));
  return confirmedFunctionalRequirements(content)
    .map((item) => item.id)
    .filter((id) => !covered.has(id));
}

export function uncoveredRequirementQuestion(id: string): string {
  return `Which acceptance criterion applies to ${id}? None references it.`;
}

function provenance(item: { source: RequirementSource }): string {
  return item.source === "ai" ? " (approved AI proposal)" : "";
}

function appliesTo(item: AcceptanceCriterion): string {
  if (item.scope === "project") return "Applies to the whole project.";
  return `Applies to ${item.requirementIds.join(", ")}.`;
}

function sortById<T extends { id: string }>(items: T[], prefix: "FR" | "AC"): T[] {
  return [...items].sort((left, right) => compareIds(prefix, left.id, right.id));
}

function compareIds(prefix: "FR" | "AC", left: string, right: string): number {
  const leftNumber = requirementIdNumber(prefix, left);
  const rightNumber = requirementIdNumber(prefix, right);
  if (leftNumber === null || rightNumber === null) return left.localeCompare(right);
  return leftNumber - rightNumber;
}

function raisedCounter(stored: number, items: { id: string }[], prefix: "FR" | "AC"): number {
  const highest = items.reduce((max, item) => {
    const number = requirementIdNumber(prefix, item.id);
    return number === null ? max : Math.max(max, number);
  }, 0);
  return Math.max(stored, highest + 1);
}

function readFunctionalRequirements(value: unknown): FunctionalRequirement[] | null {
  if (!Array.isArray(value)) return null;
  const items: FunctionalRequirement[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.text !== "string") return null;
    if (typeof entry.id !== "string" || requirementIdNumber("FR", entry.id) === null) return null;
    if (!includes(REQUIREMENT_SOURCES, entry.source) || !includes(REQUIREMENT_STATUSES, entry.status)) return null;
    items.push({ id: entry.id, text: entry.text, source: entry.source, status: entry.status });
  }
  return items;
}

function readAcceptanceCriteria(value: unknown): AcceptanceCriterion[] | null {
  if (!Array.isArray(value)) return null;
  const items: AcceptanceCriterion[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.text !== "string" || !Array.isArray(entry.requirementIds)) return null;
    if (typeof entry.id !== "string" || requirementIdNumber("AC", entry.id) === null) return null;
    if (!includes(CRITERION_SCOPES, entry.scope)) return null;
    if (!includes(REQUIREMENT_SOURCES, entry.source) || !includes(REQUIREMENT_STATUSES, entry.status)) return null;
    if (!entry.requirementIds.every((id) => typeof id === "string")) return null;
    items.push({
      id: entry.id,
      scope: entry.scope,
      requirementIds: entry.requirementIds,
      text: entry.text,
      source: entry.source,
      status: entry.status,
    });
  }
  return items;
}

function isCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}
