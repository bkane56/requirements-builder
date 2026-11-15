import { describe, expect, it } from "vitest";
import {
  addAcceptanceCriterion,
  addFunctionalRequirement,
  confirmedAcceptanceCriteria,
  confirmedFunctionalRequirements,
  criteriaLinking,
  defaultRequirementsContent,
  formatAcceptanceEntries,
  formatFunctionalEntries,
  normalizeRequirementsContent,
  parseRequirementsContent,
  removeFunctionalRequirement,
  uncoveredRequirementIds,
  updateAcceptanceCriterion,
  updateFunctionalRequirement,
  beginStructuredRequirements,
  returnToFreeTextRequirements,
  type RequirementsContent,
} from "../lib/requirements-content";

const base = defaultRequirementsContent();

function structured(content: RequirementsContent = base): RequirementsContent {
  return { ...content, mode: "structured" };
}

describe("requirements content", () => {
  it("adds, edits, and removes items without renumbering or reusing ids", () => {
    let content = addFunctionalRequirement(structured(), "List people.");
    content = addFunctionalRequirement(content, "Open a person.");
    content = updateFunctionalRequirement(content, "FR-001", { text: "Show the people list." });
    expect(content.functionalRequirements.map((item) => item.id)).toEqual(["FR-001", "FR-002"]);
    expect(content.functionalRequirements[0].text).toBe("Show the people list.");
    expect(content.nextFunctionalNumber).toBe(3);

    content = removeFunctionalRequirement(content, "FR-001");
    content = addFunctionalRequirement(content, "Load the list from the API.");
    expect(content.functionalRequirements.map((item) => [item.id, item.text])).toEqual([
      ["FR-002", "Open a person."],
      ["FR-003", "Load the list from the API."],
    ]);
    expect(content.nextFunctionalNumber).toBe(4);
  });

  it("preserves acceptance criteria when a functional requirement is deleted", () => {
    let content = addFunctionalRequirement(structured(), "Show the people list.");
    content = addFunctionalRequirement(content, "Open a person.");
    content = addFunctionalRequirement(content, "Load mock data.");
    content = addAcceptanceCriterion(content, { scope: "requirement", text: "The list is visible.", requirementIds: ["FR-001"] });
    content = addAcceptanceCriterion(content, {
      scope: "requirement",
      text: "Both pages work.",
      requirementIds: ["FR-001", "FR-002"],
    });
    content = addAcceptanceCriterion(content, { scope: "requirement", text: "Mock data loads.", requirementIds: ["FR-003"] });
    content = addAcceptanceCriterion(content, { scope: "project", text: "The application builds." });
    content = updateAcceptanceCriterion(content, "AC-001", { status: "proposed" });
    content = {
      ...content,
      acceptanceCriteria: content.acceptanceCriteria.map((item) =>
        item.id === "AC-001" ? { ...item, source: "ai" as const } : item,
      ),
    };
    const unrelated = content.acceptanceCriteria[2];
    const projectWide = content.acceptanceCriteria[3];
    expect(criteriaLinking(content, "FR-001").map((item) => item.id)).toEqual(["AC-001", "AC-002"]);

    content = removeFunctionalRequirement(content, "FR-001");
    expect(content.functionalRequirements.map((item) => item.id)).toEqual(["FR-002", "FR-003"]);
    expect(content.acceptanceCriteria).toEqual([
      {
        id: "AC-001",
        scope: "project",
        requirementIds: [],
        text: "The list is visible.",
        source: "ai",
        status: "proposed",
      },
      {
        id: "AC-002",
        scope: "requirement",
        requirementIds: ["FR-002"],
        text: "Both pages work.",
        source: "user",
        status: "confirmed",
      },
      unrelated,
      projectWide,
    ]);
    expect(content.acceptanceCriteria[2]).toBe(unrelated);
    expect(content.acceptanceCriteria[3]).toBe(projectWide);
    expect(content.nextFunctionalNumber).toBe(4);
    expect(content.nextCriterionNumber).toBe(5);
  });

  it("copies free text exactly into one requirement and one project-wide criterion", () => {
    const businessRequirements = "  Show people.\n\nKeep this spacing.  \n";
    const acceptanceCriteria = "\tThe list loads.\n";
    const copied = beginStructuredRequirements(base, "copy", businessRequirements, acceptanceCriteria);
    expect(copied.mode).toBe("structured");
    expect(copied.functionalRequirements).toEqual([
      { id: "FR-001", text: businessRequirements, source: "user", status: "confirmed" },
    ]);
    expect(copied.acceptanceCriteria).toEqual([
      {
        id: "AC-001",
        scope: "project",
        requirementIds: [],
        text: acceptanceCriteria,
        source: "user",
        status: "confirmed",
      },
    ]);

    const again = beginStructuredRequirements(copied, "copy", "Different text.", "Different criterion.");
    expect(again.functionalRequirements).toHaveLength(1);
    expect(again.functionalRequirements[0].text).toBe(businessRequirements);
    expect(again.acceptanceCriteria[0].text).toBe(acceptanceCriteria);
  });

  it("starts structured mode without copying and returns to free text without deleting items", () => {
    const empty = beginStructuredRequirements(base, "empty", "Show people.", "The list loads.");
    expect(empty).toEqual({ ...structured(), mode: "structured" });
    const withItem = addFunctionalRequirement(empty, "Show people.");
    const restored = returnToFreeTextRequirements(withItem);
    expect(restored.mode).toBe("free-text");
    expect(restored.functionalRequirements).toEqual(withItem.functionalRequirements);
  });

  it("sorts by id and raises a counter that is behind the saved ids", () => {
    const content: RequirementsContent = {
      mode: "structured",
      nextFunctionalNumber: 1,
      nextCriterionNumber: 2,
      functionalRequirements: [
        { id: "FR-003", text: "Later", source: "user", status: "confirmed" },
        { id: "FR-001", text: "Earlier", source: "ai", status: "proposed" },
      ],
      acceptanceCriteria: [
        {
          id: "AC-002",
          scope: "requirement",
          requirementIds: ["FR-003", "FR-001"],
          text: "Both",
          source: "user",
          status: "confirmed",
        },
      ],
    };
    const normalized = normalizeRequirementsContent(content);
    expect(normalized.functionalRequirements.map((item) => item.id)).toEqual(["FR-001", "FR-003"]);
    expect(normalized.acceptanceCriteria[0].requirementIds).toEqual(["FR-001", "FR-003"]);
    expect(normalized.nextFunctionalNumber).toBe(4);
    expect(normalized.nextCriterionNumber).toBe(3);
    expect(normalized.functionalRequirements[0].text).toBe("Earlier");
  });

  it("emits only confirmed entries and keeps proposed text out of the formatted blocks", () => {
    let content = addFunctionalRequirement(structured(), "Show the people list.");
    content = addFunctionalRequirement(content, "Use a database.");
    content = updateFunctionalRequirement(content, "FR-002", { status: "proposed" });
    content = addAcceptanceCriterion(content, { scope: "project", text: "Automated tests pass." });
    content = addAcceptanceCriterion(content, { scope: "requirement", text: "An unknown person is handled.", requirementIds: ["FR-001"] });
    content = updateAcceptanceCriterion(content, "AC-002", { status: "proposed" });
    content.functionalRequirements[0] = { ...content.functionalRequirements[0], source: "ai", status: "confirmed" };

    const functional = formatFunctionalEntries(confirmedFunctionalRequirements(content));
    const acceptance = formatAcceptanceEntries(confirmedAcceptanceCriteria(content));
    expect(functional).toBe("**FR-001.** (approved AI proposal) Show the people list.");
    expect(functional).not.toContain("Use a database.");
    expect(acceptance).toBe("**AC-001.** Automated tests pass.\nApplies to the whole project.");
    expect(acceptance).not.toContain("An unknown person");
    expect(uncoveredRequirementIds(content)).toEqual([]);
  });

  it("reports uncovered requirements only when a confirmed requirement-specific criterion exists", () => {
    let projectOnly = addFunctionalRequirement(structured(), "Show the people list.");
    projectOnly = addFunctionalRequirement(projectOnly, "Open a person.");
    projectOnly = addAcceptanceCriterion(projectOnly, { scope: "project", text: "Automated tests pass." });
    projectOnly = addAcceptanceCriterion(projectOnly, {
      scope: "requirement",
      text: "An unknown person is handled.",
      requirementIds: ["FR-001"],
    });
    projectOnly = updateAcceptanceCriterion(projectOnly, "AC-002", { status: "proposed" });
    expect(uncoveredRequirementIds(projectOnly)).toEqual([]);

    let mixed = addFunctionalRequirement(structured(), "Show the people list.");
    mixed = addFunctionalRequirement(mixed, "Open a person.");
    mixed = addFunctionalRequirement(mixed, "Load mock data.");
    mixed = addFunctionalRequirement(mixed, "Store a nickname.");
    mixed = updateFunctionalRequirement(mixed, "FR-004", { status: "proposed" });
    mixed = addAcceptanceCriterion(mixed, { scope: "project", text: "Automated tests pass." });
    mixed = addAcceptanceCriterion(mixed, {
      scope: "requirement",
      text: "The detail page opens.",
      requirementIds: ["FR-002"],
    });
    mixed = addAcceptanceCriterion(mixed, {
      scope: "requirement",
      text: "A nickname is stored.",
      requirementIds: ["FR-004"],
    });
    mixed = updateAcceptanceCriterion(mixed, "AC-003", { status: "proposed" });
    expect(uncoveredRequirementIds(mixed)).toEqual(["FR-001", "FR-003"]);
  });

  it("rejects malformed structured data and accepts a low counter for normalization", () => {
    const valid = beginStructuredRequirements(base, "copy", "Show people.", "");
    expect(parseRequirementsContent(valid)?.nextFunctionalNumber).toBe(2);

    const lowCounter = {
      ...valid,
      nextFunctionalNumber: 1,
      functionalRequirements: [{ id: "FR-003", text: "Later", source: "user", status: "confirmed" }],
    };
    expect(parseRequirementsContent(lowCounter)?.nextFunctionalNumber).toBe(4);

    expect(parseRequirementsContent(null)).toBeNull();
    expect(parseRequirementsContent({ ...valid, mode: "both" })).toBeNull();
    expect(parseRequirementsContent({ ...valid, functionalRequirements: [{ ...valid.functionalRequirements[0], status: "done" }] })).toBeNull();
    expect(
      parseRequirementsContent({
        ...valid,
        functionalRequirements: [valid.functionalRequirements[0], valid.functionalRequirements[0]],
      }),
    ).toBeNull();
    expect(
      parseRequirementsContent({
        ...valid,
        acceptanceCriteria: [
          {
            id: "AC-001",
            scope: "requirement",
            requirementIds: ["FR-009"],
            text: "Missing",
            source: "user",
            status: "confirmed",
          },
        ],
      }),
    ).toBeNull();
    expect(
      parseRequirementsContent({
        ...valid,
        acceptanceCriteria: [
          { id: "AC-001", scope: "project", requirementIds: ["FR-001"], text: "Linked", source: "user", status: "confirmed" },
        ],
      }),
    ).toBeNull();
    expect(
      parseRequirementsContent({
        ...valid,
        acceptanceCriteria: [
          { id: "AC-001", scope: "requirement", requirementIds: [], text: "Unlinked", source: "user", status: "confirmed" },
        ],
      }),
    ).toBeNull();
    expect(
      parseRequirementsContent({
        ...valid,
        functionalRequirements: [{ ...valid.functionalRequirements[0], id: "FR-1" }],
      }),
    ).toBeNull();
    expect(
      parseRequirementsContent({
        ...valid,
        acceptanceCriteria: [
          { id: "AC-0001", scope: "project", requirementIds: [], text: "Tests pass.", source: "user", status: "confirmed" },
        ],
      }),
    ).toBeNull();
    expect(
      parseRequirementsContent({
        ...valid,
        acceptanceCriteria: [
          { id: "AC-001", scope: "project", requirementIds: [], text: "Tests pass.", source: "user", status: "confirmed" },
          { id: "AC-001", scope: "project", requirementIds: [], text: "Again.", source: "user", status: "confirmed" },
        ],
      }),
    ).toBeNull();
    expect(
      parseRequirementsContent({
        ...valid,
        acceptanceCriteria: [
          {
            id: "AC-001",
            scope: "requirement",
            requirementIds: ["FR-001", "FR-001"],
            text: "Repeated",
            source: "user",
            status: "confirmed",
          },
        ],
      }),
    ).toBeNull();
  });

  it("keeps ai provenance when a proposal is confirmed", () => {
    let content = addFunctionalRequirement(structured(), "");
    content = {
      ...content,
      functionalRequirements: content.functionalRequirements.map((item) =>
        item.id === "FR-001" ? { ...item, source: "ai" as const, status: "proposed" as const } : item,
      ),
    };
    content = updateFunctionalRequirement(content, "FR-001", { status: "confirmed", text: "Show the people list." });
    expect(content.functionalRequirements[0]).toMatchObject({
      source: "ai",
      status: "confirmed",
      text: "Show the people list.",
    });
  });

  it("clears requirement links when a criterion becomes project-wide", () => {
    let content = addFunctionalRequirement(structured(), "Show the people list.");
    content = addAcceptanceCriterion(content, { scope: "requirement", text: "The list is visible.", requirementIds: ["FR-001"] });
    content = updateAcceptanceCriterion(content, "AC-001", { scope: "project" });
    expect(content.acceptanceCriteria[0]).toMatchObject({ scope: "project", requirementIds: [] });
  });
});
