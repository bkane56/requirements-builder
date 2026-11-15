import { requirementIdNumber, type CriterionScope } from "../requirements-content";

export const WRITING_LIMITS = {
  newFunctional: 12,
  revisedFunctional: 8,
  newCriteria: 12,
  revisedCriteria: 8,
  questions: 8,
  nestedCriteria: 3,
  text: 1000,
  rationale: 240,
  question: 240,
  uncertainty: 240,
  relatedIds: 20,
} as const;

export const WRITING_OUTPUT_TOKEN_BUDGET = 6000;

export const WRITING_SCHEMA_NAME = "requirements_writing";

export type NestedCriterion = {
  text: string;
  rationale: string;
};

export type WritingSuggestion =
  | {
      id: string;
      kind: "new-functional";
      text: string;
      rationale: string;
      uncertainty: string | null;
      nestedCriteria: NestedCriterion[];
    }
  | {
      id: string;
      kind: "revise-functional";
      targetId: string;
      text: string;
      rationale: string;
      uncertainty: string | null;
    }
  | {
      id: string;
      kind: "new-criterion";
      text: string;
      rationale: string;
      uncertainty: string | null;
      scope: CriterionScope;
      requirementIds: string[];
    }
  | {
      id: string;
      kind: "revise-criterion";
      targetId: string;
      text: string;
      rationale: string;
      uncertainty: string | null;
    }
  | {
      id: string;
      kind: "question";
      question: string;
      whyNeeded: string;
      relatedRequirementIds: string[];
    };

export type WritingResult = {
  suggestions: WritingSuggestion[];
  nextSuggestionNumber: number;
};

const TOP_KEYS = [
  "newFunctionalRequirements",
  "revisedFunctionalRequirements",
  "newAcceptanceCriteria",
  "revisedAcceptanceCriteria",
  "unresolvedQuestions",
] as const;

const NEW_FUNCTIONAL_KEYS = ["text", "rationale", "uncertainty", "acceptanceCriteria"] as const;
const NESTED_KEYS = ["text", "rationale"] as const;
const REVISED_KEYS = ["targetId", "text", "rationale", "uncertainty"] as const;
const NEW_CRITERION_KEYS = ["text", "scope", "requirementIds", "rationale", "uncertainty"] as const;
const QUESTION_KEYS = ["question", "whyNeeded", "relatedRequirementIds"] as const;

function lengthPattern(min: number, max: number): string {
  return `^[\\s\\S]{${min},${max}}$`;
}

function requiredText(max: number) {
  return { type: "string", pattern: lengthPattern(1, max) };
}

function optionalText(max: number) {
  return { anyOf: [requiredText(max), { type: "null" }] };
}

const requirementIdSchema = { type: "string", pattern: "^(FR|AC)-[0-9]{3,}$" };

export const WRITING_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...TOP_KEYS],
  properties: {
    newFunctionalRequirements: {
      type: "array",
      maxItems: WRITING_LIMITS.newFunctional,
      items: {
        type: "object",
        additionalProperties: false,
        required: [...NEW_FUNCTIONAL_KEYS],
        properties: {
          text: requiredText(WRITING_LIMITS.text),
          rationale: requiredText(WRITING_LIMITS.rationale),
          uncertainty: optionalText(WRITING_LIMITS.uncertainty),
          acceptanceCriteria: {
            type: "array",
            maxItems: WRITING_LIMITS.nestedCriteria,
            items: {
              type: "object",
              additionalProperties: false,
              required: [...NESTED_KEYS],
              properties: {
                text: requiredText(WRITING_LIMITS.text),
                rationale: requiredText(WRITING_LIMITS.rationale),
              },
            },
          },
        },
      },
    },
    revisedFunctionalRequirements: {
      type: "array",
      maxItems: WRITING_LIMITS.revisedFunctional,
      items: {
        type: "object",
        additionalProperties: false,
        required: [...REVISED_KEYS],
        properties: {
          targetId: { type: "string", pattern: "^FR-[0-9]{3,}$" },
          text: requiredText(WRITING_LIMITS.text),
          rationale: requiredText(WRITING_LIMITS.rationale),
          uncertainty: optionalText(WRITING_LIMITS.uncertainty),
        },
      },
    },
    newAcceptanceCriteria: {
      type: "array",
      maxItems: WRITING_LIMITS.newCriteria,
      items: {
        type: "object",
        additionalProperties: false,
        required: [...NEW_CRITERION_KEYS],
        properties: {
          text: requiredText(WRITING_LIMITS.text),
          scope: { type: "string", enum: ["project", "requirement"] },
          requirementIds: {
            type: "array",
            maxItems: WRITING_LIMITS.relatedIds,
            items: requirementIdSchema,
          },
          rationale: requiredText(WRITING_LIMITS.rationale),
          uncertainty: optionalText(WRITING_LIMITS.uncertainty),
        },
      },
    },
    revisedAcceptanceCriteria: {
      type: "array",
      maxItems: WRITING_LIMITS.revisedCriteria,
      items: {
        type: "object",
        additionalProperties: false,
        required: [...REVISED_KEYS],
        properties: {
          targetId: { type: "string", pattern: "^AC-[0-9]{3,}$" },
          text: requiredText(WRITING_LIMITS.text),
          rationale: requiredText(WRITING_LIMITS.rationale),
          uncertainty: optionalText(WRITING_LIMITS.uncertainty),
        },
      },
    },
    unresolvedQuestions: {
      type: "array",
      maxItems: WRITING_LIMITS.questions,
      items: {
        type: "object",
        additionalProperties: false,
        required: [...QUESTION_KEYS],
        properties: {
          question: requiredText(WRITING_LIMITS.question),
          whyNeeded: requiredText(WRITING_LIMITS.question),
          relatedRequirementIds: {
            type: "array",
            maxItems: WRITING_LIMITS.relatedIds,
            items: requirementIdSchema,
          },
        },
      },
    },
  },
};

export function writingResponseSchema(known: {
  functional: ReadonlyMap<string, string>;
  criteria: ReadonlyMap<string, string>;
}): object {
  const schema = structuredClone(WRITING_RESPONSE_SCHEMA);
  const functionalIds = [...known.functional.keys()].sort();
  const criterionIds = [...known.criteria.keys()].sort();
  const referenceIds = [...new Set([...functionalIds, ...criterionIds])].sort();
  constrainRevision(schema.properties.revisedFunctionalRequirements, functionalIds);
  constrainRevision(schema.properties.revisedAcceptanceCriteria, criterionIds);
  const questions = schema.properties.unresolvedQuestions.items.properties as {
    relatedRequirementIds: IdListSchema;
  };
  questions.relatedRequirementIds = idList(referenceIds);
  const criteria = schema.properties.newAcceptanceCriteria as { items: object };
  criteria.items = criterionItems(schema.properties.newAcceptanceCriteria.items, functionalIds);
  return schema;
}

function constrainRevision(
  array: { maxItems: number; items: { properties: { targetId: { type: string; pattern?: string; enum?: string[] } } } },
  ids: string[],
): void {
  if (ids.length === 0) {
    array.maxItems = 0;
    array.items.properties.targetId = { type: "string" };
    return;
  }
  array.items.properties.targetId = { type: "string", enum: ids };
}

type IdListSchema = {
  type: string;
  maxItems: number;
  minItems?: number;
  items: { type: string; pattern?: string; enum?: string[] };
};

function idList(ids: string[]): IdListSchema {
  if (ids.length === 0) return { type: "array", maxItems: 0, items: { type: "string" } };
  return { type: "array", maxItems: WRITING_LIMITS.relatedIds, items: { type: "string", enum: ids } };
}

function criterionItems(base: object, functionalIds: string[]): object {
  const project = structuredClone(base) as { properties: { scope: { type: string; enum?: string[] }; requirementIds: IdListSchema } };
  project.properties.scope = { type: "string", enum: ["project"] };
  project.properties.requirementIds = { type: "array", maxItems: 0, items: { type: "string" } };
  if (functionalIds.length === 0) return project;
  const linked = structuredClone(base) as typeof project;
  linked.properties.scope = { type: "string", enum: ["requirement"] };
  linked.properties.requirementIds = {
    type: "array",
    minItems: 1,
    maxItems: WRITING_LIMITS.relatedIds,
    items: { type: "string", enum: functionalIds },
  };
  return { anyOf: [project, linked] };
}

export function formatSuggestionId(number: number): string {
  return `W-${String(number).padStart(3, "0")}`;
}

export function parseWritingResult(
  value: unknown,
  known: { functional: ReadonlyMap<string, string>; criteria: ReadonlyMap<string, string> },
): WritingResult | null {
  if (!isRecord(value) || !sameKeys(value, TOP_KEYS)) return null;
  const functional = readNewFunctional(value.newFunctionalRequirements);
  const revisedFunctional = readRevisions(value.revisedFunctionalRequirements, "FR", known.functional);
  const criteria = readNewCriteria(value.newAcceptanceCriteria, known.functional);
  const revisedCriteria = readRevisions(value.revisedAcceptanceCriteria, "AC", known.criteria);
  const questions = readQuestions(value.unresolvedQuestions, known);
  if (!functional || !revisedFunctional || !criteria || !revisedCriteria || !questions) return null;
  const texts = existingTexts(known);
  if (hasDuplicateOrNoOp(functional, revisedFunctional, criteria, revisedCriteria, texts)) return null;
  const suggestions: WritingSuggestion[] = [];
  let number = 1;
  const assign = (suggestion: Omit<WritingSuggestion, "id">) => {
    suggestions.push({ ...suggestion, id: formatSuggestionId(number) } as WritingSuggestion);
    number += 1;
  };
  for (const item of functional) assign(item);
  for (const item of revisedFunctional) assign(item);
  for (const item of criteria) assign(item);
  for (const item of revisedCriteria) assign(item);
  for (const item of questions) assign(item);
  return { suggestions, nextSuggestionNumber: number };
}

export function writingSchemaFailure(
  value: unknown,
  known: { functional: ReadonlyMap<string, string>; criteria: ReadonlyMap<string, string> },
): string | null {
  if (!isRecord(value) || !sameKeys(value, TOP_KEYS)) return "result-shape";
  return (
    inspectNewFunctional(value.newFunctionalRequirements) ??
    inspectRevisions(value.revisedFunctionalRequirements, "FR", known.functional) ??
    inspectNewCriteria(value.newAcceptanceCriteria, known.functional) ??
    inspectRevisions(value.revisedAcceptanceCriteria, "AC", known.criteria) ??
    inspectQuestions(value.unresolvedQuestions, known) ??
    (parseWritingResult(value, known) === null ? "duplicate-text" : null)
  );
}

function readNewFunctional(value: unknown): Array<Omit<Extract<WritingSuggestion, { kind: "new-functional" }>, "id">> | null {
  if (!Array.isArray(value) || value.length > WRITING_LIMITS.newFunctional) return null;
  const items = [];
  for (const entry of value) {
    if (!isRecord(entry) || !sameKeys(entry, NEW_FUNCTIONAL_KEYS)) return null;
    const text = readBoundedText(entry.text, WRITING_LIMITS.text);
    const rationale = readBoundedText(entry.rationale, WRITING_LIMITS.rationale);
    const uncertainty = readNullableText(entry.uncertainty, WRITING_LIMITS.uncertainty);
    const nestedCriteria = readNested(entry.acceptanceCriteria);
    if (text === null || rationale === null || uncertainty === undefined || !nestedCriteria) return null;
    items.push({ kind: "new-functional" as const, text, rationale, uncertainty, nestedCriteria });
  }
  return items;
}

function readNested(value: unknown): NestedCriterion[] | null {
  if (!Array.isArray(value) || value.length > WRITING_LIMITS.nestedCriteria) return null;
  const items: NestedCriterion[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !sameKeys(entry, NESTED_KEYS)) return null;
    const text = readBoundedText(entry.text, WRITING_LIMITS.text);
    const rationale = readBoundedText(entry.rationale, WRITING_LIMITS.rationale);
    if (text === null || rationale === null) return null;
    items.push({ text, rationale });
  }
  return items;
}

function readRevisions(
  value: unknown,
  prefix: "FR" | "AC",
  known: ReadonlyMap<string, string>,
): Array<Omit<Extract<WritingSuggestion, { kind: "revise-functional" | "revise-criterion" }>, "id">> | null {
  const limit = prefix === "FR" ? WRITING_LIMITS.revisedFunctional : WRITING_LIMITS.revisedCriteria;
  if (!Array.isArray(value) || value.length > limit) return null;
  const kind = prefix === "FR" ? ("revise-functional" as const) : ("revise-criterion" as const);
  const items: Array<Omit<Extract<WritingSuggestion, { kind: "revise-functional" | "revise-criterion" }>, "id">> = [];
  const targets = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || !sameKeys(entry, REVISED_KEYS)) return null;
    if (typeof entry.targetId !== "string" || requirementIdNumber(prefix, entry.targetId) === null) return null;
    if (!known.has(entry.targetId) || targets.has(entry.targetId)) return null;
    const text = readBoundedText(entry.text, WRITING_LIMITS.text);
    const rationale = readBoundedText(entry.rationale, WRITING_LIMITS.rationale);
    const uncertainty = readNullableText(entry.uncertainty, WRITING_LIMITS.uncertainty);
    if (text === null || rationale === null || uncertainty === undefined) return null;
    if (text === known.get(entry.targetId)) return null;
    targets.add(entry.targetId);
    items.push({ kind, targetId: entry.targetId, text, rationale, uncertainty });
  }
  return items;
}

function readNewCriteria(
  value: unknown,
  functional: ReadonlyMap<string, string>,
): Array<Omit<Extract<WritingSuggestion, { kind: "new-criterion" }>, "id">> | null {
  if (!Array.isArray(value) || value.length > WRITING_LIMITS.newCriteria) return null;
  const items: Array<Omit<Extract<WritingSuggestion, { kind: "new-criterion" }>, "id">> = [];
  for (const entry of value) {
    if (!isRecord(entry) || !sameKeys(entry, NEW_CRITERION_KEYS)) return null;
    if (entry.scope !== "project" && entry.scope !== "requirement") return null;
    const scope: CriterionScope = entry.scope;
    const requirementIds = readLinks(entry.requirementIds, scope, functional);
    const text = readBoundedText(entry.text, WRITING_LIMITS.text);
    const rationale = readBoundedText(entry.rationale, WRITING_LIMITS.rationale);
    const uncertainty = readNullableText(entry.uncertainty, WRITING_LIMITS.uncertainty);
    if (!requirementIds || text === null || rationale === null || uncertainty === undefined) return null;
    items.push({ kind: "new-criterion" as const, text, rationale, uncertainty, scope, requirementIds });
  }
  return items;
}

function readQuestions(
  value: unknown,
  known: { functional: ReadonlyMap<string, string>; criteria: ReadonlyMap<string, string> },
): Array<Omit<Extract<WritingSuggestion, { kind: "question" }>, "id">> | null {
  if (!Array.isArray(value) || value.length > WRITING_LIMITS.questions) return null;
  const knownIds = new Set([...known.functional.keys(), ...known.criteria.keys()]);
  const items = [];
  for (const entry of value) {
    if (!isRecord(entry) || !sameKeys(entry, QUESTION_KEYS)) return null;
    const question = readBoundedText(entry.question, WRITING_LIMITS.question);
    const whyNeeded = readBoundedText(entry.whyNeeded, WRITING_LIMITS.question);
    const relatedRequirementIds = readKnownIds(entry.relatedRequirementIds, knownIds);
    if (question === null || whyNeeded === null || !relatedRequirementIds) return null;
    items.push({ kind: "question" as const, question, whyNeeded, relatedRequirementIds });
  }
  return items;
}

function readLinks(value: unknown, scope: CriterionScope, functional: ReadonlyMap<string, string>): string[] | null {
  const ids = readKnownIds(value, new Set(functional.keys()));
  if (!ids) return null;
  if (scope === "project") return ids.length === 0 ? ids : null;
  if (ids.length === 0) return null;
  return ids.every((id) => id.startsWith("FR-")) ? ids : null;
}

function readKnownIds(value: unknown, knownIds: ReadonlySet<string>): string[] | null {
  if (!Array.isArray(value) || value.length > WRITING_LIMITS.relatedIds) return null;
  const ids: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || (requirementIdNumber("FR", id) === null && requirementIdNumber("AC", id) === null)) return null;
    if (!knownIds.has(id)) return null;
    ids.push(id);
  }
  if (new Set(ids).size !== ids.length) return null;
  return ids;
}

function existingTexts(known: { functional: ReadonlyMap<string, string>; criteria: ReadonlyMap<string, string> }): Set<string> {
  return new Set([...known.functional.values(), ...known.criteria.values()]);
}

function hasDuplicateOrNoOp(
  functional: Array<{ text: string; nestedCriteria: NestedCriterion[] }>,
  revisedFunctional: Array<{ text: string }>,
  criteria: Array<{ text: string }>,
  revisedCriteria: Array<{ text: string }>,
  existing: Set<string>,
): boolean {
  const seen = new Set(existing);
  const proposals = [
    ...functional.flatMap((item) => [item.text, ...item.nestedCriteria.map((criterion) => criterion.text)]),
    ...revisedFunctional.map((item) => item.text),
    ...criteria.map((item) => item.text),
    ...revisedCriteria.map((item) => item.text),
  ];
  for (const text of proposals) {
    if (seen.has(text)) return true;
    seen.add(text);
  }
  return false;
}

function readBoundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > max) return null;
  return value;
}

function readNullableText(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > max) return undefined;
  return value;
}

function sameKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function inspectNewFunctional(value: unknown): string | null {
  if (!Array.isArray(value)) return "new-functional-type";
  if (value.length > WRITING_LIMITS.newFunctional) return "new-functional-count";
  for (const entry of value) {
    if (!isRecord(entry) || !sameKeys(entry, NEW_FUNCTIONAL_KEYS)) return "new-functional-keys";
    if (readBoundedText(entry.text, WRITING_LIMITS.text) === null) return "new-functional-text";
    if (readBoundedText(entry.rationale, WRITING_LIMITS.rationale) === null) return "new-functional-rationale";
    if (readNullableText(entry.uncertainty, WRITING_LIMITS.uncertainty) === undefined) return "new-functional-uncertainty";
    const nested = inspectNested(entry.acceptanceCriteria);
    if (nested) return nested;
  }
  return null;
}

function inspectNested(value: unknown): string | null {
  if (!Array.isArray(value)) return "nested-type";
  if (value.length > WRITING_LIMITS.nestedCriteria) return "nested-count";
  for (const entry of value) {
    if (!isRecord(entry) || !sameKeys(entry, NESTED_KEYS)) return "nested-keys";
    if (readBoundedText(entry.text, WRITING_LIMITS.text) === null) return "nested-text";
    if (readBoundedText(entry.rationale, WRITING_LIMITS.rationale) === null) return "nested-rationale";
  }
  return null;
}

function inspectRevisions(value: unknown, prefix: "FR" | "AC", known: ReadonlyMap<string, string>): string | null {
  const name = prefix === "FR" ? "revised-functional" : "revised-criterion";
  const limit = prefix === "FR" ? WRITING_LIMITS.revisedFunctional : WRITING_LIMITS.revisedCriteria;
  if (!Array.isArray(value)) return `${name}-type`;
  if (value.length > limit) return `${name}-count`;
  const targets = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || !sameKeys(entry, REVISED_KEYS)) return `${name}-keys`;
    if (typeof entry.targetId !== "string" || requirementIdNumber(prefix, entry.targetId) === null) return `${name}-target`;
    if (!known.has(entry.targetId)) return `${name}-unknown`;
    if (targets.has(entry.targetId)) return `${name}-duplicate`;
    if (readBoundedText(entry.text, WRITING_LIMITS.text) === null) return `${name}-text`;
    if (readBoundedText(entry.rationale, WRITING_LIMITS.rationale) === null) return `${name}-rationale`;
    if (readNullableText(entry.uncertainty, WRITING_LIMITS.uncertainty) === undefined) return `${name}-uncertainty`;
    if (entry.text === known.get(entry.targetId)) return `${name}-unchanged`;
    targets.add(entry.targetId);
  }
  return null;
}

function inspectNewCriteria(value: unknown, functional: ReadonlyMap<string, string>): string | null {
  if (!Array.isArray(value)) return "new-criterion-type";
  if (value.length > WRITING_LIMITS.newCriteria) return "new-criterion-count";
  for (const entry of value) {
    if (!isRecord(entry) || !sameKeys(entry, NEW_CRITERION_KEYS)) return "new-criterion-keys";
    if (entry.scope !== "project" && entry.scope !== "requirement") return "new-criterion-scope";
    const links = inspectLinks(entry.requirementIds, entry.scope, functional);
    if (links) return links;
    if (readBoundedText(entry.text, WRITING_LIMITS.text) === null) return "new-criterion-text";
    if (readBoundedText(entry.rationale, WRITING_LIMITS.rationale) === null) return "new-criterion-rationale";
    if (readNullableText(entry.uncertainty, WRITING_LIMITS.uncertainty) === undefined) return "new-criterion-uncertainty";
  }
  return null;
}

function inspectLinks(value: unknown, scope: CriterionScope, functional: ReadonlyMap<string, string>): string | null {
  const ids = inspectKnownIds(value, new Set(functional.keys()), "criterion-link");
  if (typeof ids === "string") return ids;
  if (scope === "project") return ids.length === 0 ? null : "criterion-project-links";
  if (ids.length === 0) return "criterion-missing-links";
  return ids.every((id) => id.startsWith("FR-")) ? null : "criterion-link-type";
}

function inspectQuestions(
  value: unknown,
  known: { functional: ReadonlyMap<string, string>; criteria: ReadonlyMap<string, string> },
): string | null {
  if (!Array.isArray(value)) return "question-type";
  if (value.length > WRITING_LIMITS.questions) return "question-count";
  const knownIds = new Set([...known.functional.keys(), ...known.criteria.keys()]);
  for (const entry of value) {
    if (!isRecord(entry) || !sameKeys(entry, QUESTION_KEYS)) return "question-keys";
    if (readBoundedText(entry.question, WRITING_LIMITS.question) === null) return "question-text";
    if (readBoundedText(entry.whyNeeded, WRITING_LIMITS.question) === null) return "question-reason";
    const related = inspectKnownIds(entry.relatedRequirementIds, knownIds, "question-related");
    if (typeof related === "string") return related;
  }
  return null;
}

function inspectKnownIds(value: unknown, knownIds: ReadonlySet<string>, name: string): string | string[] {
  if (!Array.isArray(value)) return `${name}-type`;
  if (value.length > WRITING_LIMITS.relatedIds) return `${name}-count`;
  const ids: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || (requirementIdNumber("FR", id) === null && requirementIdNumber("AC", id) === null)) {
      return `${name}-pattern`;
    }
    if (!knownIds.has(id)) return `${name}-unknown`;
    ids.push(id);
  }
  if (new Set(ids).size !== ids.length) return `${name}-duplicate`;
  return ids;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
