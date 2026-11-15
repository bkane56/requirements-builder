// @vitest-environment happy-dom
import fs from "node:fs";
import path from "node:path";
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RequirementsBuilder, { commitPreparedRequirementChange, recoveryStatusText } from "../components/requirements-builder";
import { RequirementsAnalysis } from "../components/requirements-analysis";
import { RequirementsWriter } from "../components/requirements-writer";
import { analysisFingerprint, buildAnalysisInput } from "../lib/ai/analysis-input";
import { readAnalysisResult } from "../lib/ai/analysis-schema";
import { parseReviewSession, prepareRequirementChange } from "../lib/ai/review";
import { parseStoredWritingSession } from "../lib/ai/writing-suggestions";
import { buildWritingInput, currentSourceFingerprint, writingFingerprint, writingSourceFingerprint } from "../lib/ai/writing-input";
import { assembleRequirements } from "../lib/assemble-requirements";
import { defaultConfig, type ProjectConfig } from "../lib/config";
import { serializeConfig } from "../lib/config-file";
import { DOWNLOAD_COUNT_STORAGE_KEY } from "../lib/download-filename";
import { DRAFT_RECOVERY_STORAGE_KEY, saveDraftRecovery } from "../lib/draft-recovery";
import { loadTemplates } from "../lib/load-templates";
import { moduleVersionMap } from "../lib/module-registry";
import {
  addFunctionalRequirement,
  beginStructuredRequirements,
  defaultRequirementsContent,
  requirementsOf,
  updateFunctionalRequirement,
} from "../lib/requirements-content";
import { normalizeSelections } from "../lib/selection-rules";
import { defaultToolchain } from "../lib/toolchain";
import { defaultUiFramework } from "../lib/ui-framework";
import { UI_TEXT } from "../lib/ui-text";

const templates = loadTemplates();

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement & HTMLSelectElement;
const maybeField = (label: string) => screen.queryByLabelText(label);
const optionValues = (label: string) => [...field(label).options].map((option) => option.value);
const preview = () => (screen.getByLabelText("Markdown document") as HTMLTextAreaElement).value;

const change = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const assemble = () => fireEvent.click(screen.getByRole("button", { name: /^(Assemble Draft|Reassemble)$/ }));

function fillRequired(businessRequirements = "Users can upload a receipt.") {
  change("Project name", "Receipt Tracker");
  change("Business requirements", businessRequirements);
}

beforeEach(() => {
  sessionStorage.clear();
  render(<RequirementsBuilder templates={templates} />);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("conditional controls", () => {
  it("shows only the controls that apply to the default configuration", () => {
    expect(field("Application type").value).toBe("other");
    expect(field("Backend Java").checked).toBe(false);
    expect(field("Backend TypeScript").checked).toBe(false);
    expect(field("Backend Other").checked).toBe(false);
    expect(maybeField("UI TypeScript")).toBeNull();
    expect(maybeField("Includes an HTTP API")).not.toBeNull();
    for (const hidden of ["Runtime", "Backend framework", "Next.js", "React + Vite", "Swagger / OpenAPI documentation", "Postman collection"]) {
      expect(maybeField(hidden), hidden).toBeNull();
    }
    expect(maybeField("Line coverage target (%)")).not.toBeNull();
  });

  it("shows the Node.js runtime only for backend TypeScript and JavaScript", () => {
    fireEvent.click(field("Backend TypeScript"));
    expect(optionValues("Runtime")).toEqual(["none", "nodejs"]);
    fireEvent.click(field("Backend TypeScript"));
    fireEvent.click(field("Backend Java"));
    expect(maybeField("Runtime")).toBeNull();
    fireEvent.click(field("Backend Java"));
    fireEvent.click(field("Backend JavaScript"));
    expect(maybeField("Runtime")).not.toBeNull();
    fireEvent.click(field("Backend JavaScript"));
    fireEvent.click(field("Backend Python"));
    expect(maybeField("Runtime")).toBeNull();
  });

  it("offers only the backend framework that matches the language and runtime", () => {
    change("Application type", "rest-api");
    fireEvent.click(field("Backend Java"));
    expect(optionValues("Backend framework")).toEqual(["none", "spring-boot"]);
    fireEvent.click(field("Backend Java"));
    fireEvent.click(field("Backend Python"));
    expect(optionValues("Backend framework")).toEqual(["none", "fastapi"]);
    fireEvent.click(field("Backend Python"));
    fireEvent.click(field("Backend TypeScript"));
    expect(maybeField("Backend framework")).toBeNull();
    change("Runtime", "nodejs");
    expect(optionValues("Backend framework")).toEqual(["none", "nodejs-api"]);
  });

  it("reveals toolchain choices for a checked language and removes them when unchecked", () => {
    fireEvent.click(field("Backend Java"));
    expect(optionValues("Backend Java package manager")).toEqual(["maven", "gradle"]);
    expect(field("Backend Java package manager").value).toBe("maven");
    expect(optionValues("Backend Java language version")).toEqual(["17", "21", "25"]);
    expect(screen.getByText("Test runner: JUnit 5.")).toBeTruthy();
    expect(maybeField("Backend Java test runner")).toBeNull();

    change("Application type", "web-app");
    fireEvent.click(field("UI TypeScript"));
    expect(optionValues("UI TypeScript package manager")).toEqual(["yarn", "npm", "pnpm"]);
    expect(field("UI TypeScript package manager").value).toBe("yarn");
    expect(optionValues("UI TypeScript Node.js version")).toEqual(["26", "24"]);

    fireEvent.click(field("Backend Java"));
    expect(maybeField("Backend Java package manager")).toBeNull();
  });

  it("keeps JavaScript and TypeScript toolchain choices in sync on one side", () => {
    fireEvent.click(field("Backend JavaScript"));
    change("Backend JavaScript package manager", "npm");
    fireEvent.click(field("Backend TypeScript"));
    expect(field("Backend TypeScript package manager").value).toBe("npm");
    expect(screen.getByText(/share one package manifest/)).toBeTruthy();

    change("Backend TypeScript test runner", "jest");
    expect(field("Backend JavaScript test runner").value).toBe("jest");
    expect(field("Backend TypeScript language version").value).toBe("7.0");
  });

  it("hides and clears UI languages when leaving Web App", () => {
    change("Application type", "web-app");
    fireEvent.click(field("UI TypeScript"));
    change("UI TypeScript package manager", "npm");
    change("Application type", "rest-api");
    expect(maybeField("UI TypeScript")).toBeNull();
    change("Application type", "web-app");
    expect(field("UI TypeScript").checked).toBe(false);
    expect(maybeField("UI TypeScript package manager")).toBeNull();
  });

  it("shows UI framework checkboxes only for a Web App and keeps each framework's options separate", () => {
    change("Application type", "web-app");
    expect(field("Next.js").checked).toBe(false);
    expect(field("React + Vite").checked).toBe(false);
    expect(screen.getByText(/both a UI and a backend/)).toBeTruthy();

    fireEvent.click(field("Next.js"));
    expect(maybeField("Next.js routing")).toBeNull();
    expect(field("Next.js client state").value).toBe("none");
    expect(optionValues("Next.js client state")).toEqual(["none", "redux-toolkit", "zustand", "context"]);
    expect(field("Next.js server data").value).toBe("none");

    fireEvent.click(field("React + Vite"));
    expect(field("React + Vite routing").value).toBe("react-router");
    expect(optionValues("React + Vite routing")).toEqual(["react-router", "tanstack-router", "none"]);
    change("Next.js client state", "redux-toolkit");
    change("React + Vite client state", "zustand");
    expect(field("Next.js client state").value).toBe("redux-toolkit");
    expect(field("React + Vite client state").value).toBe("zustand");

    change("Application type", "rest-api");
    expect(maybeField("Next.js")).toBeNull();
    expect(maybeField("React + Vite")).toBeNull();
  });

  it("keeps a backend framework when a Web App also selects a UI framework", () => {
    change("Application type", "web-app");
    fireEvent.click(field("Backend Java"));
    fireEvent.click(field("Includes an HTTP API"));
    change("Backend framework", "spring-boot");
    fireEvent.click(field("Next.js"));
    change("Next.js client state", "redux-toolkit");

    expect(field("Backend Java").checked).toBe(true);
    expect(field("Backend framework").value).toBe("spring-boot");
    expect(field("Next.js").checked).toBe(true);
    expect(field("Next.js client state").value).toBe("redux-toolkit");

    fillRequired();
    assemble();
    const document = preview();
    expect(document).toContain("### Module: `nextjs-react`");
    expect(document).toContain("### Module: `spring-boot`");
    expect(document).toContain("### Module: `java-backend`");
    expect(document).toContain("Use Redux Toolkit for shared client state.");
    expect(document).toContain("- Full stack: this Web App includes both a UI and a backend.");
  });

  it("selects TypeScript when the first UI framework is checked and leaves an existing language alone", () => {
    change("Application type", "web-app");
    fireEvent.click(field("Next.js"));
    expect(field("UI TypeScript").checked).toBe(true);

    fireEvent.click(field("UI TypeScript"));
    fireEvent.click(field("UI JavaScript"));
    fireEvent.click(field("React + Vite"));
    expect(field("UI TypeScript").checked).toBe(false);
    expect(field("UI JavaScript").checked).toBe(true);

    fireEvent.click(field("Next.js"));
    fireEvent.click(field("React + Vite"));
    expect(field("UI JavaScript").checked).toBe(true);
    fireEvent.click(field("Next.js"));
    expect(field("UI TypeScript").checked).toBe(false);
    expect(field("UI JavaScript").checked).toBe(true);
  });

  it("blocks assembly when a UI framework has no language and focuses the first language checkbox", () => {
    change("Application type", "web-app");
    fireEvent.click(field("Next.js"));
    fireEvent.click(field("UI TypeScript"));
    fillRequired();
    assemble();

    const language = field("UI TypeScript");
    const group = document.getElementById("field-uiLanguages");
    expect(screen.getByText("Select a UI language for the selected UI framework.")).toBeTruthy();
    expect(group?.getAttribute("aria-invalid")).toBe("true");
    expect(group?.getAttribute("aria-describedby")).toBe("field-uiLanguages-error");
    expect(language.getAttribute("aria-invalid")).toBe("true");
    expect(language.getAttribute("aria-describedby")).toBe("field-uiLanguages-error");
    expect(language.tabIndex).toBe(0);
    expect(document.activeElement).toBe(language);
    expect(preview()).toBe("");

    fireEvent.click(field("UI Other"));
    assemble();
    expect(screen.queryByText("Select a UI language for the selected UI framework.")).toBeNull();
    expect(preview()).toContain("Which UI language and toolchain should be used for the \"Other\" selection?");
  });

  it("fixes the HTTP API choice for REST API and CLI projects", () => {
    change("Application type", "rest-api");
    expect(maybeField("Includes an HTTP API")).toBeNull();
    expect(screen.getByText("REST API projects always include an HTTP API.")).toBeTruthy();
    expect(maybeField("Swagger / OpenAPI documentation")).not.toBeNull();

    change("Application type", "cli-library");
    expect(screen.getByText("CLI / Library projects do not include an HTTP API.")).toBeTruthy();
    expect(maybeField("Swagger / OpenAPI documentation")).toBeNull();
  });

  it("hides coverage targets when coverage is disabled", () => {
    fireEvent.click(field("Code coverage targets"));
    expect(maybeField("Line coverage target (%)")).toBeNull();
    expect(maybeField("Branch coverage target (%)")).toBeNull();
  });
});

describe("compatibility resets", () => {
  it("clears the Node.js runtime and Node API framework when the language changes", () => {
    change("Application type", "rest-api");
    fireEvent.click(field("Backend TypeScript"));
    change("Runtime", "nodejs");
    change("Backend framework", "nodejs-api");

    fireEvent.click(field("Backend TypeScript"));
    fireEvent.click(field("Backend Java"));
    expect(maybeField("Runtime")).toBeNull();
    expect(field("Backend framework").value).toBe("none");

    fireEvent.click(field("Backend Java"));
    fireEvent.click(field("Backend TypeScript"));
    expect(field("Runtime").value).toBe("none");
  });

  it("clears the UI frameworks and API documentation when the application type changes", () => {
    change("Application type", "web-app");
    fireEvent.click(field("Next.js"));
    expect(field("UI TypeScript").checked).toBe(true);
    change("Application type", "cli-library");
    change("Application type", "web-app");
    expect(field("Next.js").checked).toBe(false);
    expect(field("UI TypeScript").checked).toBe(false);

    change("Application type", "rest-api");
    fireEvent.click(field("Swagger / OpenAPI documentation"));
    expect(field("Swagger / OpenAPI documentation").checked).toBe(true);
    change("Application type", "cli-library");
    change("Application type", "rest-api");
    expect(field("Swagger / OpenAPI documentation").checked).toBe(false);
  });

  it("clears the backend framework and API documentation when the HTTP API is turned off", () => {
    change("Application type", "ai-agent");
    fireEvent.click(field("Backend Python"));
    fireEvent.click(field("Includes an HTTP API"));
    change("Backend framework", "fastapi");
    fireEvent.click(field("Postman collection"));

    fireEvent.click(field("Includes an HTTP API"));
    expect(maybeField("Backend framework")).toBeNull();
    expect(maybeField("Postman collection")).toBeNull();

    fireEvent.click(field("Includes an HTTP API"));
    expect(field("Backend framework").value).toBe("none");
    expect(field("Postman collection").checked).toBe(false);
  });
});

describe("validation", () => {
  it("reports missing required fields, marks them invalid, and focuses the first one", () => {
    assemble();
    const name = field("Project name");
    const requirements = field("Business requirements");

    expect(screen.getByText("Project name is required.")).toBeTruthy();
    expect(screen.getByText("Business requirements are required.")).toBeTruthy();
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(requirements.getAttribute("aria-invalid")).toBe("true");
    expect(name.getAttribute("aria-describedby")).toBe("field-projectName-error");
    expect(requirements.getAttribute("aria-describedby")).toContain("field-businessRequirements-error");
    expect(document.activeElement).toBe(name);
    expect(preview()).toBe("");
  });

  it("treats whitespace-only required fields as missing", () => {
    change("Project name", "   ");
    change("Business requirements", "\n\t ");
    assemble();
    expect(screen.getByText("Project name is required.")).toBeTruthy();
    expect(screen.getByText("Business requirements are required.")).toBeTruthy();
  });

  it("marks only the invalid coverage target, focuses it, and recovers once corrected", () => {
    fillRequired();
    change("Line coverage target (%)", "150");
    assemble();

    const line = field("Line coverage target (%)");
    const branch = field("Branch coverage target (%)");
    expect(screen.getByText("Line coverage target must be a whole number from 0 to 100.")).toBeTruthy();
    expect(screen.queryByText("Branch coverage target must be a whole number from 0 to 100.")).toBeNull();
    expect(line.getAttribute("aria-invalid")).toBe("true");
    expect(line.getAttribute("aria-describedby")).toBe("field-linePercent-error");
    expect(branch.getAttribute("aria-invalid")).toBeNull();
    expect(branch.getAttribute("aria-describedby")).toBeNull();
    expect(document.activeElement).toBe(line);
    expect(preview()).toBe("");

    change("Line coverage target (%)", "90");
    change("Branch coverage target (%)", "");
    assemble();
    expect(field("Line coverage target (%)").getAttribute("aria-invalid")).toBeNull();
    expect(field("Branch coverage target (%)").getAttribute("aria-invalid")).toBe("true");
    expect(field("Branch coverage target (%)").getAttribute("aria-describedby")).toBe("field-branchPercent-error");
    expect(document.activeElement).toBe(field("Branch coverage target (%)"));
    expect(screen.getByText("Branch coverage target must be a whole number from 0 to 100.")).toBeTruthy();
    expect(preview()).toBe("");

    change("Branch coverage target (%)", "70");
    assemble();
    expect(screen.queryByText("Line coverage target must be a whole number from 0 to 100.")).toBeNull();
    expect(screen.queryByText("Branch coverage target must be a whole number from 0 to 100.")).toBeNull();
    expect(preview()).toContain("at least 90% line coverage and 70% branch coverage");
  });

  it("focuses the line target when both coverage targets are invalid", () => {
    fillRequired();
    change("Line coverage target (%)", "1.5");
    change("Branch coverage target (%)", "101");
    assemble();
    expect(field("Line coverage target (%)").getAttribute("aria-invalid")).toBe("true");
    expect(field("Branch coverage target (%)").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("Line coverage target (%)"));
    expect(preview()).toBe("");
  });
});

describe("assembly", () => {
  it("produces the approved Java golden document when the form is filled in through the UI", () => {
    change("Project name", "Order Service");
    change("Short description (optional)", "Internal service for creating and retrieving customer orders.");
    change(
      "Business requirements",
      "- Clients can create an order with one or more line items.\n- Clients can fetch an order by its ID.\n- Unknown order IDs return 404.",
    );
    change(
      "Acceptance criteria (optional)",
      "- POST /orders with valid items returns 201 and the new order ID.\n- GET /orders/{id} for an unknown ID returns 404.",
    );
    change("Application type", "rest-api");
    fireEvent.click(field("Backend Java"));
    change("Backend framework", "spring-boot");
    fireEvent.click(field("Swagger / OpenAPI documentation"));
    fireEvent.click(field("Postman collection"));
    fireEvent.click(field("Integration tests"));
    assemble();

    const expected = fs.readFileSync(
      path.join(__dirname, "fixtures", "expected", "java-spring-rest-fast.md"),
      "utf-8",
    );
    expect(preview()).toBe(expected);
  });

  it("shows the typed business requirements verbatim and switches content with the mode", () => {
    const typed = "  Keep {{lineCoverage}} literal\n\n# User heading\n";
    fillRequired(typed);
    assemble();
    expect(preview()).toContain(`\n\n${typed}\n\n`);
    expect(preview()).toContain("`fast-delivery`");

    fireEvent.click(field("Project Mode"));
    assemble();
    expect(preview()).toContain("`project-delivery`");
    expect(preview()).not.toContain("`fast-delivery`");
  });
});

describe("copy and download", () => {
  const typed = "  {{lineCoverage}} stays\nline two  \n\u2014 \u{1F680}\n";
  const copyButton = () => screen.getByRole("button", { name: "Copy Markdown" }) as HTMLButtonElement;
  const downloadButton = () => screen.getByRole("button", { name: "Download Markdown" }) as HTMLButtonElement;

  function setClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: writeText ? { writeText } : undefined,
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });

  it("keeps copy and download unavailable until a document is assembled", () => {
    expect(copyButton().disabled).toBe(true);
    expect(downloadButton().disabled).toBe(true);
    assemble();
    expect(copyButton().disabled).toBe(true);
    expect(downloadButton().disabled).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("copies the preview exactly and reports success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    fillRequired(typed);
    assemble();
    const assembled = preview();

    expect(assembled.endsWith("\n")).toBe(true);
    expect(assembled).toContain(typed);
    fireEvent.click(copyButton());

    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Copied the current Markdown.");
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(assembled);
    expect(preview()).toBe(assembled);
  });

  it("reports a clipboard failure and leaves the preview unchanged", async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    fillRequired(typed);
    assemble();
    const assembled = preview();

    fireEvent.click(copyButton());
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Could not copy the Markdown. Select the preview and copy it manually.",
    );
    expect(preview()).toBe(assembled);
    expect(copyButton().disabled).toBe(false);
  });

  it("reports a failure when the clipboard API is missing", async () => {
    setClipboard(undefined);
    fillRequired(typed);
    assemble();
    fireEvent.click(copyButton());
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Could not copy the Markdown. Select the preview and copy it manually.",
    );
  });

  it("clears copy feedback when the document is assembled again", async () => {
    setClipboard(vi.fn().mockResolvedValue(undefined));
    fillRequired(typed);
    assemble();
    fireEvent.click(copyButton());
    expect(await screen.findByRole("status")).toBeTruthy();

    change("Project name", "Receipt Tracker 2");
    assemble();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("downloads the exact preview as PROJECT_REQUIREMENTS.md and revokes the object URL", async () => {
    fillRequired(typed);
    assemble();
    const assembled = preview();
    let blob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((value) => {
      blob = value as Blob;
      return "blob:preview";
    });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this);
    });

    fireEvent.click(downloadButton());

    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe("PROJECT_REQUIREMENTS.md");
    expect(clicks[0].href).toContain("blob:preview");
    expect(document.body.contains(clicks[0])).toBe(false);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe("text/markdown;charset=utf-8");
    expect(await blob?.text()).toBe(assembled);
    expect(assembled.endsWith("\n")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revoke).toHaveBeenCalledWith("blob:preview");
    expect(preview()).toBe(assembled);
  });
});

describe("assembly failure", () => {
  it("shows an alert instead of failing silently when a template is missing", () => {
    cleanup();
    const incomplete = { ...templates };
    delete incomplete["business-core"];
    render(<RequirementsBuilder templates={incomplete} />);

    fillRequired();
    assemble();
    expect(screen.getByRole("alert").textContent).toBe('Assembly failed: Missing template for module "business-core".');
    expect(preview()).toBe("");
  });
});

const STALE_NOTICE = "The configuration has changed since this document was assembled.";
const EDITED_NOTICE = "This document includes manual edits.";

const documentField = () => screen.getByLabelText("Markdown document") as HTMLTextAreaElement;
const editDocument = (value: string) => fireEvent.change(documentField(), { target: { value } });
const namedButton = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("editable document and stale preview", () => {
  it("keeps restore unavailable until the document differs from the last assembly", () => {
    expect(namedButton("Restore generated draft").disabled).toBe(true);
    fillRequired();
    assemble();
    expect(documentField().readOnly).toBe(false);
    expect(namedButton("Restore generated draft").disabled).toBe(true);
    expect(screen.queryByText(STALE_NOTICE)).toBeNull();
    expect(screen.queryByText(EDITED_NOTICE)).toBeNull();
  });

  it("preserves typed Markdown exactly and clears the edited notice when the generated text returns", () => {
    fillRequired();
    assemble();
    const generated = preview();
    const typed = `${generated}  {{lineCoverage}}\n`;

    editDocument(typed);
    expect(preview()).toBe(typed);
    expect(screen.getByText(EDITED_NOTICE)).toBeTruthy();
    expect(screen.queryByText(STALE_NOTICE)).toBeNull();
    expect(namedButton("Restore generated draft").disabled).toBe(false);

    editDocument(generated);
    expect(screen.queryByText(EDITED_NOTICE)).toBeNull();
    expect(namedButton("Restore generated draft").disabled).toBe(true);
  });

  it("marks a configuration change as stale without treating it as an edit, and clears that when reverted", () => {
    fillRequired();
    assemble();
    fireEvent.change(field("Application type"), { target: { value: "other" } });
    expect(screen.queryByText(STALE_NOTICE)).toBeNull();

    change("Project name", "Receipt Tracker 2");
    expect(screen.getByText(STALE_NOTICE)).toBeTruthy();
    expect(screen.queryByText(EDITED_NOTICE)).toBeNull();

    change("Project name", "Receipt Tracker");
    expect(screen.queryByText(STALE_NOTICE)).toBeNull();
  });

  it("reassembles a stale document immediately when it has no manual edits", () => {
    fillRequired();
    assemble();
    const generated = preview();
    change("Project name", "Receipt Tracker 2");
    assemble();

    expect(screen.queryByRole("heading", { name: "Replace manual edits?" })).toBeNull();
    expect(preview()).not.toBe(generated);
    expect(preview()).toContain("Receipt Tracker 2");
    expect(screen.queryByText(STALE_NOTICE)).toBeNull();
  });

  it("reassembles without a prompt when the document is already the generated text", () => {
    fillRequired();
    assemble();
    const generated = preview();
    assemble();
    expect(preview()).toBe(generated);
    expect(screen.queryByRole("heading", { name: "Replace manual edits?" })).toBeNull();
  });

  it("asks before replacing manual edits and keeps them when cancelled", () => {
    fillRequired();
    assemble();
    const generated = preview();
    const edited = `${generated}\nmanual note`;
    editDocument(edited);
    assemble();

    expect(preview()).toBe(edited);
    expect(screen.getByRole("heading", { name: "Replace manual edits?" })).toBeTruthy();
    expect(document.activeElement).toBe(namedButton("Keep edits"));

    fireEvent.click(namedButton("Keep edits"));
    expect(preview()).toBe(edited);
    expect(screen.queryByRole("heading", { name: "Replace manual edits?" })).toBeNull();
    expect(screen.getByText(EDITED_NOTICE)).toBeTruthy();
  });

  it("cancels replacement when Escape is pressed", () => {
    fillRequired();
    assemble();
    const edited = `${preview()}\nmanual note`;
    editDocument(edited);
    assemble();
    fireEvent.keyDown(namedButton("Keep edits"), { key: "Escape" });
    expect(preview()).toBe(edited);
    expect(screen.queryByRole("heading", { name: "Replace manual edits?" })).toBeNull();
  });

  it("replaces manual edits only after confirmation", () => {
    fillRequired();
    assemble();
    const generated = preview();
    editDocument(`${generated}\nmanual note`);
    assemble();
    fireEvent.click(namedButton("Replace edits"));

    expect(preview()).toBe(generated);
    expect(screen.queryByText(EDITED_NOTICE)).toBeNull();
    expect(screen.queryByText(STALE_NOTICE)).toBeNull();
    expect(namedButton("Restore generated draft").disabled).toBe(true);
  });

  it("drops the replacement prompt when the configuration or document changes", () => {
    fillRequired();
    assemble();
    const edited = `${preview()}\nmanual note`;
    editDocument(edited);
    assemble();
    expect(screen.getByRole("heading", { name: "Replace manual edits?" })).toBeTruthy();

    change("Project name", "Receipt Tracker 2");
    expect(screen.queryByRole("heading", { name: "Replace manual edits?" })).toBeNull();
    expect(preview()).toBe(edited);

    change("Project name", "Receipt Tracker");
    assemble();
    expect(screen.getByRole("heading", { name: "Replace manual edits?" })).toBeTruthy();
    editDocument(`${edited} more`);
    expect(screen.queryByRole("heading", { name: "Replace manual edits?" })).toBeNull();
  });

  it("blocks an invalid reassembly and keeps the edited document", () => {
    fillRequired();
    assemble();
    const edited = `${preview()}\nmanual note`;
    editDocument(edited);
    change("Project name", "   ");
    assemble();

    expect(screen.getByText("Project name is required.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Replace manual edits?" })).toBeNull();
    expect(preview()).toBe(edited);
    expect(document.activeElement).toBe(field("Project name"));
  });

  it("keeps manual edits when assembly fails", () => {
    cleanup();
    const view = render(<RequirementsBuilder templates={templates} />);
    fillRequired();
    assemble();
    const edited = `${preview()}\nmanual note`;
    editDocument(edited);

    const incomplete = { ...templates };
    delete incomplete["business-core"];
    view.rerender(<RequirementsBuilder templates={incomplete} />);
    assemble();

    expect(screen.getByRole("alert").textContent).toBe('Assembly failed: Missing template for module "business-core".');
    expect(preview()).toBe(edited);
    expect(screen.queryByRole("heading", { name: "Replace manual edits?" })).toBeNull();
  });

  it("restores the last generated draft and leaves a stale configuration marked", () => {
    fillRequired();
    assemble();
    const generated = preview();
    change("Project name", "Receipt Tracker 2");
    editDocument(`${generated}\nmanual note`);
    fireEvent.click(namedButton("Restore generated draft"));

    expect(screen.getByRole("heading", { name: "Restore the generated draft?" })).toBeTruthy();
    expect(screen.getByText("The restored draft matches the last assembly, not the current configuration.")).toBeTruthy();
    expect(document.activeElement).toBe(namedButton("Keep edits"));

    fireEvent.click(namedButton("Keep edits"));
    expect(preview()).toBe(`${generated}\nmanual note`);

    fireEvent.click(namedButton("Restore generated draft"));
    fireEvent.click(namedButton("Restore draft"));
    expect(preview()).toBe(generated);
    expect(screen.getByText(STALE_NOTICE)).toBeTruthy();
    expect(screen.queryByText(EDITED_NOTICE)).toBeNull();
    expect(namedButton("Restore generated draft").disabled).toBe(true);
  });

  it("copies and downloads the edited document", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    fillRequired();
    assemble();
    const edited = `${preview()}\nmanual note  \n{{lineCoverage}}`;
    editDocument(edited);
    change("Project name", "Receipt Tracker 2");

    fireEvent.click(namedButton("Copy Markdown"));
    expect(await screen.findByText("Copied the current Markdown.")).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(edited);

    let blob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((value) => {
      blob = value as Blob;
      return "blob:preview";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(namedButton("Download Markdown"));
    expect(await blob?.text()).toBe(edited);

    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    vi.restoreAllMocks();
  });

  it("disables copy and download when the edited document is empty", () => {
    fillRequired();
    assemble();
    editDocument("");
    expect(namedButton("Copy Markdown").disabled).toBe(true);
    expect(namedButton("Download Markdown").disabled).toBe(true);
    expect(namedButton("Restore generated draft").disabled).toBe(false);
    expect(screen.getByText(EDITED_NOTICE)).toBeTruthy();
  });

  it("names downloads sequentially, keeps the count after remount, and leaves the counter unchanged when the download does not start", async () => {
    fillRequired("Users can upload a receipt.\n");
    assemble();
    const edited = `${preview()}manual note  \n`;
    editDocument(edited);

    const clicks: HTMLAnchorElement[] = [];
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((value) => {
      blobs.push(value as Blob);
      return "blob:preview";
    });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this);
    });

    fireEvent.click(namedButton("Download Markdown"));
    click.mockImplementationOnce(() => {
      throw new Error("download blocked");
    });
    fireEvent.click(namedButton("Download Markdown"));
    fireEvent.click(namedButton("Download Markdown"));

    expect(clicks.map((anchor) => anchor.download)).toEqual([
      "PROJECT_REQUIREMENTS.md",
      "PROJECT_REQUIREMENTS (1).md",
    ]);
    expect(await blobs[0].text()).toBe(edited);
    expect(await blobs[1].text()).toBe(edited);
    expect(edited.endsWith("\n")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revoke).toHaveBeenCalledWith("blob:preview");

    cleanup();
    render(<RequirementsBuilder templates={templates} />);
    fillRequired("Users can upload a receipt.\n");
    assemble();
    fireEvent.click(namedButton("Download Markdown"));
    expect(clicks.at(-1)?.download).toBe("PROJECT_REQUIREMENTS (2).md");
    vi.restoreAllMocks();
  });

  it("keeps numbering in memory when session storage is unavailable", () => {
    const sessionStorageDescriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("storage blocked");
      },
    });
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this);
    });

    try {
      fillRequired();
      assemble();
      fireEvent.click(namedButton("Download Markdown"));
      fireEvent.click(namedButton("Download Markdown"));
      expect(clicks.map((anchor) => anchor.download)).toEqual([
        "PROJECT_REQUIREMENTS.md",
        "PROJECT_REQUIREMENTS (1).md",
      ]);

      cleanup();
      render(<RequirementsBuilder templates={templates} />);
      fillRequired();
      assemble();
      fireEvent.click(namedButton("Download Markdown"));
      expect(clicks.at(-1)?.download).toBe("PROJECT_REQUIREMENTS.md");
    } finally {
      if (sessionStorageDescriptor) Object.defineProperty(window, "sessionStorage", sessionStorageDescriptor);
      vi.restoreAllMocks();
    }
  });

  it("asks the browser to confirm leaving only while the document has manual edits", () => {
    const leaving = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    fillRequired();
    assemble();
    expect(leaving()).toBe(false);

    change("Project name", "Receipt Tracker 2");
    expect(leaving()).toBe(false);

    const generated = preview();
    editDocument(`${generated}\nmanual note`);
    expect(leaving()).toBe(true);

    editDocument(generated);
    expect(leaving()).toBe(false);
  });
});

describe("configuration advisories", () => {
  const recommendation = `${UI_TEXT.advisories.recommendationPrefix} ${UI_TEXT.advisories.integrationTestsHttpFullStack}`;

  function selectHttpFullStack() {
    change("Application type", "web-app");
    fireEvent.click(field("React + Vite"));
    fireEvent.click(field("Backend Java"));
    fireEvent.click(field("Includes an HTTP API"));
    change("Backend framework", "spring-boot");
  }

  it("associates the recommendation with the integration tests checkbox", () => {
    selectHttpFullStack();
    const checkbox = field("Integration tests");
    const note = screen.getByText(recommendation);
    expect(checkbox.checked).toBe(false);
    expect(checkbox.id).toBe("field-integrationTests");
    expect(checkbox.tabIndex).toBe(0);
    expect(checkbox.getAttribute("aria-invalid")).toBeNull();
    expect(checkbox.getAttribute("aria-describedby")).toBe("advisory-integration-tests-http-fullstack");
    expect(note.id).toBe("advisory-integration-tests-http-fullstack");
    expect(note.getAttribute("role")).toBeNull();
    expect(preview()).toBe("");
  });

  it("removes the recommendation as soon as integration tests are selected, without assembling", () => {
    selectHttpFullStack();
    expect(screen.getByText(recommendation)).toBeTruthy();
    fireEvent.click(field("Integration tests"));
    expect(field("Integration tests").checked).toBe(true);
    expect(screen.queryByText(recommendation)).toBeNull();
    expect(field("Integration tests").getAttribute("aria-describedby")).toBeNull();
    expect(preview()).toBe("");
    expect(screen.getByRole("button", { name: "Assemble Draft" })).toBeTruthy();
  });

  it("removes the recommendation when the HTTP API is cleared and leaves integration tests off", () => {
    selectHttpFullStack();
    fireEvent.click(field("Includes an HTTP API"));
    expect(field("Includes an HTTP API").checked).toBe(false);
    expect(field("Integration tests").checked).toBe(false);
    expect(screen.queryByText(recommendation)).toBeNull();
  });

  it("assembles and enables download while the recommendation remains", () => {
    selectHttpFullStack();
    fillRequired();
    expect(screen.getByText(recommendation)).toBeTruthy();
    assemble();
    const document = preview();
    expect(document).toContain("# Project Requirements");
    expect(document).toContain("### Module: `react-vite`");
    expect(document).toContain("### Module: `spring-boot`");
    expect(document).not.toContain("### Module: `integration-tests`");
    expect(document).not.toContain(recommendation);
    expect(document).not.toContain(UI_TEXT.advisories.integrationTestsHttpFullStack);
    expect(screen.getByText(recommendation)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Download Markdown" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

function typeInto(label: string, text: string) {
  const element = field(label);
  expect(element.readOnly).toBe(false);
  expect(element.disabled).toBe(false);
  let value = element.value;
  const start = value;
  for (const character of text) {
    value += character;
    fireEvent.change(element, { target: { value } });
    expect(element.value).toBe(value);
  }
  expect(element.value).toBe(start + text);
}

describe("structured requirements", () => {
  function openStructured(choice: "Copy current text" | "Start with an empty list") {
    fireEvent.click(screen.getByRole("button", { name: "Use structured requirements" }));
    fireEvent.click(screen.getByRole("button", { name: choice }));
  }

  it("keeps typed free-text visible, editable, and in the generated document", () => {
    change("Project name", "People Directory");
    const businessRequirements = "  Show the people list.\nKeep the spacing.  ";
    const acceptanceCriteria = "\tThe list is visible.\n";
    typeInto("Business requirements", businessRequirements);
    typeInto("Acceptance criteria (optional)", acceptanceCriteria);
    assemble();
    const generated = preview();
    expect(generated).toContain(businessRequirements);
    expect(generated).toContain(acceptanceCriteria);
    expect(generated).toContain("### User-provided requirements");

    fireEvent.click(screen.getByRole("button", { name: "Use structured requirements" }));
    typeInto("Business requirements", "Still editable.");
    typeInto("Acceptance criteria (optional)", "Still editable.");
    expect(field("Business requirements").value).toBe(`${businessRequirements}Still editable.`);
    expect(field("Acceptance criteria (optional)").value).toBe(`${acceptanceCriteria}Still editable.`);
    fireEvent.click(screen.getByRole("button", { name: "Copy current text" }));

    expect(field("Business requirements").readOnly).toBe(false);
    expect(field("Acceptance criteria (optional)").readOnly).toBe(false);
    expect(screen.getAllByText(UI_TEXT.fields.structuredKept).length).toBeGreaterThan(0);
    expect(field("FR-001 text").value).toBe(`${businessRequirements}Still editable.`);
    expect(field("AC-001 text").value).toBe(`${acceptanceCriteria}Still editable.`);
    typeInto("FR-001 text", " Added.");
    typeInto("AC-001 text", " Added.");
    assemble();
    const structuredDocument = preview();
    expect(structuredDocument).toContain(`${businessRequirements}Still editable. Added.`);
    expect(structuredDocument).toContain(`${acceptanceCriteria}Still editable. Added.`);
    expect(structuredDocument).toContain("### Confirmed functional requirements");
    expect(structuredDocument).not.toContain("### User-provided requirements");
    fireEvent.click(screen.getByRole("button", { name: "Add functional requirement" }));
    expect(field("FR-001 text").value).toBe(`${businessRequirements}Still editable. Added.`);
    expect(field("FR-002 text").value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Return to free-text requirements" }));
    const restoredBusiness = field("Business requirements");
    const restoredAcceptance = field("Acceptance criteria (optional)");
    expect(restoredBusiness.readOnly).toBe(false);
    expect(restoredAcceptance.readOnly).toBe(false);
    expect(restoredBusiness.value).toBe(`${businessRequirements}Still editable.`);
    expect(restoredAcceptance.value).toBe(`${acceptanceCriteria}Still editable.`);
    typeInto("Business requirements", " Back.");
    assemble();
    expect(preview()).toContain(`${businessRequirements}Still editable. Back.`);
    expect(preview()).not.toContain("**FR-001.**");
    fireEvent.click(screen.getByRole("button", { name: "Use structured requirements" }));
    expect(screen.queryByRole("heading", { name: "Use structured requirements?" })).toBeNull();
    expect(field("Business requirements").readOnly).toBe(false);
    expect(field("Business requirements").value).toBe(`${businessRequirements}Still editable. Back.`);
    expect(field("FR-001 text").value).toBe(`${businessRequirements}Still editable. Added.`);
  });

  it("starts structured mode without copying and keeps the original text", () => {
    fillRequired("Free-text source that must not be repeated.");
    openStructured("Start with an empty list");
    const source = field("Business requirements");
    expect(source.value).toBe("Free-text source that must not be repeated.");
    expect(source.readOnly).toBe(false);
    expect(source.disabled).toBe(false);
    expect(screen.getAllByText(UI_TEXT.fields.structuredKept).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("FR-001 text")).toBeNull();
    assemble();
    expect(screen.getByText("Add a confirmed functional requirement, or return to free-text requirements.")).toBeTruthy();
    expect(preview()).toBe("");
    expect(document.activeElement).toBe(document.getElementById("field-requirementsContent"));
  });

  it("copies the current text once and leaves proposed items out of the document", () => {
    const businessRequirements = "  Show the people list.\n";
    fillRequired(businessRequirements);
    change("Acceptance criteria (optional)", "Automated tests pass.");
    openStructured("Copy current text");
    expect(field("FR-001 text").value).toBe(businessRequirements);
    expect(field("AC-001 scope").value).toBe("project");
    expect(field("Acceptance criteria (optional)").value).toBe("Automated tests pass.");
    expect(field("Acceptance criteria (optional)").readOnly).toBe(false);
    expect(field("Business requirements").readOnly).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Add functional requirement" }));
    fireEvent.change(field("FR-002 text"), { target: { value: "The person record includes an unspecified nickname." } });
    change("FR-002 status", "proposed");
    assemble();
    const documentText = preview();
    expect(documentText).toContain("**FR-001.**   Show the people list.");
    expect(documentText).toContain("Applies to the whole project.");
    expect(documentText).not.toContain("unspecified nickname");
    expect(documentText.split(businessRequirements)).toHaveLength(2);
    expect(screen.getByLabelText("FR-002 text")).toBeTruthy();
  });

  it("removes an unreferenced requirement immediately and asks before removing a linked one", () => {
    fillRequired("Show the people list.");
    openStructured("Copy current text");
    fireEvent.click(screen.getByRole("button", { name: "Remove FR-001" }));
    expect(screen.queryByLabelText("FR-001 text")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Remove FR-001?" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add functional requirement" }));
    fireEvent.change(field("FR-002 text"), { target: { value: "Show the people list." } });
    fireEvent.click(screen.getByRole("button", { name: "Add requirement criterion" }));
    fireEvent.change(field("AC-001 text"), { target: { value: "The list is visible." } });
    fireEvent.click(field("AC-001 applies to FR-002"));
    fireEvent.click(screen.getByRole("button", { name: "Remove FR-002" }));
    const confirmation = screen.getByRole("region", { name: "Remove FR-002?" });
    expect(
      within(confirmation).getByText(
        "AC-001 will remain. Its reference to FR-002 will be removed. If it loses its last reference, it becomes project-wide.",
      ),
    ).toBeTruthy();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    expect(field("FR-002 text").value).toBe("Show the people list.");

    fireEvent.click(screen.getByRole("button", { name: "Remove FR-002" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Remove FR-002?" })).getByRole("button", { name: "Remove FR-002" }));
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();
    expect(field("AC-001 text").value).toBe("The list is visible.");
    expect(field("AC-001 scope").value).toBe("project");
    expect(screen.queryByLabelText("AC-001 applies to FR-002")).toBeNull();
  });

  it("cancels the mode change and can make a criterion project-wide", () => {
    fillRequired("Show the people list.");
    fireEvent.click(screen.getByRole("button", { name: "Use structured requirements" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(field("Business requirements").readOnly).toBe(false);
    expect(screen.queryByLabelText("FR-001 text")).toBeNull();

    openStructured("Copy current text");
    fireEvent.click(screen.getByRole("button", { name: "Add requirement criterion" }));
    fireEvent.change(field("AC-001 text"), { target: { value: "The list is visible." } });
    fireEvent.click(field("AC-001 applies to FR-001"));
    change("AC-001 scope", "project");
    expect(field("AC-001 scope").value).toBe("project");
    expect(screen.queryByLabelText("AC-001 applies to FR-001")).toBeNull();
  });

  it("assembles confirmed requirements while an incomplete proposal stays in the editor", () => {
    fillRequired("Show the people list.");
    openStructured("Copy current text");
    fireEvent.click(screen.getByRole("button", { name: "Add functional requirement" }));
    change("FR-002 status", "proposed");
    expect(screen.getAllByText("FR-002 needs text.")).toHaveLength(1);
    expect(field("FR-002 text").getAttribute("aria-invalid")).toBeNull();
    assemble();
    const documentText = preview();
    expect(documentText).toContain("### Confirmed functional requirements");
    expect(documentText).toContain("**FR-001.** Show the people list.");
    expect(documentText).not.toContain("**FR-002.**");
    expect(screen.getByLabelText("FR-002 text")).toBeTruthy();

    change("FR-002 status", "confirmed");
    assemble();
    expect(screen.getAllByText("FR-002 needs text.").length).toBeGreaterThan(1);
    expect(preview()).toBe(documentText);
    expect(document.activeElement).toBe(document.getElementById("field-FR-002-text"));
  });

  it("marks structured edits as stale and keeps manual markdown until confirmed", () => {
    fillRequired("Show the people list.");
    openStructured("Copy current text");
    assemble();
    const generated = preview();
    expect(screen.queryByText(STALE_NOTICE)).toBeNull();

    fireEvent.change(field("FR-001 text"), { target: { value: "Show the updated list." } });
    expect(screen.getByText(STALE_NOTICE)).toBeTruthy();
    expect(preview()).toBe(generated);
    fireEvent.change(field("FR-001 text"), { target: { value: "Show the people list." } });
    expect(screen.queryByText(STALE_NOTICE)).toBeNull();

    change("FR-001 status", "proposed");
    expect(screen.getByText(STALE_NOTICE)).toBeTruthy();
    expect(preview()).toBe(generated);
    change("FR-001 status", "confirmed");
    expect(screen.queryByText(STALE_NOTICE)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add project-wide criterion" }));
    fireEvent.change(field("AC-001 text"), { target: { value: "The list is visible." } });
    change("AC-001 scope", "requirement");
    fireEvent.click(field("AC-001 applies to FR-001"));
    expect(screen.getByText(STALE_NOTICE)).toBeTruthy();
    expect(preview()).toBe(generated);
    fireEvent.click(screen.getByRole("button", { name: "Remove AC-001" }));
    expect(screen.getByText(STALE_NOTICE)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Return to free-text requirements" }));
    expect(screen.getByText(STALE_NOTICE)).toBeTruthy();
    expect(preview()).toBe(generated);
    const edited = `${generated}\nmanual note`;
    editDocument(edited);
    assemble();
    expect(screen.getByRole("heading", { name: "Replace manual edits?" })).toBeTruthy();
    fireEvent.click(namedButton("Keep edits"));
    expect(preview()).toBe(edited);
  });

  it("returns to free-text requirements without discarding either copy", () => {
    fillRequired("Show the people list.");
    openStructured("Copy current text");
    fireEvent.click(screen.getByRole("button", { name: "Return to free-text requirements" }));
    const source = field("Business requirements");
    expect(source.readOnly).toBe(false);
    expect(source.value).toBe("Show the people list.");
    assemble();
    expect(preview()).toContain("Show the people list.");
    expect(preview()).not.toContain("**FR-001.**");
    fireEvent.click(screen.getByRole("button", { name: "Use structured requirements" }));
    expect(screen.queryByRole("heading", { name: "Use structured requirements?" })).toBeNull();
    expect(field("FR-001 text").value).toBe("Show the people list.");
  });
});

describe("configuration import and export", () => {
  function configurationFile(contents: string, name = "PROJECT_CONFIGURATION.json") {
    return new File([contents], name, { type: "application/json" });
  }

  function importFile(contents: string) {
    fireEvent.change(screen.getByLabelText("Import configuration"), { target: { files: [configurationFile(contents)] } });
  }

  it("exports the current form as PROJECT_CONFIGURATION.json", async () => {
    change("Project name", "Receipt Tracker");
    let blob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((value) => {
      blob = value as Blob;
      return "blob:config";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this);
    });

    fireEvent.click(screen.getByRole("button", { name: "Export configuration" }));

    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe("PROJECT_CONFIGURATION.json");
    expect(blob?.type).toBe("application/json;charset=utf-8");
    expect(await blob?.text()).toContain("Receipt Tracker");
    expect(field("Project name").value).toBe("Receipt Tracker");
  });

  it("imports a configuration, leaves the current document, and reassembles the same draft", async () => {
    fillRequired();
    assemble();
    const firstDraft = preview();

    const imported = {
      ...defaultConfig,
      projectName: "Imported Ledger",
      businessRequirements: "Users can export a ledger.",
      appType: "web-app" as const,
      uiFrameworks: [defaultUiFramework("nextjs")],
      uiLanguages: [defaultToolchain("typescript")],
      backendLanguages: [defaultToolchain("java")],
    };
    importFile(serializeConfig(imported, moduleVersionMap()));

    expect(
      await screen.findByText("Imported the configuration. Assemble again to update the document."),
    ).toBeTruthy();
    expect(preview()).toBe(firstDraft);
    expect(screen.getByText("The configuration has changed since this document was assembled.")).toBeTruthy();
    expect(field("Project name").value).toBe("Imported Ledger");
    expect(field("Backend Java").checked).toBe(true);
    expect(field("UI TypeScript").checked).toBe(true);

    assemble();
    expect(preview()).toBe(assembleRequirements(normalizeSelections(imported), templates));
  });

  it("imports a framework without adding a UI language and focuses the language checkbox", async () => {
    change("Application type", "web-app");
    const imported = {
      ...defaultConfig,
      projectName: "Imported Ledger",
      businessRequirements: "Users can export a ledger.",
      appType: "web-app" as const,
      uiFrameworks: [defaultUiFramework("react-vite")],
      uiLanguages: [],
    };
    importFile(serializeConfig(imported, moduleVersionMap()));

    const language = field("UI TypeScript");
    const group = document.getElementById("field-uiLanguages");
    expect(await screen.findByText("Select a UI language for the selected UI framework.")).toBeTruthy();
    expect(language.checked).toBe(false);
    expect(field("React + Vite").checked).toBe(true);
    expect(group?.getAttribute("aria-invalid")).toBe("true");
    expect(group?.getAttribute("aria-describedby")).toBe("field-uiLanguages-error");
    expect(language.getAttribute("aria-describedby")).toBe("field-uiLanguages-error");
    expect(document.activeElement).toBe(language);
    expect(preview()).toBe("");
  });

  it("shows field errors when the imported form is incomplete", async () => {
    importFile(serializeConfig(defaultConfig, moduleVersionMap()));

    expect(await screen.findByText("Project name is required.")).toBeTruthy();
    expect(screen.getByText("Business requirements are required.")).toBeTruthy();
    expect(document.activeElement).toBe(field("Project name"));
  });

  it("warns when the saved template library differs and still applies the file", async () => {
    const imported = {
      ...defaultConfig,
      projectName: "Imported Ledger",
      businessRequirements: "Users can export a ledger.",
    };
    const file = JSON.parse(serializeConfig(imported, moduleVersionMap())) as { moduleVersions: Record<string, string> };
    file.moduleVersions["business-core"] = "9.9.9";
    importFile(JSON.stringify(file));

    expect(
      await screen.findByText(
        "Imported the configuration. The template library has changed since this file was saved, so assembly uses the current templates.",
      ),
    ).toBeTruthy();
    expect(field("Project name").value).toBe("Imported Ledger");
  });

  it("leaves the form unchanged when the file cannot be imported", async () => {
    change("Project name", "Keep me");

    importFile("{");
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Configuration file is not valid JSON.");
    expect(field("Project name").value).toBe("Keep me");

    importFile("{}");
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Configuration file is not a requirements builder configuration.",
    );
    expect(field("Project name").value).toBe("Keep me");

    importFile("x".repeat(256 * 1024 + 1));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Configuration file must be 256 KB or smaller.");
    expect(field("Project name").value).toBe("Keep me");
  });

  it("reports a failed export and leaves the form unchanged", () => {
    change("Project name", "Keep me");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("download blocked");
    });

    fireEvent.click(screen.getByRole("button", { name: "Export configuration" }));

    expect(screen.getByRole("alert")).toHaveProperty("textContent", "Could not export the configuration.");
    expect(field("Project name").value).toBe("Keep me");
  });
});

const analysisFinding = {
  id: "F-001",
  category: "ambiguity",
  severity: "medium",
  explanation: "The upload size is not stated.",
  relatedRequirementIds: [] as string[],
  question: "What is the maximum file size?",
  suggestedAction: null,
  uncertainty: null,
};

function analysisResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function holdAnalysisFetch() {
  const pending: Array<{ resolve: (response: Response) => void; reject: (error: unknown) => void; body: string }> = [];
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : "";
    return new Promise<Response>((resolve, reject) => {
      pending.push({ resolve, reject, body });
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { pending, fetchMock };
}

function fingerprintOf(body: string) {
  const sent = JSON.parse(body) as { config: ProjectConfig };
  return analysisFingerprint(buildAnalysisInput(sent.config));
}

function writingBody(body: string, suggestions: unknown[]) {
  const sent = JSON.parse(body) as { config: ProjectConfig };
  const input = buildWritingInput(sent.config, []);
  return {
    ok: true,
    fingerprint: writingFingerprint(input),
    sourceFingerprint: writingSourceFingerprint(input),
    origin: input.requirements.kind,
    result: { suggestions, nextSuggestionNumber: suggestions.length + 1 },
    includedClarifications: input.clarifications,
    excludedFindingIds: [] as string[],
  };
}

describe("AI requirements analysis", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends nothing until the privacy confirmation is accepted", () => {
    const { fetchMock } = holdAnalysisFetch();

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
    const privacy = screen.getByRole("region", { name: UI_TEXT.analysis.confirmHeading });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(within(privacy).getByRole("button", { name: UI_TEXT.buttons.cancel }));

    fireEvent.click(within(privacy).getByRole("button", { name: UI_TEXT.buttons.cancel }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: UI_TEXT.analysis.confirmHeading })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
    fireEvent.keyDown(screen.getByRole("button", { name: UI_TEXT.buttons.cancel }), { key: "Escape" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: UI_TEXT.analysis.confirmHeading })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
  });

  it("disables the button while a request is in flight and leaves the form and document unchanged", async () => {
    fillRequired();
    assemble();
    const before = preview();
    const { pending, fetchMock } = holdAnalysisFetch();

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.send }));

    const analyzeButton = screen.getByRole("button", { name: UI_TEXT.analysis.analyze });
    expect((analyzeButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(UI_TEXT.analysis.working)).toBeTruthy();
    fireEvent.click(analyzeButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    pending[0].resolve(
      analysisResponse({
        ok: true,
        fingerprint: fingerprintOf(pending[0].body),
        result: { findings: [analysisFinding] },
      }),
    );

    expect(await screen.findByText(analysisFinding.explanation)).toBeTruthy();
    expect(screen.getByText(UI_TEXT.analysis.advisory)).toBeTruthy();
    expect(screen.getByText(UI_TEXT.analysis.question(analysisFinding.question))).toBeTruthy();
    expect(screen.queryByText(/Suggested action:/)).toBeNull();
    expect(preview()).toBe(before);
    expect(field("Project name").value).toBe("Receipt Tracker");
    expect(screen.queryByText(UI_TEXT.analysis.stale)).toBeNull();
    expect(before).not.toContain(analysisFinding.explanation);
  });

  it("marks a response stale when the form changes while the request is in flight", async () => {
    fillRequired();
    const { pending, fetchMock } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.send }));
    const sentFingerprint = fingerprintOf(pending[0].body);

    change("Project name", "Changed during analysis");
    pending[0].resolve(
      analysisResponse({
        ok: true,
        fingerprint: sentFingerprint,
        result: { findings: [analysisFinding] },
      }),
    );

    expect(await screen.findByText(UI_TEXT.analysis.stale)).toBeTruthy();
    expect(screen.getByText(analysisFinding.explanation)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    change("Project name", "Receipt Tracker");
    expect(screen.queryByText(UI_TEXT.analysis.stale)).toBeNull();
    expect(screen.getByText(analysisFinding.explanation)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("replaces a stale analysis when analysis is run again", async () => {
    fillRequired();
    const { pending } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.send }));
    change("Business requirements", "Users can delete a receipt.");
    const first = pending[0];
    first.resolve(
      analysisResponse({
        ok: true,
        fingerprint: fingerprintOf(first.body),
        result: { findings: [analysisFinding] },
      }),
    );
    expect(await screen.findByText(UI_TEXT.analysis.stale)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyzeAgain }));
    const second = pending[1];
    const replacement = { ...analysisFinding, explanation: "Deletion needs an undo window." };
    second.resolve(
      analysisResponse({
        ok: true,
        fingerprint: fingerprintOf(second.body),
        result: { findings: [replacement] },
      }),
    );

    expect(await screen.findByText(replacement.explanation)).toBeTruthy();
    expect(screen.queryByText(analysisFinding.explanation)).toBeNull();
    expect(screen.queryByText(UI_TEXT.analysis.stale)).toBeNull();
  });

  it("does not let an earlier response replace a newer analysis", async () => {
    fillRequired();
    const { pending } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
    const send = screen.getByRole("button", { name: UI_TEXT.analysis.send });
    await act(async () => {
      send.click();
      send.click();
    });
    expect(pending).toHaveLength(2);

    const newer = { ...analysisFinding, explanation: "Newer finding." };
    pending[1].resolve(
      analysisResponse({
        ok: true,
        fingerprint: fingerprintOf(pending[1].body),
        result: { findings: [newer] },
      }),
    );
    expect(await screen.findByText(newer.explanation)).toBeTruthy();

    pending[0].resolve(
      analysisResponse({
        ok: true,
        fingerprint: fingerprintOf(pending[0].body),
        result: { findings: [analysisFinding] },
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText(newer.explanation)).toBeTruthy();
    expect(screen.queryByText(analysisFinding.explanation)).toBeNull();
  });

  it("does not describe an empty result as proof that the requirements are complete", async () => {
    const { pending } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.send }));
    pending[0].resolve(
      analysisResponse({
        ok: true,
        fingerprint: fingerprintOf(pending[0].body),
        result: { findings: [] },
      }),
    );

    expect(await screen.findByText(UI_TEXT.analysis.noFindings)).toHaveProperty("textContent", UI_TEXT.analysis.noFindings);
    expect(screen.getByText(UI_TEXT.analysis.advisory)).toBeTruthy();
  });

  it("leaves the form and document intact when analysis fails", async () => {
    fillRequired("Users can upload a receipt.\n  Keep this line.");
    assemble();
    const before = preview();
    const { pending } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.send }));
    pending[0].resolve(analysisResponse({ ok: false, error: "provider" }, 502));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", UI_TEXT.analysis.errors.provider);
    expect(preview()).toBe(before);
    expect(field("Business requirements").value).toBe("Users can upload a receipt.\n  Keep this line.");
    expect(before).toContain("Users can upload a receipt.\n  Keep this line.");
  });

  it("reports an unusable analysis response without changing the document", async () => {
    fillRequired();
    assemble();
    const before = preview();
    const { pending } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.send }));
    pending[0].resolve(
      analysisResponse({
        ok: true,
        fingerprint: fingerprintOf(pending[0].body),
        result: { findings: [{ explanation: "not a finding" }] },
      }),
    );

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", UI_TEXT.analysis.errors["invalid-response"]);
    expect(preview()).toBe(before);
    expect(screen.queryByText("not a finding")).toBeNull();
  });

  const instructedFinding = {
    ...analysisFinding,
    category: "contradiction" as const,
    suggestedAction: "Clarify the upload limit.",
  };

  async function receiveAnalysis(finding: {
    explanation: string;
    question: string | null;
    suggestedAction: string | null;
  } = analysisFinding) {
    const held = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.send }));
    held.pending[0].resolve(
      analysisResponse({
        ok: true,
        fingerprint: fingerprintOf(held.pending[0].body),
        result: { findings: [finding] },
      }),
    );
    expect(await screen.findByText(finding.explanation)).toBeTruthy();
    return held;
  }

  function previewFact(region: HTMLElement, label: string) {
    const term = within(region).getByText(label);
    return term.nextElementSibling?.textContent ?? "";
  }

  function beginStructured(choice: "Copy current text" | "Start with an empty list") {
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.useStructuredRequirements }));
    fireEvent.click(screen.getByRole("button", { name: choice }));
  }

  it("records a decision and an exact answer without requesting analysis or creating a requirement", async () => {
    fillRequired("Users can upload a receipt.");
    assemble();
    const before = preview();
    const { fetchMock } = await receiveAnalysis(instructedFinding);

    expect(screen.getByRole("heading", { name: UI_TEXT.analysis.groups.clarification })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: UI_TEXT.analysis.groups.contradiction })).toBeNull();
    expect(screen.getByText(UI_TEXT.analysis.suggestedAction(instructedFinding.suggestedAction))).toBeTruthy();
    expect(screen.getByText(UI_TEXT.analysis.referenceOnly)).toBeTruthy();
    expect(screen.getByText(UI_TEXT.analysis.reviewSummary(1, 0, 0, 0))).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.markAddressed("F-001") }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.dismiss("F-001") }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.defer("F-001") }));
    expect(screen.getByText(UI_TEXT.analysis.decisionLabel("F-001", UI_TEXT.analysis.decisions.deferred))).toBeTruthy();
    expect(screen.getByText(UI_TEXT.analysis.reviewSummary(0, 1, 0, 0))).toBeTruthy();

    const answer = field(UI_TEXT.analysis.answerLabel("F-001"));
    fireEvent.change(answer, { target: { value: "  10 MB.\n" } });
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.saveAnswer("F-001") }));
    expect(screen.getByText(UI_TEXT.analysis.answerSaved)).toBeTruthy();
    expect(answer.value).toBe("  10 MB.\n");
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.markAddressed("F-001") }));
    expect(field(UI_TEXT.analysis.answerLabel("F-001")).value).toBe("  10 MB.\n");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(preview()).toBe(before);
    expect(before).not.toContain(instructedFinding.explanation);
    expect(before).not.toContain("Clarify the upload limit.");
    expect(before).not.toContain("  10 MB.\n");

    const propose = screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-001") });
    expect((propose as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(UI_TEXT.analysis.structuredRequired)).toBeTruthy();
    fireEvent.click(propose);
    expect(screen.queryByLabelText(UI_TEXT.analysis.proposedText("F-001"))).toBeNull();
  });

  it("keeps answers when analysis is stale and does not apply a change", async () => {
    fillRequired();
    beginStructured("Start with an empty list");
    const { fetchMock } = await receiveAnalysis(instructedFinding);
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-001") }));
    const draft = field(UI_TEXT.analysis.proposedText("F-001"));
    expect(draft.value).toBe("");
    fireEvent.change(draft, { target: { value: "Users can upload a receipt up to 10 MB." } });
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.previewChange("F-001") }));
    expect(screen.getByRole("button", { name: UI_TEXT.analysis.applyChange("F-001") })).toBeTruthy();

    change("Project name", "Changed during review");
    expect(screen.getByText(UI_TEXT.analysis.stale)).toBeTruthy();
    expect(screen.getByText(UI_TEXT.analysis.staleBlocked)).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /stale|override/i })).toBeNull();
    expect(field(UI_TEXT.analysis.proposedText("F-001")).value).toBe("Users can upload a receipt up to 10 MB.");
    const previewChange = screen.getByRole("button", { name: UI_TEXT.analysis.previewChange("F-001") });
    const applyChange = screen.getByRole("button", { name: UI_TEXT.analysis.applyChange("F-001") });
    expect((previewChange as HTMLButtonElement).disabled).toBe(true);
    expect((applyChange as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(applyChange);
    expect(screen.queryByLabelText("FR-001 text")).toBeNull();

    fireEvent.change(field(UI_TEXT.analysis.answerLabel("F-001")), { target: { value: "  10 MB.\n" } });
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.saveAnswer("F-001") }));
    expect(field(UI_TEXT.analysis.answerLabel("F-001")).value).toBe("  10 MB.\n");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(field("Business requirements").value).toBe("Users can upload a receipt.");
  });

  it("asks before a new analysis discards review records and keeps both runs distinct", async () => {
    fillRequired();
    const { pending, fetchMock } = await receiveAnalysis();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.markAddressed("F-001") }));
    fireEvent.change(field(UI_TEXT.analysis.answerLabel("F-001")), { target: { value: "  10 MB.\n" } });
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.saveAnswer("F-001") }));

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyzeAgain }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const rerun = screen.getByRole("region", { name: UI_TEXT.analysis.rerunHeading });
    const rerunCancel = within(rerun).getByRole("button", { name: UI_TEXT.buttons.cancel });
    expect(document.activeElement).toBe(rerunCancel);
    fireEvent.keyDown(rerunCancel, { key: "Escape" });
    expect(screen.queryByRole("region", { name: UI_TEXT.analysis.rerunHeading })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: UI_TEXT.analysis.analyzeAgain }));
    expect(screen.getByText(UI_TEXT.analysis.decisionLabel("F-001", UI_TEXT.analysis.decisions.addressed))).toBeTruthy();
    expect(field(UI_TEXT.analysis.answerLabel("F-001")).value).toBe("  10 MB.\n");

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyzeAgain }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.rerunContinue }));
    expect(screen.getByText(UI_TEXT.analysis.decisionLabel("F-001", UI_TEXT.analysis.decisions.addressed))).toBeTruthy();
    const replacement = { ...analysisFinding, explanation: "The second run also uses F-001." };
    pending[1].resolve(
      analysisResponse({
        ok: true,
        fingerprint: fingerprintOf(pending[1].body),
        result: { findings: [replacement] },
      }),
    );
    expect(await screen.findByText(replacement.explanation)).toBeTruthy();
    expect(screen.queryByText(analysisFinding.explanation)).toBeNull();
    expect(screen.getByText(UI_TEXT.analysis.decisionLabel("F-001", UI_TEXT.analysis.decisions.open))).toBeTruthy();
    expect(field(UI_TEXT.analysis.answerLabel("F-001")).value).toBe("");
  });

  it("leaves a proposed requirement out of the document until it is confirmed in the editor", async () => {
    const businessRequirements = "Users can upload a receipt.";
    fillRequired(businessRequirements);
    beginStructured("Start with an empty list");
    await receiveAnalysis(instructedFinding);

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-001") }));
    const draft = field(UI_TEXT.analysis.proposedText("F-001"));
    expect(draft.value).toBe("");
    fireEvent.change(draft, { target: { value: "Users can upload a receipt up to 10 MB." } });
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.previewChange("F-001") }));
    const changePreview = screen.getByRole("region", { name: UI_TEXT.analysis.previewChange("F-001") });
    expect(within(changePreview).getByText("Users can upload a receipt up to 10 MB.")).toBeTruthy();
    expect(within(changePreview).getByText(UI_TEXT.analysis.proposedPreview("FR-001"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.applyChange("F-001") }));

    expect(field("FR-001 text").value).toBe("Users can upload a receipt up to 10 MB.");
    expect(field("FR-001 status").value).toBe("proposed");
    expect(screen.getByText(UI_TEXT.analysis.appliedNote("FR-001"))).toBeTruthy();
    expect(screen.queryByText(UI_TEXT.analysis.applyRejected)).toBeNull();
    expect(field("Business requirements").value).toBe(businessRequirements);
    assemble();
    expect(screen.getByText("Add a confirmed functional requirement, or return to free-text requirements.")).toBeTruthy();
    expect(preview()).toBe("");

    change("FR-001 status", "confirmed");
    assemble();
    const documentText = preview();
    expect(documentText).toContain("**FR-001.** Users can upload a receipt up to 10 MB.");
    expect(documentText).not.toContain("(approved AI proposal)");
    expect(documentText).not.toContain("Clarify the upload limit.");
    expect(documentText).not.toContain(instructedFinding.explanation);
    expect(field("Business requirements").value).toBe(businessRequirements);
  });

  it("does not replace confirmed text until the authoritative confirmation, and keeps the id and source", async () => {
    const businessRequirements = "Users can upload a receipt.";
    fillRequired(businessRequirements);
    beginStructured("Copy current text");
    await receiveAnalysis(instructedFinding);

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-001") }));
    change(UI_TEXT.analysis.changeLabel("F-001"), "update-functional");
    change(UI_TEXT.analysis.targetLabel("F-001"), "FR-001");
    const draft = field(UI_TEXT.analysis.proposedText("F-001"));
    expect(draft.value).toBe("");
    fireEvent.change(draft, { target: { value: "Users can upload a receipt up to 10 MB." } });
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.previewChange("F-001") }));
    expect(field("FR-001 text").value).toBe(businessRequirements);
    const changePreview = screen.getByRole("region", { name: UI_TEXT.analysis.suggestedReplacement("FR-001") });
    expect(previewFact(changePreview, UI_TEXT.analysis.previewId)).toBe("FR-001");
    expect(previewFact(changePreview, UI_TEXT.analysis.previewSource)).toBe(UI_TEXT.analysis.sources.user);
    expect(previewFact(changePreview, UI_TEXT.analysis.previewStatus)).toBe(UI_TEXT.requirementStatus.confirmed);
    expect(previewFact(changePreview, UI_TEXT.analysis.previewCurrentText)).toBe(businessRequirements);
    expect(previewFact(changePreview, UI_TEXT.analysis.previewProposedText)).toBe("Users can upload a receipt up to 10 MB.");
    expect(within(changePreview).getByText(UI_TEXT.analysis.replacesAuthoritative("FR-001"))).toBeTruthy();
    expect(screen.queryByRole("button", { name: UI_TEXT.analysis.applyChange("F-001") })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.authoritativeHeading("FR-001") }));
    const confirmation = screen.getByRole("region", { name: UI_TEXT.analysis.authoritativeHeading("FR-001") });
    expect(within(confirmation).getByText(UI_TEXT.analysis.authoritativeBody)).toBeTruthy();
    expect(document.activeElement).toBe(within(confirmation).getByRole("button", { name: UI_TEXT.buttons.cancel }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    expect(screen.queryByRole("region", { name: UI_TEXT.analysis.authoritativeHeading("FR-001") })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: UI_TEXT.analysis.authoritativeHeading("FR-001") }));
    expect(field("FR-001 text").value).toBe(businessRequirements);
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.authoritativeHeading("FR-001") }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.authoritativeReplace("FR-001") }));
    expect(field("FR-001 text").value).toBe("Users can upload a receipt up to 10 MB.");
    expect(field("FR-001 status").value).toBe("confirmed");
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();
    assemble();
    const documentText = preview();
    expect(documentText).toContain("**FR-001.** Users can upload a receipt up to 10 MB.");
    expect(documentText).not.toContain("(approved AI proposal)");
    expect(documentText).not.toContain("Clarify the upload limit.");
    expect(field("Business requirements").value).toBe(businessRequirements);
  });

  it("does not let an older apply overwrite a newer structured edit", async () => {
    const businessRequirements = "Users can upload a receipt.";
    const edited = "Edited in the structured editor.";
    const proposed = "Users can upload a receipt up to 10 MB.";
    fillRequired(businessRequirements);
    beginStructured("Copy current text");
    await receiveAnalysis(instructedFinding);

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-001") }));
    change(UI_TEXT.analysis.changeLabel("F-001"), "update-functional");
    change(UI_TEXT.analysis.targetLabel("F-001"), "FR-001");
    fireEvent.change(field(UI_TEXT.analysis.proposedText("F-001")), { target: { value: proposed } });
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.previewChange("F-001") }));
    expect(field("FR-001 text").value).toBe(businessRequirements);

    change("FR-001 text", edited);
    expect(screen.queryByRole("button", { name: UI_TEXT.analysis.authoritativeReplace("FR-001") })).toBeNull();
    expect(field("FR-001 text").value).toBe(edited);
    expect(screen.queryByText(UI_TEXT.analysis.appliedNote("FR-001"))).toBeNull();

    const original = beginStructuredRequirements(defaultRequirementsContent(), "copy", businessRequirements, "");
    const draft = {
      action: "update-functional" as const,
      id: "FR-001",
      text: proposed,
      replaceConfirmed: true,
    };
    const prepared = prepareRequirementChange(original, draft);
    expect(prepared).not.toBeNull();
    const newer = updateFunctionalRequirement(original, "FR-001", { text: edited });
    const current = {
      ...defaultConfig,
      projectName: "Receipt Tracker",
      businessRequirements,
      requirementsContent: newer,
    };
    const committed = commitPreparedRequirementChange(current, draft, prepared!);
    expect(committed).toBe(current);
    expect(requirementsOf(committed).functionalRequirements[0]?.text).toBe(edited);
    expect(requirementsOf(committed).functionalRequirements[0]?.source).toBe("user");
    expect(requirementsOf(committed).nextFunctionalNumber).toBe(newer.nextFunctionalNumber);
    expect(field("FR-001 text").value).toBe(edited);
  });

  it("reports a parent rejection after a preview that was valid locally", async () => {
    const businessRequirements = "Users can upload a receipt.";
    const edited = "Edited in the structured editor.";
    const proposed = "Users can upload a receipt up to 10 MB.";
    fillRequired(businessRequirements);
    beginStructured("Copy current text");
    await receiveAnalysis(instructedFinding);

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-001") }));
    fireEvent.change(field(UI_TEXT.analysis.proposedText("F-001")), { target: { value: proposed } });
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.previewChange("F-001") }));
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();
    const apply = screen.getByRole("button", { name: UI_TEXT.analysis.applyChange("F-001") });
    const requirement = field("FR-001 text");
    const handler = (element: HTMLElement, name: string) => {
      const key = Object.keys(element).find((item) => item.startsWith("__reactProps$"));
      const props = key ? (element as unknown as Record<string, Record<string, (value?: unknown) => void>>)[key] : null;
      const callback = props?.[name];
      if (!callback) throw new Error(`Missing ${name}`);
      return callback;
    };

    // One update: the editor commits first, then Apply uses the preview that was still valid.
    act(() => {
      handler(requirement, "onChange")({ target: { value: edited } });
      handler(apply, "onClick")();
    });

    expect(field("FR-001 text").value).toBe(edited);
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();
    expect(screen.queryByText(UI_TEXT.analysis.appliedNote("FR-001"))).toBeNull();
    expect(screen.queryByText(UI_TEXT.analysis.appliedNote("FR-002"))).toBeNull();
    expect(screen.getByRole("alert")).toHaveProperty("textContent", UI_TEXT.analysis.applyRejected);
  });

  it("does not write review answers into the configuration file", async () => {
    fillRequired();
    await receiveAnalysis();
    fireEvent.change(field(UI_TEXT.analysis.answerLabel("F-001")), { target: { value: "  10 MB.\n" } });
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.saveAnswer("F-001") }));
    let blob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((value) => {
      blob = value as Blob;
      return "blob:config";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    fireEvent.click(screen.getByRole("button", { name: "Export configuration" }));

    const exported = await blob?.text();
    expect(exported).toContain("Receipt Tracker");
    expect(exported).not.toContain("  10 MB.\n");
    expect(exported).not.toContain("What is the maximum file size?");
    expect(field(UI_TEXT.analysis.answerLabel("F-001")).value).toBe("  10 MB.\n");
  });

  it("shows acceptance criterion preview details and requires a new preview after the requirements change", async () => {
    const businessRequirements = "Users can upload a receipt.";
    fillRequired(businessRequirements);
    beginStructured("Copy current text");
    await receiveAnalysis(instructedFinding);
    const finding = screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-001") }).closest("li");
    expect(finding).toBeTruthy();
    const review = within(finding as HTMLElement);

    fireEvent.click(review.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-001") }));
    change(UI_TEXT.analysis.changeLabel("F-001"), "create-criterion");
    change(UI_TEXT.analysis.scopeLabel("F-001"), "requirement");
    fireEvent.click(review.getByRole("checkbox", { name: "FR-001" }));
    const exact = "  The file is rejected.\n";
    fireEvent.change(field(UI_TEXT.analysis.proposedText("F-001")), { target: { value: exact } });
    fireEvent.click(review.getByRole("button", { name: UI_TEXT.analysis.previewChange("F-001") }));

    const region = screen.getByRole("region", { name: UI_TEXT.analysis.previewChange("F-001") });
    expect(previewFact(region, UI_TEXT.analysis.previewId)).toBe("AC-001");
    expect(previewFact(region, UI_TEXT.analysis.previewSource)).toBe(UI_TEXT.analysis.sources.user);
    expect(previewFact(region, UI_TEXT.analysis.previewStatus)).toBe(UI_TEXT.requirementStatus.proposed);
    expect(previewFact(region, UI_TEXT.analysis.previewScope)).toBe(UI_TEXT.criterionScope.requirement);
    expect(previewFact(region, UI_TEXT.analysis.previewLinks)).toBe("FR-001");
    expect(previewFact(region, UI_TEXT.analysis.previewProposedText)).toBe(exact);
    expect(screen.queryByLabelText("AC-001 text")).toBeNull();

    change("FR-001 text", "Users can upload a receipt today.");
    expect(screen.queryByRole("region", { name: UI_TEXT.analysis.previewChange("F-001") })).toBeNull();
    expect(screen.getByRole("alert")).toHaveProperty("textContent", UI_TEXT.analysis.previewStale);
    expect(screen.queryByRole("button", { name: UI_TEXT.analysis.applyChange("F-001") })).toBeNull();
    expect(screen.queryByLabelText("AC-001 text")).toBeNull();
    expect(field("FR-001 text").value).toBe("Users can upload a receipt today.");

    change("FR-001 text", businessRequirements);
    expect(screen.queryByText(UI_TEXT.analysis.stale)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.previewChange("F-001") }));
    const again = screen.getByRole("region", { name: UI_TEXT.analysis.previewChange("F-001") });
    expect(previewFact(again, UI_TEXT.analysis.previewId)).toBe("AC-001");
    expect(previewFact(again, UI_TEXT.analysis.previewProposedText)).toBe(exact);
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.applyChange("F-001") }));
    expect(field("AC-001 text").value).toBe(exact);
    expect(field("AC-001 status").value).toBe("proposed");
    expect(field("FR-001 text").value).toBe(businessRequirements);
    expect(screen.queryByLabelText("AC-002 text")).toBeNull();
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();
  });

  it("keeps a free-text writing draft through an explicit structured transition", async () => {
    const businessRequirements = "Users can upload a receipt.\n  Keep this line.";
    fillRequired(businessRequirements);
    const { pending, fetchMock } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.draft }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("region", { name: UI_TEXT.writing.confirmHeading })).getByRole("button", { name: UI_TEXT.writing.send }));
    const suggestion = {
      id: "W-001",
      kind: "new-functional",
      text: "A person has a role.",
      rationale: "The description names a person.",
      uncertainty: null,
      nestedCriteria: [{ text: "Opening a stored receipt shows its image.", rationale: "The receipt is stored.", uncertainty: null }],
    };
    pending[0].resolve(analysisResponse(writingBody(pending[0].body, [suggestion])));

    expect(await screen.findByText(UI_TEXT.writing.copyTransition)).toBeTruthy();
    expect(screen.getByText(UI_TEXT.writing.emptyTransition)).toBeTruthy();
    expect(field("Business requirements").value).toBe(businessRequirements);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).clarifications).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.useStructuredRequirements }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.copyCurrentText }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(field("Business requirements").value).toBe(businessRequirements);
    expect(field("FR-001 text").value).toBe(businessRequirements);
    expect(field("FR-001 status").value).toBe("confirmed");
    expect(screen.queryByText(UI_TEXT.writing.copyTransition)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.preview("W-001") }));
    const region = screen.getByRole("region", { name: UI_TEXT.writing.preview("W-001") });
    expect(previewFact(region, UI_TEXT.analysis.previewSource)).toBe(UI_TEXT.analysis.sources.ai);
    expect(previewFact(region, UI_TEXT.analysis.previewStatus)).toBe(UI_TEXT.requirementStatus.proposed);
    expect(previewFact(region, UI_TEXT.analysis.previewId)).toBe("FR-002");
    expect(within(region).getByText(UI_TEXT.writing.nestedRemain("FR-002"))).toBeTruthy();
    expect(within(region).getByText("Opening a stored receipt shows its image.")).toBeTruthy();
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();
    fireEvent.click(within(region).getByRole("button", { name: UI_TEXT.analysis.applyChange("W-001") }));

    expect(field("FR-002 text").value).toBe("A person has a role.");
    expect(field("FR-002 status").value).toBe("proposed");
    expect(screen.queryByLabelText("AC-001 text")).toBeNull();
    expect(field(UI_TEXT.writing.textLabel("W-002")).value).toBe("Opening a stored receipt shows its image.");
    expect(screen.getByText(UI_TEXT.writing.detachedCriteria("FR-002", ["W-002"]))).toBeTruthy();
    expect(screen.getByRole("region", { name: UI_TEXT.writing.criteriaFor("FR-002") })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.preview("W-002") }));
    const criterionPreview = screen.getByRole("region", { name: UI_TEXT.writing.preview("W-002") });
    expect(previewFact(criterionPreview, UI_TEXT.analysis.previewScope)).toBe(UI_TEXT.criterionScope.requirement);
    expect(previewFact(criterionPreview, UI_TEXT.analysis.previewLinks)).toBe("FR-002");
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.applyChange("W-002") }));
    expect(field("AC-001 text").value).toBe("Opening a stored receipt shows its image.");
    expect(field("AC-001 status").value).toBe("proposed");
    expect((screen.getByRole("checkbox", { name: "AC-001 applies to FR-002" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "AC-001 applies to FR-001" }) as HTMLInputElement).checked).toBe(false);
    assemble();
    expect(preview()).not.toContain("A person has a role.");
    expect(preview()).toContain(businessRequirements);
  });

  it("groups detached nested criteria under the new functional requirement and keeps their links", async () => {
    const businessRequirements = "Users can upload a receipt.";
    fillRequired(businessRequirements);
    const { pending } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.draft }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.send }));
    const listCriterion = "The list shows the person.";
    const detailCriterion = "The detail shows the role.";
    pending[0].resolve(
      analysisResponse(
        writingBody(pending[0].body, [
          {
            id: "W-001",
            kind: "new-functional",
            text: "A person has a role.",
            rationale: "The description names a person.",
            uncertainty: null,
            nestedCriteria: [
              { text: listCriterion, rationale: "The list is visible." },
              { text: detailCriterion, rationale: "The detail is visible." },
            ],
          },
          {
            id: "W-002",
            kind: "new-criterion",
            text: "The project builds.",
            rationale: "The build is a project outcome.",
            uncertainty: null,
            scope: "project",
            requirementIds: [],
          },
          {
            id: "W-003",
            kind: "new-criterion",
            text: "The tests pass.",
            rationale: "The tests are a project outcome.",
            uncertainty: null,
            scope: "project",
            requirementIds: [],
          },
        ]),
      ),
    );

    expect(await screen.findByText(UI_TEXT.writing.copyTransition)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.useStructuredRequirements }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.copyCurrentText }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.preview("W-001") }));
    const parentPreview = screen.getByRole("region", { name: UI_TEXT.writing.preview("W-001") });
    expect(within(parentPreview).getByText(UI_TEXT.writing.nestedRemain("FR-002"))).toBeTruthy();
    expect(within(parentPreview).getByText(listCriterion)).toBeTruthy();
    expect(within(parentPreview).getByText(detailCriterion)).toBeTruthy();
    expect(within(parentPreview).getByRole("button", { name: UI_TEXT.analysis.applyChange("W-001") })).toBeTruthy();
    expect(screen.queryByLabelText("AC-001 text")).toBeNull();

    fireEvent.click(within(parentPreview).getByRole("button", { name: UI_TEXT.analysis.applyChange("W-001") }));
    expect(field("FR-002 text").value).toBe("A person has a role.");
    expect(field("FR-002 status").value).toBe("proposed");
    expect(screen.queryByLabelText("AC-001 text")).toBeNull();
    expect(screen.getByText(UI_TEXT.writing.detachedCriteria("FR-002", ["W-004", "W-005"]))).toBeTruthy();

    const criteria = screen.getByRole("region", { name: UI_TEXT.writing.criteria });
    const grouped = within(criteria).getByRole("region", { name: UI_TEXT.writing.criteriaFor("FR-002") });
    expect((within(grouped).getByLabelText(UI_TEXT.writing.textLabel("W-004")) as HTMLTextAreaElement).value).toBe(listCriterion);
    expect((within(grouped).getByLabelText(UI_TEXT.writing.textLabel("W-005")) as HTMLTextAreaElement).value).toBe(detailCriterion);
    expect(within(grouped).queryByLabelText(UI_TEXT.writing.textLabel("W-002"))).toBeNull();
    const projectSuggestion = within(criteria).getByLabelText(UI_TEXT.writing.textLabel("W-002"));
    expect(grouped.compareDocumentPosition(projectSuggestion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(grouped).getByRole("button", { name: UI_TEXT.writing.dismiss("W-005") })).toBeTruthy();

    fireEvent.click(within(grouped).getByRole("button", { name: UI_TEXT.writing.preview("W-004") }));
    const criterionPreview = screen.getByRole("region", { name: UI_TEXT.writing.preview("W-004") });
    expect(previewFact(criterionPreview, UI_TEXT.analysis.previewId)).toBe("AC-001");
    expect(previewFact(criterionPreview, UI_TEXT.analysis.previewSource)).toBe(UI_TEXT.analysis.sources.ai);
    expect(previewFact(criterionPreview, UI_TEXT.analysis.previewStatus)).toBe(UI_TEXT.requirementStatus.proposed);
    expect(previewFact(criterionPreview, UI_TEXT.analysis.previewScope)).toBe(UI_TEXT.criterionScope.requirement);
    expect(previewFact(criterionPreview, UI_TEXT.analysis.previewLinks)).toBe("FR-002");
    fireEvent.click(within(criterionPreview).getByRole("button", { name: UI_TEXT.analysis.applyChange("W-004") }));
    expect(field("AC-001 text").value).toBe(listCriterion);
    expect(field("AC-001 status").value).toBe("proposed");
    expect((screen.getByRole("checkbox", { name: "AC-001 applies to FR-002" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "AC-001 applies to FR-001" }) as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.dismiss("W-005") }));
    expect(screen.queryByLabelText(UI_TEXT.writing.textLabel("W-005"))).toBeNull();
    expect(screen.queryByLabelText("AC-002 text")).toBeNull();
    expect(within(criteria).getByRole("button", { name: UI_TEXT.writing.preview("W-002") })).toBeTruthy();
    expect(within(criteria).getByRole("button", { name: UI_TEXT.writing.dismiss("W-002") })).toBeTruthy();
  });

  it("does not transfer a writing draft after the free-text source changes", async () => {
    fillRequired("Users can upload a receipt.");
    const { pending } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.draft }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.send }));
    pending[0].resolve(
      analysisResponse(
        writingBody(pending[0].body, [
          {
            id: "W-001",
            kind: "new-functional",
            text: "A person has a role.",
            rationale: "Named in the description.",
            uncertainty: null,
            nestedCriteria: [],
          },
        ]),
      ),
    );
    expect(await screen.findByText(UI_TEXT.writing.copyTransition)).toBeTruthy();
    change("Business requirements", "Users can upload a receipt today.");
    expect(screen.getByText(UI_TEXT.writing.stale)).toBeTruthy();
    expect((screen.getByRole("button", { name: UI_TEXT.writing.preview("W-001") }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.useStructuredRequirements }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.copyCurrentText }));
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();
  });

  it("refuses a writing suggestion that repeats the copied requirement", async () => {
    const businessRequirements = "Users can upload a receipt.";
    fillRequired(businessRequirements);
    const { pending } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.draft }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.send }));
    pending[0].resolve(
      analysisResponse(
        writingBody(pending[0].body, [
          {
            id: "W-001",
            kind: "new-functional",
            text: businessRequirements,
            rationale: "Restates the requirement.",
            uncertainty: null,
            nestedCriteria: [],
          },
        ]),
      ),
    );
    expect(await screen.findByRole("button", { name: UI_TEXT.writing.preview("W-001") })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.useStructuredRequirements }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.copyCurrentText }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.preview("W-001") }));
    expect(screen.getByText(UI_TEXT.writing.duplicate)).toBeTruthy();
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();
  });

  it("keeps a clarification answer for review until it is explicitly checked again", async () => {
    fillRequired();
    await receiveAnalysis();
    fireEvent.change(field(UI_TEXT.analysis.answerLabel("F-001")), { target: { value: "  10 MB.\n" } });
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.saveAnswer("F-001") }));
    change("Project name", "Receipt Tracker Updated");
    expect(field(UI_TEXT.analysis.answerLabel("F-001")).value).toBe("  10 MB.\n");
    expect(screen.getByText(UI_TEXT.analysis.answerKept)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.useAnswer }));
    expect(screen.queryByText(UI_TEXT.analysis.answerKept)).toBeNull();
    change("Project name", "Receipt Tracker Again");
    expect(field(UI_TEXT.analysis.answerLabel("F-001")).value).toBe("  10 MB.\n");
    expect(screen.getByText(UI_TEXT.analysis.answerKept)).toBeTruthy();
  });

  it("reports a rejected writing change when the requirements change after a valid preview", async () => {
    fillRequired("Users can upload a receipt.");
    const { pending } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.draft }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.send }));
    pending[0].resolve(
      analysisResponse(
        writingBody(pending[0].body, [
          {
            id: "W-001",
            kind: "new-functional",
            text: "A person has a role.",
            rationale: "Named in the description.",
            uncertainty: null,
            nestedCriteria: [],
          },
        ]),
      ),
    );
    expect(await screen.findByRole("button", { name: UI_TEXT.writing.preview("W-001") })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.useStructuredRequirements }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.copyCurrentText }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.preview("W-001") }));
    const requirement = field("FR-001 text");
    const apply = screen.getByRole("button", { name: UI_TEXT.analysis.applyChange("W-001") });
    const handler = (element: HTMLElement, name: string) => {
      const key = Object.keys(element).find((item) => item.startsWith("__reactProps$"));
      const props = key ? (element as unknown as Record<string, Record<string, (value?: unknown) => void>>)[key] : null;
      const callback = props?.[name];
      if (!callback) throw new Error(`Missing ${name}`);
      return callback;
    };
    act(() => {
      handler(requirement, "onChange")({ target: { value: "Users can upload a receipt today." } });
      handler(apply, "onClick")();
    });
    expect(field("FR-001 text").value).toBe("Users can upload a receipt today.");
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();
    expect(screen.getByRole("alert")).toHaveProperty("textContent", UI_TEXT.analysis.applyRejected);
  });

  it("requires a second confirmation before a writing revision replaces confirmed text", async () => {
    const businessRequirements = "Users can upload a receipt.";
    fillRequired(businessRequirements);
    beginStructured("Copy current text");
    const { pending } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.draft }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.send }));
    pending[0].resolve(
      analysisResponse(
        writingBody(pending[0].body, [
          {
            id: "W-001",
            kind: "revise-functional",
            targetId: "FR-001",
            text: "Users can upload a receipt and see it later.",
            rationale: "The later view is missing.",
            uncertainty: null,
          },
        ]),
      ),
    );
    expect(await screen.findByRole("button", { name: UI_TEXT.writing.preview("W-001") })).toBeTruthy();
    expect(field("FR-001 text").value).toBe(businessRequirements);
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.preview("W-001") }));
    expect(field("FR-001 text").value).toBe(businessRequirements);
    const region = screen.getByRole("region", { name: UI_TEXT.writing.preview("W-001") });
    expect(previewFact(region, UI_TEXT.analysis.previewSource)).toBe(UI_TEXT.analysis.sources.user);
    expect(previewFact(region, UI_TEXT.analysis.previewStatus)).toBe(UI_TEXT.requirementStatus.confirmed);
    const opener = within(region).getByRole("button", { name: UI_TEXT.analysis.authoritativeHeading("FR-001") });
    fireEvent.click(opener);
    fireEvent.click(
      within(screen.getByRole("region", { name: UI_TEXT.analysis.authoritativeHeading("FR-001") })).getByRole("button", { name: UI_TEXT.buttons.cancel }),
    );
    expect(field("FR-001 text").value).toBe(businessRequirements);
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.authoritativeReplace("FR-001") }));
    expect(field("FR-001 text").value).toBe("Users can upload a receipt and see it later.");
    expect(field("FR-001 status").value).toBe("confirmed");
  });

  it("returns focus when a writing confirmation is cancelled from the keyboard", () => {
    const { fetchMock } = holdAnalysisFetch();
    const draft = screen.getByRole("button", { name: UI_TEXT.writing.draft });
    fireEvent.click(draft);
    fireEvent.keyDown(screen.getByRole("button", { name: UI_TEXT.buttons.cancel }), { key: "Escape" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: UI_TEXT.writing.confirmHeading })).toBeNull();
    expect(document.activeElement).toBe(draft);
  });
});

function reloadBuilder() {
  cleanup();
  render(<RequirementsBuilder templates={templates} />);
}

function flushDraft() {
  act(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
}

describe("same-tab draft recovery", () => {
  it("describes partial and failed saves without treating a complete save as incomplete", () => {
    expect(recoveryStatusText(null)).toBeNull();
    expect(recoveryStatusText({ status: "saved" })).toBeNull();
    expect(recoveryStatusText({ status: "partial", omitted: ["output"] })).toBe(UI_TEXT.draftRecovery.partial);
    expect(recoveryStatusText({ status: "unavailable" })).toBe(UI_TEXT.draftRecovery.unavailable);
  });

  it("restores free-text requirements, technology choices, and structured requirements after refresh", () => {
    const businessRequirements = "  Show the people list.\nKeep the spacing.  ";
    change("Project name", "People Directory");
    change("Business requirements", businessRequirements);
    change("Application type", "web-app");
    fireEvent.click(field("Backend TypeScript"));
    change("Backend TypeScript package manager", "npm");
    fireEvent.click(field("React + Vite"));
    fireEvent.click(screen.getByRole("button", { name: "Use structured requirements" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy current text" }));
    change("FR-001 text", `${businessRequirements} Added.`);

    reloadBuilder();

    expect(field("Project name").value).toBe("People Directory");
    expect(field("Business requirements").value).toBe(businessRequirements);
    expect(field("Application type").value).toBe("web-app");
    expect(field("Backend TypeScript").checked).toBe(true);
    expect(field("Backend TypeScript package manager").value).toBe("npm");
    expect(field("React + Vite").checked).toBe(true);
    expect(field("FR-001 text").value).toBe(`${businessRequirements} Added.`);
    expect(field("FR-001 status").value).toBe("confirmed");
  });

  it("restores edited and stale Markdown without assembling or calling AI", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fillRequired();
    assemble();
    const generated = preview();
    const edited = `${generated}manual note\n`;
    editDocument(edited);
    change("Project name", "Receipt Tracker 2");
    expect(screen.getByText(STALE_NOTICE)).toBeTruthy();
    expect(screen.getByText(EDITED_NOTICE)).toBeTruthy();

    reloadBuilder();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(field("Project name").value).toBe("Receipt Tracker 2");
    expect(preview()).toBe(edited);
    expect(preview()).not.toBe(generated);
    expect(screen.getByRole("button", { name: "Reassemble" })).toBeTruthy();
    expect(screen.getByText(STALE_NOTICE)).toBeTruthy();
    expect(screen.getByText(EDITED_NOTICE)).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("restores a seeded draft under Strict Mode without replacing it with the initial form", () => {
    cleanup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.setItem(DOWNLOAD_COUNT_STORAGE_KEY, "6");
    const config = normalizeSelections({
      ...defaultConfig,
      projectName: "Receipt Tracker",
      businessRequirements: "Users can upload a receipt.",
    });
    const snapshot = normalizeSelections({ ...config, projectName: "Receipt Tracker snapshot" });
    expect(
      saveDraftRecovery(sessionStorage, {
        version: 1,
        config,
        output: { markdown: "Saved note\n", assembled: { config: snapshot, markdown: "Generated draft\n" } },
        analysis: null,
        writing: null,
      }),
    ).toEqual({ status: "saved" });

    render(
      <StrictMode>
        <RequirementsBuilder templates={templates} />
      </StrictMode>,
    );

    expect(field("Project name").value).toBe("Receipt Tracker");
    expect(preview()).toBe("Saved note\n");
    expect(screen.getByText(STALE_NOTICE)).toBeTruthy();
    expect(screen.getByText(EDITED_NOTICE)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Receipt Tracker");
    expect(sessionStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Saved note\\n");
    expect(sessionStorage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("6");
    vi.unstubAllGlobals();
  });

  it("leaves the project unchanged when Start new project is cancelled or dismissed with Escape", async () => {
    fillRequired();
    assemble();
    const edited = `${preview()}manual note\n`;
    editDocument(edited);
    const { pending } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.send }));
    pending[0].resolve(
      analysisResponse({
        ok: true,
        fingerprint: fingerprintOf(pending[0].body),
        result: { findings: [analysisFinding] },
      }),
    );
    expect(await screen.findByText(analysisFinding.explanation)).toBeTruthy();
    sessionStorage.setItem(DOWNLOAD_COUNT_STORAGE_KEY, "4");
    flushDraft();
    const stored = sessionStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY);

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.startNewProject }));
    const confirmation = screen.getByRole("region", { name: UI_TEXT.draftRecovery.startHeading });
    expect(document.activeElement).toBe(within(confirmation).getByRole("button", { name: UI_TEXT.buttons.cancel }));
    fireEvent.click(within(confirmation).getByRole("button", { name: UI_TEXT.buttons.cancel }));

    expect(screen.queryByRole("region", { name: UI_TEXT.draftRecovery.startHeading })).toBeNull();
    expect(field("Project name").value).toBe("Receipt Tracker");
    expect(preview()).toBe(edited);
    expect(screen.getByText(analysisFinding.explanation)).toBeTruthy();
    expect(sessionStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toBe(stored);
    expect(sessionStorage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("4");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: UI_TEXT.buttons.startNewProject }));

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.startNewProject }));
    fireEvent.keyDown(screen.getByRole("button", { name: UI_TEXT.buttons.cancel }), { key: "Escape" });
    expect(screen.queryByRole("region", { name: UI_TEXT.draftRecovery.startHeading })).toBeNull();
    expect(field("Project name").value).toBe("Receipt Tracker");
    expect(preview()).toBe(edited);
    expect(screen.getByText(analysisFinding.explanation)).toBeTruthy();
    expect(sessionStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toBe(stored);
    expect(sessionStorage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("4");
  });

  it("clears the project and child sessions, keeps the download count, and stays empty after refresh", async () => {
    fillRequired();
    const { pending, fetchMock } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.send }));
    pending[0].resolve(
      analysisResponse({
        ok: true,
        fingerprint: fingerprintOf(pending[0].body),
        result: { findings: [analysisFinding] },
      }),
    );
    expect(await screen.findByText(analysisFinding.explanation)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.draft }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    sessionStorage.setItem(DOWNLOAD_COUNT_STORAGE_KEY, "4");

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.startNewProject }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.clearProject }));

    expect(field("Project name").value).toBe("");
    expect(preview()).toBe("");
    expect(screen.queryByText(analysisFinding.explanation)).toBeNull();
    expect(screen.getByRole("button", { name: UI_TEXT.analysis.analyze })).toBeTruthy();
    expect(screen.queryByRole("button", { name: UI_TEXT.analysis.analyzeAgain })).toBeNull();
    expect(sessionStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("4");
    expect(screen.queryByRole("alert")).toBeNull();

    pending[1].resolve(
      analysisResponse(
        writingBody(pending[1].body, [
          {
            id: "W-001",
            kind: "new-functional",
            text: "A person has a role.",
            rationale: "The description names a person.",
            uncertainty: null,
            nestedCriteria: [],
          },
        ]),
      ),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("A person has a role.")).toBeNull();
    expect(screen.queryByText(analysisFinding.explanation)).toBeNull();
    expect(field("Project name").value).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    reloadBuilder();
    expect(field("Project name").value).toBe("");
    expect(preview()).toBe("");
    expect(screen.queryByText(analysisFinding.explanation)).toBeNull();
    expect(sessionStorage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("4");
  });

  it("reports a failed draft deletion and brings the stored project back on refresh", () => {
    change("Project name", "Receipt Tracker");
    flushDraft();
    sessionStorage.setItem(DOWNLOAD_COUNT_STORAGE_KEY, "8");
    const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    const blocking = storageWithDraftFailures(window.sessionStorage, { remove: true, write: true });
    Object.defineProperty(window, "sessionStorage", { configurable: true, get: () => blocking });
    try {
      fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.startNewProject }));
      fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.clearProject }));

      expect(screen.getByRole("alert").textContent).toBe(UI_TEXT.draftRecovery.resetFailed);
      expect(field("Project name").value).toBe("");
      expect(blocking.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("Receipt Tracker");
      expect(blocking.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("8");

      reloadBuilder();
      expect(field("Project name").value).toBe("Receipt Tracker");
      expect(blocking.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("8");
    } finally {
      if (descriptor) Object.defineProperty(window, "sessionStorage", descriptor);
    }
  });

  it("shows one notice when saving the draft fails and stays quiet after a complete save", () => {
    change("Project name", "First edit");
    flushDraft();
    expect(screen.queryByText(UI_TEXT.draftRecovery.unavailable)).toBeNull();
    expect(screen.queryByText(UI_TEXT.draftRecovery.partial)).toBeNull();
    expect(sessionStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("First edit");

    const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    const blocking = storageWithDraftFailures(window.sessionStorage, { remove: false, write: true });
    Object.defineProperty(window, "sessionStorage", { configurable: true, get: () => blocking });
    try {
      change("Project name", "Second edit");
      flushDraft();
      change("Project name", "Third edit");
      flushDraft();

      expect(screen.getAllByText(UI_TEXT.draftRecovery.unavailable)).toHaveLength(1);
      expect(blocking.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain("First edit");
      expect(blocking.getItem(DRAFT_RECOVERY_STORAGE_KEY)).not.toContain("Second edit");
    } finally {
      if (descriptor) Object.defineProperty(window, "sessionStorage", descriptor);
    }
  });
});

describe("analysis review recovery", () => {
  const answer = "  10 MB.\n";
  const secondFinding = {
    ...analysisFinding,
    id: "F-002",
    explanation: "The retention period is not stated.",
    question: "How long is a receipt kept?",
    suggestedAction: null,
  };

  function seedAnalysis(options?: {
    requestId?: number;
    fingerprint?: string;
    privacy?: boolean;
    records?: Record<string, unknown>;
    findings?: unknown[];
    markdown?: string;
    requirementsContent?: ReturnType<typeof defaultRequirementsContent>;
  }) {
    const config = normalizeSelections({
      ...defaultConfig,
      projectName: "Receipt Tracker",
      businessRequirements: "Users can upload a receipt.",
      ...(options?.requirementsContent ? { requirementsContent: options.requirementsContent } : {}),
    });
    const currentFingerprint = analysisFingerprint(buildAnalysisInput(config));
    const requestId = options?.requestId ?? 4;
    const fingerprint = options?.fingerprint ?? currentFingerprint;
    const result = readAnalysisResult({ findings: options?.findings ?? [analysisFinding] });
    const session = parseReviewSession({ requestId, fingerprint, records: options?.records ?? {} });
    if (!result || !session) throw new Error("Could not seed an analysis session.");
    expect(
      saveDraftRecovery(sessionStorage, {
        version: 1,
        config,
        output: { markdown: options?.markdown ?? "Saved note\n", assembled: null },
        analysis: {
          requestId,
          fingerprint,
          result,
          session,
          privacyAcknowledged: options?.privacy ?? true,
        },
        writing: null,
      }),
    ).toEqual({ status: "saved" });
    return { fingerprint, requestId };
  }

  it("restores findings, exact answers, decisions, privacy, and checked fingerprints", async () => {
    fillRequired();
    const { pending, fetchMock } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.send }));
    pending[0].resolve(
      analysisResponse({
        ok: true,
        fingerprint: fingerprintOf(pending[0].body),
        result: { findings: [analysisFinding, secondFinding] },
      }),
    );
    expect(await screen.findByText(analysisFinding.explanation)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.defer("F-002") }));
    fireEvent.change(field(UI_TEXT.analysis.answerLabel("F-001")), { target: { value: answer } });
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.saveAnswer("F-001") }));
    flushDraft();
    const storedFingerprint = JSON.parse(sessionStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY) ?? "{}").analysis?.fingerprint as string;

    vi.stubGlobal("fetch", vi.fn());
    reloadBuilder();

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(screen.getByText(analysisFinding.explanation)).toBeTruthy();
    expect(screen.getByText(secondFinding.explanation)).toBeTruthy();
    expect(field(UI_TEXT.analysis.answerLabel("F-001")).value).toBe(answer);
    expect(screen.getByText(UI_TEXT.analysis.decisionLabel("F-002", UI_TEXT.analysis.decisions.deferred))).toBeTruthy();
    expect(screen.queryByRole("button", { name: UI_TEXT.analysis.useAnswer })).toBeNull();
    expect(screen.getByRole("button", { name: UI_TEXT.analysis.analyzeAgain })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    change("Project name", "Changed after restore");
    expect(field("Project name").value).toBe("Changed after restore");
    expect(screen.getByText(UI_TEXT.analysis.stale)).toBeTruthy();
    expect(field(UI_TEXT.analysis.answerLabel("F-001")).value).toBe(answer);
    expect(screen.getByRole("button", { name: UI_TEXT.analysis.useAnswer })).toBeTruthy();
    expect((screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-001") }) as HTMLButtonElement).disabled).toBe(true);
    flushDraft();
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY) ?? "{}") as {
      config: { projectName: string };
      analysis: { fingerprint: string; session: { records: Record<string, { answer?: string; answerCheckedFingerprint?: string }> } };
    };
    expect(saved.config.projectName).toBe("Changed after restore");
    expect(saved.analysis.fingerprint).toBe(storedFingerprint);
    const record = Object.values(saved.analysis.session.records).find((item) => item.answer !== undefined);
    expect(record?.answer).toBe(answer);
    expect(record?.answerCheckedFingerprint).toBe(storedFingerprint);
    expect(saved.analysis.fingerprint).not.toBe(analysisFingerprint(buildAnalysisInput(saved.config as ProjectConfig)));
    vi.unstubAllGlobals();
  });

  it("keeps an applied finding from being applied again and leaves another finding unresolved", async () => {
    const businessRequirements = "Users can upload a receipt.";
    fillRequired(businessRequirements);
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.useStructuredRequirements }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.startEmptyStructured }));
    const { pending } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.send }));
    pending[0].resolve(
      analysisResponse({
        ok: true,
        fingerprint: fingerprintOf(pending[0].body),
        result: { findings: [analysisFinding, secondFinding] },
      }),
    );
    expect(await screen.findByText(secondFinding.explanation)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-001") }));
    fireEvent.change(field(UI_TEXT.analysis.proposedText("F-001")), { target: { value: "Users can upload a receipt up to 10 MB." } });
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.previewChange("F-001") }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.applyChange("F-001") }));
    expect(screen.getByText(UI_TEXT.analysis.appliedNote("FR-001"))).toBeTruthy();

    vi.stubGlobal("fetch", vi.fn());
    reloadBuilder();

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(field("FR-001 text").value).toBe("Users can upload a receipt up to 10 MB.");
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();
    expect(screen.getByText(UI_TEXT.analysis.appliedNote("FR-001"))).toBeTruthy();
    expect(screen.getByText(UI_TEXT.analysis.stale)).toBeTruthy();
    expect(screen.getByText(UI_TEXT.analysis.decisionLabel("F-002", UI_TEXT.analysis.decisions.open))).toBeTruthy();
    expect((screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-001") }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-002") }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-001") }));
    expect(screen.queryByLabelText(UI_TEXT.analysis.proposedText("F-001"))).toBeNull();
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("keeps an applied finding blocked when the restored analysis still matches the requirements", () => {
    cleanup();
    const requirementsContent = addFunctionalRequirement(
      beginStructuredRequirements(defaultRequirementsContent(), "empty", "", ""),
      "Users can upload a receipt up to 10 MB.",
      { status: "proposed" },
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    seedAnalysis({
      requirementsContent,
      findings: [analysisFinding, secondFinding],
      records: {
        "4:F-001": { decision: "addressed", applied: { kind: "functional", id: "FR-001" } },
        "4:F-002": { decision: "deferred" },
      },
    });
    render(<RequirementsBuilder templates={templates} />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(UI_TEXT.analysis.stale)).toBeNull();
    expect(field("FR-001 text").value).toBe("Users can upload a receipt up to 10 MB.");
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();
    expect(screen.getByText(UI_TEXT.analysis.appliedNote("FR-001"))).toBeTruthy();
    expect(screen.getByText(UI_TEXT.analysis.decisionLabel("F-001", UI_TEXT.analysis.decisions.addressed))).toBeTruthy();
    expect(screen.getByText(UI_TEXT.analysis.decisionLabel("F-002", UI_TEXT.analysis.decisions.deferred))).toBeTruthy();
    expect((screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-001") }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-002") }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-001") }));
    expect(screen.queryByLabelText(UI_TEXT.analysis.proposedText("F-001"))).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-002") }));
    expect(screen.getByLabelText(UI_TEXT.analysis.proposedText("F-002"))).toBeTruthy();
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("does not request analysis while restoring a stale session, and blocks applying it", () => {
    cleanup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    seedAnalysis({ fingerprint: "stale-fingerprint" });
    render(<RequirementsBuilder templates={templates} />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(analysisFinding.explanation)).toBeTruthy();
    expect(preview()).toBe("Saved note\n");
    expect(screen.getByText(UI_TEXT.analysis.stale)).toBeTruthy();
    expect(screen.getByText(UI_TEXT.analysis.staleBlocked)).toBeTruthy();
    expect((screen.getByRole("button", { name: UI_TEXT.analysis.proposeChange("F-001") }) as HTMLButtonElement).disabled).toBe(true);
    vi.unstubAllGlobals();
  });

  it("drops a corrupt analysis slice and keeps the configuration and Markdown", () => {
    cleanup();
    seedAnalysis();
    const stored = JSON.parse(sessionStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY) ?? "{}") as { analysis: unknown };
    stored.analysis = { requestId: 4, fingerprint: "bad", result: { findings: "nope" }, session: {}, privacyAcknowledged: true };
    sessionStorage.setItem(DRAFT_RECOVERY_STORAGE_KEY, JSON.stringify(stored));
    render(<RequirementsBuilder templates={templates} />);

    expect(field("Project name").value).toBe("Receipt Tracker");
    expect(preview()).toBe("Saved note\n");
    expect(screen.queryByText(analysisFinding.explanation)).toBeNull();
    expect(screen.getByRole("button", { name: UI_TEXT.analysis.analyze })).toBeTruthy();
  });

  it("gives the next analysis a later request id and does not call AI during Strict Mode restore", async () => {
    cleanup();
    const seeded = seedAnalysis({
      requestId: 4,
      records: { "4:F-001": { decision: "deferred" } },
    });
    const realStorage = window.sessionStorage;
    let writes = 0;
    const counting = new Proxy(realStorage, {
      get(target, prop, receiver) {
        if (prop === "setItem") {
          return (key: string, value: string) => {
            if (key === DRAFT_RECOVERY_STORAGE_KEY) writes += 1;
            return target.setItem(key, value);
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", { configurable: true, get: () => counting });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(
        <StrictMode>
          <RequirementsBuilder templates={templates} />
        </StrictMode>,
      );
      expect(screen.getByText(analysisFinding.explanation)).toBeTruthy();
      expect(screen.getByText(UI_TEXT.analysis.decisionLabel("F-001", UI_TEXT.analysis.decisions.deferred))).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(writes).toBeLessThanOrEqual(4);
      expect(counting.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain(analysisFinding.explanation);

      const held = holdAnalysisFetch();
      fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyzeAgain }));
      expect(screen.queryByRole("region", { name: UI_TEXT.analysis.confirmHeading })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.rerunContinue }));
      held.pending[0].resolve(
        analysisResponse({
          ok: true,
          fingerprint: fingerprintOf(held.pending[0].body),
          result: { findings: [{ ...analysisFinding, explanation: "The second analysis names a deadline." }] },
        }),
      );
      expect(await screen.findByText("The second analysis names a deadline.")).toBeTruthy();
      await act(async () => {});
      flushDraft();
      const saved = JSON.parse(counting.getItem(DRAFT_RECOVERY_STORAGE_KEY) ?? "{}") as { analysis: { requestId: number } };
      expect(saved.analysis.requestId).toBe(seeded.requestId + 1);
    } finally {
      if (descriptor) Object.defineProperty(window, "sessionStorage", descriptor);
      vi.unstubAllGlobals();
    }
  });

  it("keeps privacy acknowledgment without sending a request on restore", () => {
    cleanup();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? init.body : "";
      return Promise.resolve(
        analysisResponse({
          ok: true,
          fingerprint: fingerprintOf(body),
          result: { findings: [{ ...analysisFinding, explanation: "A later analysis." }] },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    seedAnalysis({ privacy: true, records: {} });
    render(<RequirementsBuilder templates={templates} />);

    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyzeAgain }));
    expect(screen.queryByRole("region", { name: UI_TEXT.analysis.confirmHeading })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("ignores a late analysis response after Start new project and preserves the download count", async () => {
    sessionStorage.setItem(DOWNLOAD_COUNT_STORAGE_KEY, "4");
    fillRequired();
    const { pending, fetchMock } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyze }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.send }));
    pending[0].resolve(
      analysisResponse({
        ok: true,
        fingerprint: fingerprintOf(pending[0].body),
        result: { findings: [analysisFinding] },
      }),
    );
    expect(await screen.findByText(analysisFinding.explanation)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.defer("F-001") }));

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.startNewProject }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.cancel }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.startNewProject }));
    fireEvent.keyDown(screen.getByRole("button", { name: UI_TEXT.buttons.cancel }), { key: "Escape" });
    expect(screen.getByText(analysisFinding.explanation)).toBeTruthy();
    expect(screen.getByText(UI_TEXT.analysis.decisionLabel("F-001", UI_TEXT.analysis.decisions.deferred))).toBeTruthy();
    expect(field("Project name").value).toBe("Receipt Tracker");

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.analyzeAgain }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.analysis.rerunContinue }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.startNewProject }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.clearProject }));
    pending[1].resolve(
      analysisResponse({
        ok: true,
        fingerprint: fingerprintOf(pending[1].body),
        result: { findings: [{ ...analysisFinding, explanation: "This late analysis must not return." }] },
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText(analysisFinding.explanation)).toBeNull();
    expect(screen.queryByText("This late analysis must not return.")).toBeNull();
    expect(field("Project name").value).toBe("");
    expect(sessionStorage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("4");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not put a cleared analysis back before the parent stores the clear", () => {
    cleanup();
    const result = readAnalysisResult({ findings: [analysisFinding] });
    const review = parseReviewSession({
      requestId: 4,
      fingerprint: "run-fingerprint",
      records: { "4:F-001": { decision: "deferred" } },
    });
    if (!result || !review) throw new Error("Could not build an analysis session.");
    const recovered = {
      requestId: 4,
      fingerprint: "run-fingerprint",
      result,
      session: review,
      privacyAcknowledged: true,
    };
    const published: Array<typeof recovered | null> = [];
    function panel(generation: number, analysis: typeof recovered | null) {
      return (
        <RequirementsAnalysis
          config={defaultConfig}
          resetGeneration={generation}
          recoveredAnalysis={analysis}
          onAnalysisChange={(next) => {
            published.push(next);
          }}
          recoveredWriting={null}
          onWritingChange={() => undefined}
          onApplyPrepared={() => undefined}
        />
      );
    }

    const view = render(<StrictMode>{panel(1, recovered)}</StrictMode>);
    expect(screen.getByText(analysisFinding.explanation)).toBeTruthy();
    view.rerender(<StrictMode>{panel(2, recovered)}</StrictMode>);
    expect(screen.queryByText(analysisFinding.explanation)).toBeNull();
    expect(published.at(-1)).toBeNull();
    view.rerender(<StrictMode>{panel(2, null)}</StrictMode>);
    expect(screen.queryByText(analysisFinding.explanation)).toBeNull();
  });
});

describe("writing session recovery", () => {
  const suggestionText = "  A person has a role.\n";
  const nestedText = "  Show the image.\n";

  function baseConfig(requirementsContent?: ReturnType<typeof defaultRequirementsContent>) {
    return normalizeSelections({
      ...defaultConfig,
      projectName: "Receipt Tracker",
      businessRequirements: "Users can upload a receipt.",
      ...(requirementsContent ? { requirementsContent } : {}),
    });
  }

  function seedWriting(sessionInput: Record<string, unknown>, options?: { requirementsContent?: ReturnType<typeof defaultRequirementsContent>; markdown?: string; analysis?: boolean }) {
    const config = baseConfig(options?.requirementsContent);
    const session = parseStoredWritingSession(sessionInput);
    if (!session) throw new Error("Could not seed a writing session.");
    const analysisResult = options?.analysis ? readAnalysisResult({ findings: [analysisFinding] }) : null;
    const analysisSession = options?.analysis ? parseReviewSession({ requestId: 4, fingerprint: "run-fingerprint", records: {} }) : null;
    if (options?.analysis && (!analysisResult || !analysisSession)) throw new Error("Could not seed analysis beside writing.");
    const analysis = analysisResult && analysisSession
      ? { requestId: 4, fingerprint: "run-fingerprint", result: analysisResult, session: analysisSession, privacyAcknowledged: true }
      : null;
    expect(
      saveDraftRecovery(sessionStorage, {
        version: 1,
        config,
        output: { markdown: options?.markdown ?? "Saved note\n", assembled: null },
        analysis,
        writing: session,
      }),
    ).toEqual({ status: "saved" });
    return session;
  }

  function pendingSuggestion(text = suggestionText, nested = nestedText) {
    return {
      id: "W-001",
      kind: "new-functional",
      text,
      rationale: "The description names a person.",
      uncertainty: null,
      nestedCriteria: [{ text: nested, rationale: "The receipt is stored." }],
    };
  }

  it("restores edited suggestion text and nested text without sending or applying", async () => {
    fillRequired();
    const { pending, fetchMock } = holdAnalysisFetch();
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.draft }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.send }));
    pending[0].resolve(
      analysisResponse(
        writingBody(pending[0].body, [
          {
            id: "W-001",
            kind: "new-functional",
            text: "A person has a role.",
            rationale: "The description names a person.",
            uncertainty: null,
            nestedCriteria: [{ text: "Opening a stored receipt shows its image.", rationale: "The receipt is stored." }],
          },
        ]),
      ),
    );
    expect(await screen.findByLabelText(UI_TEXT.writing.textLabel("W-001"))).toBeTruthy();
    fireEvent.change(field(UI_TEXT.writing.textLabel("W-001")), { target: { value: suggestionText } });
    fireEvent.change(field(UI_TEXT.writing.nestedTextLabel("W-001", 0)), { target: { value: nestedText } });
    flushDraft();

    vi.stubGlobal("fetch", vi.fn());
    reloadBuilder();

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(field(UI_TEXT.writing.textLabel("W-001")).value).toBe(suggestionText);
    expect(field(UI_TEXT.writing.nestedTextLabel("W-001", 0)).value).toBe(nestedText);
    expect(screen.queryByRole("button", { name: UI_TEXT.analysis.applyChange("W-001") })).toBeNull();
    expect(screen.queryByLabelText("FR-001 text")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    change("Project name", "Changed after restore");
    expect(screen.getByText(UI_TEXT.writing.stale)).toBeTruthy();
    expect((screen.getByRole("button", { name: UI_TEXT.writing.preview("W-001") }) as HTMLButtonElement).disabled).toBe(true);
    flushDraft();
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY) ?? "{}") as {
      writing: { sourceFingerprint: string; suggestions: Array<{ text: string; nestedCriteria: Array<{ text: string }> }> };
    };
    expect(saved.writing.suggestions[0].text).toBe(suggestionText);
    expect(saved.writing.suggestions[0].nestedCriteria[0].text).toBe(nestedText);
    const changed = normalizeSelections({ ...baseConfig(), projectName: "Changed after restore" });
    expect(saved.writing.sourceFingerprint).toBe(currentSourceFingerprint(baseConfig(), "free-text", []));
    expect(saved.writing.sourceFingerprint).not.toBe(currentSourceFingerprint(changed, "free-text", []));
    vi.unstubAllGlobals();
  });

  it("keeps an accepted parent hidden and a detached criterion unaccepted", () => {
    cleanup();
    const requirementsContent = addFunctionalRequirement(
      beginStructuredRequirements(defaultRequirementsContent(), "empty", "", ""),
      "A person has a role.",
      { status: "proposed" },
    );
    const config = baseConfig(requirementsContent);
    const sourceFingerprint = currentSourceFingerprint(config, "structured", []);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    seedWriting(
      {
        requestId: 3,
        origin: "structured",
        sourceFingerprint,
        writingFingerprint: "writing-fingerprint",
        suggestions: [
          { ...pendingSuggestion("A person has a role.", nestedText), detachedIds: ["W-002"] },
          {
            id: "W-002",
            kind: "new-criterion",
            text: nestedText,
            rationale: "The receipt is stored.",
            uncertainty: null,
            scope: "requirement",
            requirementIds: ["FR-001"],
          },
          {
            id: "W-003",
            kind: "new-criterion",
            text: "A dismissed criterion.",
            rationale: "Not needed.",
            uncertainty: null,
            scope: "project",
            requirementIds: [],
          },
        ],
        dismissedIds: ["W-003"],
        acceptedIds: ["W-001"],
        nextSuggestionNumber: 4,
        includedClarifications: [],
      },
      { requirementsContent },
    );
    render(<RequirementsBuilder templates={templates} />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(field("FR-001 text").value).toBe("A person has a role.");
    expect(field("FR-001 status").value).toBe("proposed");
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();
    expect(screen.queryByLabelText("AC-001 text")).toBeNull();
    expect(screen.queryByLabelText(UI_TEXT.writing.textLabel("W-001"))).toBeNull();
    expect(screen.queryByLabelText(UI_TEXT.writing.textLabel("W-003"))).toBeNull();
    expect(field(UI_TEXT.writing.textLabel("W-002")).value).toBe(nestedText);
    expect(screen.getByRole("region", { name: UI_TEXT.writing.criteriaFor("FR-001") })).toBeTruthy();
    expect(screen.queryByRole("button", { name: UI_TEXT.analysis.applyChange("W-002") })).toBeNull();
    expect((screen.getByRole("button", { name: UI_TEXT.writing.preview("W-002") }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.preview("W-002") }));
    expect(screen.getByRole("button", { name: UI_TEXT.analysis.applyChange("W-002") })).toBeTruthy();
    expect(screen.queryByLabelText("AC-001 text")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("blocks a stale or duplicate restored suggestion and drops a corrupt writing slice", () => {
    cleanup();
    const requirementsContent = addFunctionalRequirement(
      beginStructuredRequirements(defaultRequirementsContent(), "empty", "", ""),
      "Show the receipt total.",
      { status: "confirmed" },
    );
    seedWriting(
      {
        requestId: 3,
        origin: "structured",
        sourceFingerprint: "stale-source",
        writingFingerprint: "writing-fingerprint",
        suggestions: [pendingSuggestion("Show the receipt total.", "The total is visible.")],
        dismissedIds: [],
        acceptedIds: [],
        nextSuggestionNumber: 2,
        includedClarifications: [
          { requestId: 4, findingId: "F-001", question: "What is the maximum file size?", answer: "  Name and role.\n" },
        ],
      },
      { requirementsContent, analysis: true, markdown: "Saved note\n" },
    );
    render(<RequirementsBuilder templates={templates} />);

    expect(screen.getByText(analysisFinding.explanation)).toBeTruthy();
    expect(preview()).toBe("Saved note\n");
    expect(field("FR-001 text").value).toBe("Show the receipt total.");
    expect(field(UI_TEXT.writing.textLabel("W-001")).value).toBe("Show the receipt total.");
    expect(screen.getByText(UI_TEXT.writing.stale)).toBeTruthy();
    expect(screen.getByText(UI_TEXT.writing.duplicate)).toBeTruthy();
    expect((screen.getByRole("button", { name: UI_TEXT.writing.preview("W-001") }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText("FR-002 text")).toBeNull();
    flushDraft();
    const kept = JSON.parse(sessionStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY) ?? "{}") as {
      writing: { sourceFingerprint: string; includedClarifications: Array<{ answer: string }> };
    };
    expect(kept.writing.sourceFingerprint).toBe("stale-source");
    expect(kept.writing.includedClarifications[0].answer).toBe("  Name and role.\n");

    cleanup();
    seedWriting(
      {
        requestId: 3,
        origin: "free-text",
        sourceFingerprint: "stale-source",
        writingFingerprint: "writing-fingerprint",
        suggestions: [pendingSuggestion()],
        dismissedIds: [],
        acceptedIds: [],
        nextSuggestionNumber: 2,
        includedClarifications: [],
      },
      { analysis: true },
    );
    const stored = JSON.parse(sessionStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY) ?? "{}") as { writing: unknown };
    stored.writing = { accepted: true };
    sessionStorage.setItem(DRAFT_RECOVERY_STORAGE_KEY, JSON.stringify(stored));
    render(<RequirementsBuilder templates={templates} />);

    expect(field("Project name").value).toBe("Receipt Tracker");
    expect(preview()).toBe("Saved note\n");
    expect(screen.getByText(analysisFinding.explanation)).toBeTruthy();
    expect(screen.queryByLabelText(UI_TEXT.writing.textLabel("W-001"))).toBeNull();
  });

  it("reserves the restored request id and ignores a late writing response after Start new project", async () => {
    cleanup();
    sessionStorage.setItem(DOWNLOAD_COUNT_STORAGE_KEY, "4");
    const config = baseConfig();
    seedWriting(
      {
        requestId: 3,
        origin: "free-text",
        sourceFingerprint: currentSourceFingerprint(config, "free-text", []),
        writingFingerprint: "writing-fingerprint",
        suggestions: [pendingSuggestion("A person has a role.", "Opening a stored receipt shows its image.")],
        dismissedIds: [],
        acceptedIds: [],
        nextSuggestionNumber: 2,
        includedClarifications: [],
      },
      { analysis: true },
    );
    const { pending, fetchMock } = holdAnalysisFetch();
    render(<RequirementsBuilder templates={templates} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(field(UI_TEXT.writing.textLabel("W-001")).value).toBe("A person has a role.");

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.startNewProject }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.cancel }));
    expect(field(UI_TEXT.writing.textLabel("W-001")).value).toBe("A person has a role.");

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.draft }));
    expect(screen.queryByRole("region", { name: UI_TEXT.writing.confirmHeading })).toBeNull();
    pending[0].resolve(
      analysisResponse(
        writingBody(pending[0].body, [
          {
            id: "W-001",
            kind: "new-functional",
            text: "The second draft names a deadline.",
            rationale: "A date is missing.",
            uncertainty: null,
            nestedCriteria: [],
          },
        ]),
      ),
    );
    expect(await screen.findByDisplayValue("The second draft names a deadline.")).toBeTruthy();
    await act(async () => {});
    flushDraft();
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY) ?? "{}") as { writing: { requestId: number } };
    expect(saved.writing.requestId).toBe(4);

    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.draft }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.startNewProject }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.clearProject }));
    pending[1].resolve(
      analysisResponse(
        writingBody(pending[1].body, [
          {
            id: "W-001",
            kind: "new-functional",
            text: "This late draft must not return.",
            rationale: "Too late.",
            uncertainty: null,
            nestedCriteria: [],
          },
        ]),
      ),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByDisplayValue("This late draft must not return.")).toBeNull();
    expect(screen.queryByLabelText(UI_TEXT.writing.textLabel("W-001"))).toBeNull();
    expect(field("Project name").value).toBe("");
    expect(sessionStorage.getItem(DOWNLOAD_COUNT_STORAGE_KEY)).toBe("4");
    vi.unstubAllGlobals();
  });

  it("does not request writing while restoring under Strict Mode", () => {
    cleanup();
    const config = baseConfig();
    seedWriting({
      requestId: 3,
      origin: "free-text",
      sourceFingerprint: currentSourceFingerprint(config, "free-text", []),
      writingFingerprint: "writing-fingerprint",
      suggestions: [pendingSuggestion()],
      dismissedIds: [],
      acceptedIds: [],
      nextSuggestionNumber: 2,
      includedClarifications: [],
    });
    const realStorage = window.sessionStorage;
    let writes = 0;
    const counting = new Proxy(realStorage, {
      get(target, prop, receiver) {
        if (prop === "setItem") {
          return (key: string, value: string) => {
            if (key === DRAFT_RECOVERY_STORAGE_KEY) writes += 1;
            return target.setItem(key, value);
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", { configurable: true, get: () => counting });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(
        <StrictMode>
          <RequirementsBuilder templates={templates} />
        </StrictMode>,
      );
      expect(field(UI_TEXT.writing.textLabel("W-001")).value).toBe(suggestionText);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(writes).toBeLessThanOrEqual(4);
      expect(counting.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toContain(suggestionText.trim());
    } finally {
      if (descriptor) Object.defineProperty(window, "sessionStorage", descriptor);
      vi.unstubAllGlobals();
    }
  });

  it("does not put a cleared writing session back before the parent stores the clear, and refresh stays empty", () => {
    cleanup();
    const config = baseConfig();
    const session = parseStoredWritingSession({
      requestId: 3,
      origin: "free-text",
      sourceFingerprint: currentSourceFingerprint(config, "free-text", []),
      writingFingerprint: "writing-fingerprint",
      suggestions: [pendingSuggestion("A person has a role.", "Opening a stored receipt shows its image.")],
      dismissedIds: [],
      acceptedIds: [],
      nextSuggestionNumber: 2,
      includedClarifications: [],
    });
    if (!session) throw new Error("Could not build a writing session.");
    const published: Array<typeof session | null> = [];
    function writer(generation: number, recovered: typeof session | null) {
      return (
        <RequirementsWriter
          config={config}
          resetGeneration={generation}
          recoveredWriting={recovered}
          onWritingChange={(next) => {
            published.push(next);
          }}
          clarifications={[]}
          privacyAcknowledged
          interactionBlocked={false}
          onNeedPrivacy={() => undefined}
          onApplyPrepared={() => undefined}
        />
      );
    }

    const view = render(<StrictMode>{writer(1, session)}</StrictMode>);
    expect(field(UI_TEXT.writing.textLabel("W-001")).value).toBe("A person has a role.");

    view.rerender(<StrictMode>{writer(2, session)}</StrictMode>);
    expect(screen.queryByLabelText(UI_TEXT.writing.textLabel("W-001"))).toBeNull();
    expect(published.at(-1)).toBeNull();

    view.rerender(writer(2, null));
    expect(screen.queryByLabelText(UI_TEXT.writing.textLabel("W-001"))).toBeNull();
    cleanup();

    seedWriting(
      {
        requestId: 3,
        origin: "free-text",
        sourceFingerprint: currentSourceFingerprint(config, "free-text", []),
        writingFingerprint: "writing-fingerprint",
        suggestions: [pendingSuggestion("A person has a role.", "Opening a stored receipt shows its image.")],
        dismissedIds: [],
        acceptedIds: [],
        nextSuggestionNumber: 2,
        includedClarifications: [],
      },
      { analysis: true },
    );
    render(<RequirementsBuilder templates={templates} />);
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.startNewProject }));
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.buttons.clearProject }));
    expect(screen.queryByLabelText(UI_TEXT.writing.textLabel("W-001"))).toBeNull();
    reloadBuilder();
    expect(screen.queryByLabelText(UI_TEXT.writing.textLabel("W-001"))).toBeNull();
    expect(field("Project name").value).toBe("");
  });

  it("replaces a recovered writing session without bringing the previous one back, including after refresh", async () => {
    cleanup();
    const previousText = "A person has a role.";
    const replacementText = "The second draft names a deadline.";
    const config = baseConfig();
    seedWriting(
      {
        requestId: 3,
        origin: "free-text",
        sourceFingerprint: currentSourceFingerprint(config, "free-text", []),
        writingFingerprint: "writing-fingerprint",
        suggestions: [pendingSuggestion(previousText, "Opening a stored receipt shows its image.")],
        dismissedIds: [],
        acceptedIds: [],
        nextSuggestionNumber: 2,
        includedClarifications: [],
      },
      { analysis: true },
    );
    const { pending } = holdAnalysisFetch();
    render(
      <StrictMode>
        <RequirementsBuilder templates={templates} />
      </StrictMode>,
    );
    expect(field(UI_TEXT.writing.textLabel("W-001")).value).toBe(previousText);

    const suggestionValue = () => (document.getElementById("writing-text-W-001") as HTMLTextAreaElement | null)?.value ?? "";
    fireEvent.click(screen.getByRole("button", { name: UI_TEXT.writing.draft }));
    pending[0].resolve(
      analysisResponse(
        writingBody(pending[0].body, [
          {
            id: "W-001",
            kind: "new-functional",
            text: replacementText,
            rationale: "A date is missing.",
            uncertainty: null,
            nestedCriteria: [],
          },
        ]),
      ),
    );
    expect(await screen.findByDisplayValue(replacementText)).toBeTruthy();
    const afterResult = suggestionValue();
    await act(async () => {});
    const afterParentUpdate = suggestionValue();

    expect(afterResult).toBe(replacementText);
    expect(afterParentUpdate).toBe(replacementText);
    expect(screen.queryByDisplayValue(previousText)).toBeNull();

    flushDraft();
    vi.stubGlobal("fetch", vi.fn());
    reloadBuilder();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(field(UI_TEXT.writing.textLabel("W-001")).value).toBe(replacementText);
    expect(screen.queryByDisplayValue(previousText)).toBeNull();
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY) ?? "{}") as {
      writing: { requestId: number; suggestions: Array<{ text: string }> };
    };
    expect(saved.writing.requestId).toBe(4);
    expect(saved.writing.suggestions[0].text).toBe(replacementText);
    vi.unstubAllGlobals();
  });
});

function storageWithDraftFailures(storage: Storage, failures: { remove: boolean; write: boolean }): Storage {
  return new Proxy(storage, {
    get(target, prop, receiver) {
      if (prop === "setItem") {
        return (key: string, value: string) => {
          if (failures.write && key === DRAFT_RECOVERY_STORAGE_KEY) throw new Error("blocked");
          return target.setItem(key, value);
        };
      }
      if (prop === "removeItem") {
        return (key: string) => {
          if (failures.remove && key === DRAFT_RECOVERY_STORAGE_KEY) throw new Error("blocked");
          return target.removeItem(key);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

