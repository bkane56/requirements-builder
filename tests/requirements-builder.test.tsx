// @vitest-environment happy-dom
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RequirementsBuilder from "../components/requirements-builder";
import { loadTemplates } from "../lib/load-templates";

const templates = loadTemplates();

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement & HTMLSelectElement;
const maybeField = (label: string) => screen.queryByLabelText(label);
const optionValues = (label: string) => [...field(label).options].map((option) => option.value);
const preview = () => (screen.getByLabelText("Assembled Markdown") as HTMLTextAreaElement).value;

const change = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const assemble = () => fireEvent.click(screen.getByRole("button", { name: "Assemble Draft" }));

function fillRequired(businessRequirements = "Users can upload a receipt.") {
  change("Project name", "Receipt Tracker");
  change("Business requirements", businessRequirements);
}

beforeEach(() => {
  render(<RequirementsBuilder templates={templates} />);
});

afterEach(cleanup);

describe("conditional controls", () => {
  it("shows only the controls that apply to the default configuration", () => {
    expect(field("Application type").value).toBe("other");
    expect(field("Primary language").value).toBe("other");
    expect(maybeField("Includes an HTTP API")).not.toBeNull();
    for (const hidden of ["Runtime", "Backend framework", "Frontend framework", "Swagger / OpenAPI documentation", "Postman collection"]) {
      expect(maybeField(hidden), hidden).toBeNull();
    }
    expect(maybeField("Line coverage target (%)")).not.toBeNull();
  });

  it("shows the Node.js runtime only for TypeScript and JavaScript", () => {
    change("Primary language", "typescript");
    expect(optionValues("Runtime")).toEqual(["none", "nodejs"]);
    change("Primary language", "java");
    expect(maybeField("Runtime")).toBeNull();
    change("Primary language", "javascript");
    expect(maybeField("Runtime")).not.toBeNull();
    change("Primary language", "python");
    expect(maybeField("Runtime")).toBeNull();
  });

  it("offers only the backend framework that matches the language and runtime", () => {
    change("Application type", "rest-api");
    change("Primary language", "java");
    expect(optionValues("Backend framework")).toEqual(["none", "spring-boot"]);
    change("Primary language", "python");
    expect(optionValues("Backend framework")).toEqual(["none", "fastapi"]);
    change("Primary language", "typescript");
    expect(maybeField("Backend framework")).toBeNull();
    change("Runtime", "nodejs");
    expect(optionValues("Backend framework")).toEqual(["none", "nodejs-api"]);
  });

  it("shows the frontend choice only for Web App, defaulting to No preference", () => {
    change("Application type", "web-app");
    expect(optionValues("Frontend framework")).toEqual(["nextjs", "react-vite", "no-preference"]);
    expect(field("Frontend framework").value).toBe("no-preference");
    change("Application type", "rest-api");
    expect(maybeField("Frontend framework")).toBeNull();
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
    change("Primary language", "typescript");
    change("Runtime", "nodejs");
    change("Backend framework", "nodejs-api");

    change("Primary language", "java");
    expect(maybeField("Runtime")).toBeNull();
    expect(field("Backend framework").value).toBe("none");

    change("Primary language", "typescript");
    expect(field("Runtime").value).toBe("none");
  });

  it("clears the frontend and API documentation when the application type changes", () => {
    change("Application type", "web-app");
    change("Frontend framework", "nextjs");
    change("Application type", "cli-library");
    change("Application type", "web-app");
    expect(field("Frontend framework").value).toBe("no-preference");

    change("Application type", "rest-api");
    fireEvent.click(field("Swagger / OpenAPI documentation"));
    expect(field("Swagger / OpenAPI documentation").checked).toBe(true);
    change("Application type", "cli-library");
    change("Application type", "rest-api");
    expect(field("Swagger / OpenAPI documentation").checked).toBe(false);
  });

  it("clears the backend framework and API documentation when the HTTP API is turned off", () => {
    change("Application type", "ai-agent");
    change("Primary language", "python");
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
    change("Primary language", "java");
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

    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Copied the assembled Markdown.");
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
