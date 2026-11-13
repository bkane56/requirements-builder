import { describe, expect, it } from "vitest";
import { INPUT_LIMITS } from "../lib/constants";
import { defaultRequirementsContent, type RequirementsContent } from "../lib/requirements-content";
import {
  applyRequirementChange,
  clarificationAnswersForWriting,
  emptyReviewSession,
  findingGroup,
  markReviewApplied,
  prepareRequirementChange,
  previewRequirementChange,
  reviewCounts,
  reviewKey,
  sessionHasReviewWork,
  setReviewAnswer,
  setReviewDecision,
  type RequirementDraft,
} from "../lib/ai/review";

function structured(): RequirementsContent {
  return {
    mode: "structured",
    nextFunctionalNumber: 3,
    nextCriterionNumber: 2,
    functionalRequirements: [
      { id: "FR-001", text: "Show the people list.", source: "user", status: "confirmed" },
      { id: "FR-002", text: "Maybe add a filter.", source: "ai", status: "proposed" },
    ],
    acceptanceCriteria: [
      {
        id: "AC-001",
        text: "The list is visible.",
        source: "ai",
        status: "confirmed",
        scope: "requirement",
        requirementIds: ["FR-001"],
      },
    ],
  };
}

const finding = {
  id: "F-001",
  question: "Which details are shown?",
  category: "ambiguity" as const,
};

describe("review records", () => {
  it("keeps decisions, exact answers, and run identity separate", () => {
    const first = emptyReviewSession(1, "fingerprint-a");
    const decided = setReviewDecision(first, "F-001", "addressed");
    const answered = setReviewAnswer(decided, "F-001", "  Name and role.\n");
    expect(answered).not.toBeNull();
    expect(reviewKey(1, "F-001")).toBe("1:F-001");
    expect(answered?.records["1:F-001"]).toEqual({
      decision: "addressed",
      answer: "  Name and role.\n",
    });
    expect(first.records).toEqual({});

    const second = setReviewDecision(emptyReviewSession(2, "fingerprint-b"), "F-001", "dismissed");
    expect(second.records["2:F-001"]?.decision).toBe("dismissed");
    expect(second.records["1:F-001"]).toBeUndefined();
    expect(sessionHasReviewWork(first)).toBe(false);
    expect(sessionHasReviewWork(answered!)).toBe(true);
    expect(reviewCounts(answered!, ["F-001", "F-002"])).toEqual({
      open: 1,
      addressed: 1,
      dismissed: 0,
      deferred: 0,
    });
  });

  it("preserves an answer for a later writing step and marks a stale run", () => {
    const session = setReviewAnswer(emptyReviewSession(4, "run-fingerprint"), "F-001", "  Name and role.\n");
    const withDeferred = setReviewDecision(session!, "F-002", "deferred");
    const current = clarificationAnswersForWriting(withDeferred, [finding, { id: "F-002", question: null }], "run-fingerprint");
    expect(current).toEqual([
      {
        requestId: 4,
        findingId: "F-001",
        fingerprint: "run-fingerprint",
        question: "Which details are shown?",
        answer: "  Name and role.\n",
        current: true,
      },
    ]);
    const stale = clarificationAnswersForWriting(withDeferred, [finding], "edited-fingerprint");
    expect(stale[0]?.current).toBe(false);
    expect(stale[0]?.answer).toBe("  Name and role.\n");
    expect(setReviewAnswer(emptyReviewSession(1, "fp"), "F-001", "x".repeat(INPUT_LIMITS.longText + 1))).toBeNull();
  });

  it("groups a question ahead of a contradiction category", () => {
    expect(findingGroup({ question: "What fails?", category: "contradiction" })).toBe("clarification");
    expect(findingGroup({ question: null, category: "stack_conflict" })).toBe("contradiction");
    expect(findingGroup({ question: null, category: "security_privacy" })).toBe("contradiction");
    expect(findingGroup({ question: null, category: "missing_detail" })).toBe("enhancement");
  });
});

describe("requirement changes", () => {
  function commit(content: RequirementsContent, draft: RequirementDraft) {
    const prepared = prepareRequirementChange(content, draft);
    if (!prepared) return null;
    return applyRequirementChange(content, draft, prepared);
  }

  it("creates a proposed user requirement without copying a suggestion", () => {
    const content = structured();
    const draft = { action: "create-functional" as const, text: "  A person has a name.\n" };
    expect(previewRequirementChange(content, draft)).toEqual({
      action: "create-functional",
      id: "FR-003",
      text: "  A person has a name.\n",
      source: "user",
      status: "proposed",
      scope: null,
      requirementIds: [],
      replacesConfirmed: false,
      currentText: null,
    });
    const next = commit(content, draft);
    expect(next?.functionalRequirements[2]).toEqual({
      id: "FR-003",
      text: "  A person has a name.\n",
      source: "user",
      status: "proposed",
    });
    expect(next?.nextFunctionalNumber).toBe(4);
    expect(content.functionalRequirements).toHaveLength(2);
    expect(content.functionalRequirements[0]?.text).toBe("Show the people list.");
  });

  it("creates a linked proposed criterion and rejects invalid links", () => {
    const content = structured();
    const draft = {
      action: "create-criterion" as const,
      text: "An unknown person shows a not-found state.",
      scope: "requirement" as const,
      requirementIds: ["FR-001"],
    };
    const next = commit(content, draft);
    expect(next?.acceptanceCriteria[1]).toMatchObject({
      id: "AC-002",
      source: "user",
      status: "proposed",
      scope: "requirement",
      requirementIds: ["FR-001"],
    });
    expect(next?.acceptanceCriteria[0]).toEqual(content.acceptanceCriteria[0]);
    expect(content.acceptanceCriteria[0]?.text).toBe("The list is visible.");
    expect(prepareRequirementChange(content, { ...draft, requirementIds: ["FR-999"] })).toBeNull();
    expect(prepareRequirementChange(content, { ...draft, scope: "project", requirementIds: ["FR-001"] })).toBeNull();
    expect(prepareRequirementChange(content, { ...draft, requirementIds: ["FR-001", "FR-001"] })).toBeNull();
  });

  it("updates a proposed item in one apply and keeps its source and status", () => {
    const content = structured();
    const unrelated = content.acceptanceCriteria[0];
    const draft = {
      action: "update-functional" as const,
      id: "FR-002",
      text: "A filter is optional.",
      replaceConfirmed: false,
    };
    expect(previewRequirementChange(content, draft)?.replacesConfirmed).toBe(false);
    const next = commit(content, draft);
    expect(next?.functionalRequirements.find((item) => item.id === "FR-002")).toEqual({
      id: "FR-002",
      text: "A filter is optional.",
      source: "ai",
      status: "proposed",
    });
    expect(next?.acceptanceCriteria[0]).toBe(unrelated);
    expect(content.functionalRequirements[1]?.text).toBe("Maybe add a filter.");
  });

  it("does not replace confirmed text until the final confirmation, and then keeps id and source", () => {
    const content = structured();
    const draft = {
      action: "update-functional" as const,
      id: "FR-001",
      text: "Show the people list with name and role.",
      replaceConfirmed: false,
    };
    expect(previewRequirementChange(content, draft)).toMatchObject({
      id: "FR-001",
      source: "user",
      status: "confirmed",
      replacesConfirmed: true,
      currentText: "Show the people list.",
      text: "Show the people list with name and role.",
    });
    const prepared = prepareRequirementChange(content, draft);
    expect(prepared).not.toBeNull();
    expect(applyRequirementChange(content, draft, prepared!)).toBeNull();
    expect(content.functionalRequirements[0]?.text).toBe("Show the people list.");

    const criterion = {
      action: "update-criterion" as const,
      id: "AC-001",
      text: "The list shows a name and a role.",
      replaceConfirmed: false,
    };
    const preparedCriterion = prepareRequirementChange(content, criterion);
    expect(preparedCriterion?.preview).toMatchObject({
      id: "AC-001",
      source: "ai",
      status: "confirmed",
      scope: "requirement",
      requirementIds: ["FR-001"],
      replacesConfirmed: true,
      currentText: "The list is visible.",
    });
    expect(applyRequirementChange(content, criterion, preparedCriterion!)).toBeNull();
    const replaced = applyRequirementChange(content, { ...criterion, replaceConfirmed: true }, preparedCriterion!);
    expect(replaced?.acceptanceCriteria[0]).toEqual({
      ...content.acceptanceCriteria[0],
      text: "The list shows a name and a role.",
    });
    expect(replaced?.acceptanceCriteria[0]?.source).toBe("ai");
    expect(replaced?.acceptanceCriteria[0]?.status).toBe("confirmed");
    expect(replaced?.acceptanceCriteria[0]?.requirementIds).toEqual(["FR-001"]);
    expect(content.acceptanceCriteria[0]?.text).toBe("The list is visible.");
  });

  it("rejects blank text, free-text mode, a missing target, and a stale apply flag is not enough to invent a target", () => {
    const content = structured();
    expect(prepareRequirementChange(content, { action: "create-functional", text: "   " })).toBeNull();
    expect(prepareRequirementChange(content, { action: "create-functional", text: "x".repeat(INPUT_LIMITS.longText + 1) })).toBeNull();
    expect(prepareRequirementChange(defaultRequirementsContent(), { action: "create-functional", text: "A list." })).toBeNull();
    expect(
      prepareRequirementChange(content, {
        action: "update-functional",
        id: "FR-009",
        text: "Missing.",
        replaceConfirmed: true,
      }),
    ).toBeNull();
    const applied = markReviewApplied(emptyReviewSession(1, "fp"), "F-001", { kind: "functional", id: "FR-003" });
    expect(applied.records["1:F-001"]?.applied).toEqual({ kind: "functional", id: "FR-003" });
    expect(applied.records["1:F-001"]?.decision).toBe("open");
    expect(sessionHasReviewWork(applied)).toBe(true);
  });

  it("creates a proposed project-wide criterion without links", () => {
    const content = structured();
    const next = commit(content, {
      action: "create-criterion",
      text: "The directory loads.",
      scope: "project",
      requirementIds: [],
    });
    expect(next?.acceptanceCriteria[1]).toMatchObject({
      id: "AC-002",
      source: "user",
      status: "proposed",
      scope: "project",
      requirementIds: [],
    });
    expect(next?.acceptanceCriteria[0]?.requirementIds).toEqual(["FR-001"]);
    expect(content.acceptanceCriteria).toHaveLength(1);
  });

  it("previews criterion metadata and rejects a requirements state that no longer matches", () => {
    const content = structured();
    const draft = {
      action: "create-criterion" as const,
      text: "  An unknown person shows a not-found state.\n",
      scope: "requirement" as const,
      requirementIds: ["FR-001", "FR-002"],
    };
    const prepared = prepareRequirementChange(content, draft);
    expect(prepared?.preview).toEqual({
      action: "create-criterion",
      id: "AC-002",
      text: "  An unknown person shows a not-found state.\n",
      source: "user",
      status: "proposed",
      scope: "requirement",
      requirementIds: ["FR-001", "FR-002"],
      replacesConfirmed: false,
      currentText: null,
    });

    const changed = {
      ...content,
      functionalRequirements: content.functionalRequirements.map((item) =>
        item.id === "FR-002" ? { ...item, text: "A filter is required." } : item,
      ),
    };
    expect(applyRequirementChange(changed, draft, prepared!)).toBeNull();
    expect(changed.nextCriterionNumber).toBe(2);
    expect(changed.acceptanceCriteria).toHaveLength(1);
    expect(changed.functionalRequirements[1]?.text).toBe("A filter is required.");
    expect(applyRequirementChange(content, { ...draft, text: "Different text." }, prepared!)).toBeNull();
    expect(content.nextCriterionNumber).toBe(2);
    expect(content.acceptanceCriteria).toHaveLength(1);

    const applied = applyRequirementChange(content, draft, prepared!);
    expect(applied?.acceptanceCriteria[1]).toMatchObject({
      id: "AC-002",
      text: draft.text,
      source: "user",
      status: "proposed",
      scope: "requirement",
      requirementIds: ["FR-001", "FR-002"],
    });
    expect(applied?.nextCriterionNumber).toBe(3);
    expect(content.nextCriterionNumber).toBe(2);
    expect(content.functionalRequirements.map((item) => item.id)).toEqual(["FR-001", "FR-002"]);
  });

  it("requires a new preview when only the next identifier counter has changed", () => {
    const content = structured();
    const draft = { action: "create-functional" as const, text: "A new requirement." };
    const prepared = prepareRequirementChange(content, draft);
    expect(prepared?.preview.id).toBe("FR-003");
    const counterOnly = { ...content, nextFunctionalNumber: 9 };
    expect(applyRequirementChange(counterOnly, draft, prepared!)).toBeNull();
    expect(counterOnly.nextFunctionalNumber).toBe(9);
    expect(counterOnly.functionalRequirements).toHaveLength(2);

    const again = prepareRequirementChange(counterOnly, draft);
    expect(again?.preview.id).toBe("FR-009");
    const written = applyRequirementChange(counterOnly, draft, again!);
    expect(written?.functionalRequirements.map((item) => item.id)).toEqual(["FR-001", "FR-002", "FR-009"]);
    expect(written?.nextFunctionalNumber).toBe(10);
    expect(counterOnly.functionalRequirements).toHaveLength(2);
    expect(counterOnly.nextFunctionalNumber).toBe(9);
  });
});
