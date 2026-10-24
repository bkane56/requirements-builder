// @vitest-environment happy-dom
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

  it("rejects an out-of-range coverage target, focuses it, and recovers once corrected", () => {
    fillRequired();
    change("Line coverage target (%)", "150");
    assemble();

    expect(screen.getByText("Coverage targets must be whole numbers from 0 to 100.")).toBeTruthy();
    expect(document.activeElement).toBe(field("Line coverage target (%)"));
    expect(preview()).toBe("");

    change("Line coverage target (%)", "90");
    assemble();
    expect(screen.queryByText("Coverage targets must be whole numbers from 0 to 100.")).toBeNull();
    expect(preview()).toContain("at least 90% line coverage and 80% branch coverage");
  });

  it("rejects an empty coverage target", () => {
    fillRequired();
    change("Branch coverage target (%)", "");
    assemble();
    expect(screen.getByText("Coverage targets must be whole numbers from 0 to 100.")).toBeTruthy();
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
