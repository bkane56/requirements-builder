export const MODES = ["fast", "project"] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABELS: Record<Mode, string> = {
  fast: "Fast Mode",
  project: "Project Mode",
};

export const MODE_DESCRIPTIONS: Record<Mode, string> = {
  fast: "Concise document focused on a working first slice. Engineering quality standards are not reduced.",
  project: "Fuller document that adds architecture, operations, and maintenance sections.",
};

export const INPUT_LIMITS = {
  projectName: 120,
  description: 1000,
  longText: 20000,
} as const;

export const SECTIONS = [
  { id: "metadata", title: "Project Metadata and Summary" },
  { id: "business-objectives", title: "Business Objectives and Scope" },
  { id: "functional", title: "Functional Requirements" },
  { id: "acceptance", title: "Acceptance Criteria" },
  { id: "assumptions", title: "Assumptions and Unresolved Questions" },
  { id: "stack", title: "Technical Stack and Coding Conventions" },
  { id: "architecture", title: "Architecture and Dependencies" },
  { id: "data", title: "Data Handling and Golden Dataset" },
  { id: "testing", title: "Testing and Verification" },
  { id: "api", title: "API Contract and Documentation" },
  { id: "security", title: "Security and Nonfunctional Requirements" },
  { id: "implementation", title: "Implementation Phases and Priorities" },
  { id: "done", title: "Definition of Done" },
  { id: "modules", title: "Included Modules" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export const USER_CONTENT_HEADING = "User-provided requirements";

export const MISSING_TEXT = {
  businessRequirements:
    "Not provided. Business requirements must be supplied by the user before implementation. Do not invent them.",
  acceptanceCriteria:
    "Not provided. Measurable acceptance criteria must be supplied by the user before implementation.",
} as const;

export const OPEN_QUESTIONS = {
  businessRequirements: "What are the business requirements? None were provided.",
  acceptanceCriteria:
    "What are the measurable acceptance criteria for each functional requirement? None were provided.",
} as const;

export const NO_STRETCH_GOALS =
  "No stretch goals were provided. Treat every functional requirement above as must-have.";
