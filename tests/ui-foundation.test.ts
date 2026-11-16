import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(PROJECT_ROOT, "app/globals.css"), "utf-8");

type Rule = {
  selector: string;
  declarations: Map<string, string>;
  conditions: string[];
};

const rules = parseRules(css);

function parseRules(source: string, conditions: string[] = []): Rule[] {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const parsed: Rule[] = [];
  let index = 0;
  while (index < clean.length) {
    while (index < clean.length && /\s/.test(clean[index])) index += 1;
    const open = clean.indexOf("{", index);
    if (open === -1) break;
    const selector = clean.slice(index, open).trim();
    let depth = 1;
    let end = open + 1;
    while (end < clean.length && depth > 0) {
      if (clean[end] === "{") depth += 1;
      else if (clean[end] === "}") depth -= 1;
      end += 1;
    }
    const body = clean.slice(open + 1, end - 1);
    if (selector.startsWith("@")) parsed.push(...parseRules(body, [...conditions, selector]));
    else if (selector) parsed.push({ selector, declarations: parseDeclarations(body), conditions });
    index = end;
  }
  return parsed;
}

function parseDeclarations(body: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const part of body.split(";")) {
    const splitAt = part.indexOf(":");
    if (splitAt === -1) continue;
    const property = part.slice(0, splitAt).trim().toLowerCase();
    const value = part.slice(splitAt + 1).replace(/\s+/g, " ").trim();
    if (property && value) declarations.set(property, value);
  }
  return declarations;
}

function selectorParts(selector: string): string[] {
  return selector.split(",").map((part) => part.trim());
}

function valuesFor(selector: string, property: string): string[] {
  const values: string[] = [];
  for (const rule of rules) {
    if (!selectorParts(rule.selector).includes(selector)) continue;
    const value = rule.declarations.get(property);
    if (value) values.push(value);
  }
  return values;
}

function valueFor(selector: string, property: string): string {
  const values = valuesFor(selector, property);
  expect(values, `${selector} ${property}`).toHaveLength(1);
  return values[0];
}

function token(name: string): string {
  const value = valueFor(":root", name);
  expect(value.startsWith("#"), `${name} should be a hex color or a tested length`).toBe(true);
  return value.toLowerCase();
}

function luminance(hex: string): number {
  const channels = [0, 2, 4].map((start) => {
    const channel = parseInt(hex.slice(start + 1, start + 3), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function expectContrast(foregroundToken: string, backgroundToken: string, minimum: number) {
  const foreground = token(foregroundToken);
  const background = token(backgroundToken);
  const ratio = contrast(foreground, background);
  expect(
    ratio,
    `${foregroundToken} (${foreground}) on ${backgroundToken} (${background}) is ${ratio.toFixed(2)}:1`,
  ).toBeGreaterThanOrEqual(minimum);
}

describe("design tokens", () => {
  it("defines the foundation tokens on :root", () => {
    const names = [
      "--color-canvas",
      "--color-surface",
      "--color-output",
      "--color-inset",
      "--color-text",
      "--color-text-muted",
      "--color-placeholder",
      "--color-border",
      "--color-accent",
      "--color-accent-text",
      "--color-accent-hover",
      "--color-accent-active",
      "--color-danger",
      "--color-danger-text",
      "--color-danger-hover",
      "--color-danger-active",
      "--color-success",
      "--color-warning-bg",
      "--color-warning-border",
      "--color-warning-text",
      "--color-disabled-bg",
      "--color-disabled-text",
      "--color-disabled-border",
      "--color-focus",
      "--color-focus-gap",
      "--color-secondary-hover",
      "--color-secondary-active",
      "--focus-width",
      "--focus-offset",
    ];
    const defined = new Set(rules.find((rule) => selectorParts(rule.selector).includes(":root"))?.declarations.keys());
    expect(names.filter((name) => !defined?.has(name))).toEqual([]);
  });
});

describe("contrast", () => {
  const textSurfaces = ["--color-canvas", "--color-surface", "--color-output", "--color-inset", "--color-warning-bg"];

  it("meets AA for normal text, helper text, placeholders, errors, and status", () => {
    for (const surface of textSurfaces) {
      expectContrast("--color-text", surface, 4.5);
      expectContrast("--color-text-muted", surface, 4.5);
      expectContrast("--color-danger", surface, 4.5);
      expectContrast("--color-success", surface, 4.5);
    }
    expectContrast("--color-placeholder", "--color-surface", 4.5);
    expectContrast("--color-warning-text", "--color-warning-bg", 4.5);
    expectContrast("--color-text", "--color-secondary-hover", 4.5);
    expectContrast("--color-text", "--color-secondary-active", 4.5);
    expectContrast("--color-disabled-text", "--color-disabled-bg", 4.5);
  });

  it("meets AA for primary, secondary, and destructive button text", () => {
    expectContrast("--color-accent-text", "--color-accent", 4.5);
    expectContrast("--color-accent-text", "--color-accent-hover", 4.5);
    expectContrast("--color-accent-text", "--color-accent-active", 4.5);
    expectContrast("--color-text", "--color-surface", 4.5);
    expectContrast("--color-danger-text", "--color-danger", 4.5);
    expectContrast("--color-danger-text", "--color-danger-hover", 4.5);
    expectContrast("--color-danger-text", "--color-danger-active", 4.5);
  });

  it("meets non-text contrast for borders and the focus indicator", () => {
    for (const surface of ["--color-canvas", "--color-surface", "--color-output", "--color-inset"]) {
      expectContrast("--color-border", surface, 3);
      expectContrast("--color-danger", surface, 3);
      expectContrast("--color-focus", surface, 3);
    }
    expectContrast("--color-focus", "--color-warning-bg", 3);
    expectContrast("--color-focus", "--color-secondary-hover", 3);
    expectContrast("--color-focus", "--color-disabled-bg", 3);
    expectContrast("--color-focus-gap", "--color-accent", 3);
    expectContrast("--color-focus-gap", "--color-accent-hover", 3);
    expectContrast("--color-focus-gap", "--color-accent-active", 3);
    expectContrast("--color-focus-gap", "--color-danger", 3);
    expectContrast("--color-focus-gap", "--color-focus", 3);
    expectContrast("--color-warning-border", "--color-warning-bg", 3);
    expectContrast("--color-disabled-border", "--color-disabled-bg", 3);
    expectContrast("--color-text", "--color-surface", 3);
    expectContrast("--color-text", "--color-secondary-hover", 3);
  });
});

describe("control styling", () => {
  it("keeps a 3px focus outline, a 2px offset, and a contrasting gap", () => {
    expect(valueFor(":root", "--focus-width")).toBe("3px");
    expect(valueFor(":root", "--focus-offset")).toBe("2px");
    const outline = valueFor(":focus-visible", "outline");
    expect(outline).toContain("var(--focus-width)");
    expect(outline).toContain("var(--color-focus)");
    expect(outline).not.toMatch(/\bnone\b/);
    expect(valueFor(":focus-visible", "outline-offset")).toBe("var(--focus-offset)");
    expect(valueFor(":focus-visible", "box-shadow")).toContain("var(--color-focus-gap)");
  });

  it("does not remove outlines", () => {
    const removed = rules.flatMap((rule) =>
      [...rule.declarations.entries()]
        .filter(([property, propertyValue]) => property.startsWith("outline") && /\bnone\b/.test(propertyValue))
        .map(([property]) => `${rule.selector} ${property}`),
    );
    expect(removed).toEqual([]);
  });

  it("makes text fields full width without stretching checks, radios, or file inputs", () => {
    for (const selector of ['input[type="text"]', 'input[type="number"]', "select", "textarea"]) {
      expect(valuesFor(selector, "width")).toContain("100%");
    }
    for (const selector of ['input[type="checkbox"]', 'input[type="radio"]', 'input[type="file"]', "input"]) {
      expect(valuesFor(selector, "width")).not.toContain("100%");
    }
  });

  it("styles primary, secondary, destructive, and disabled buttons from tokens", () => {
    expect(valueFor("button", "background")).toBe("var(--color-accent)");
    expect(valueFor("button", "color")).toBe("var(--color-accent-text)");
    expect(valueFor("button:hover:not(:disabled)", "background")).toBe("var(--color-accent-hover)");
    expect(valueFor("button.secondary", "background")).toBe("var(--color-surface)");
    expect(valueFor("button.secondary", "color")).toBe("var(--color-text)");
    expect(valueFor("button.destructive", "background")).toBe("var(--color-danger)");
    expect(valueFor("button.destructive", "color")).toBe("var(--color-danger-text)");
    expect(valueFor("button.destructive:hover:not(:disabled)", "background")).toBe("var(--color-danger-hover)");
    expect(valueFor("button:disabled", "background")).toBe("var(--color-disabled-bg)");
    expect(valueFor("button:disabled", "color")).toBe("var(--color-disabled-text)");
    expect(valueFor("button.secondary:disabled", "background")).toBe("var(--color-disabled-bg)");
    expect(valueFor("button.destructive:disabled", "background")).toBe("var(--color-disabled-bg)");
  });

  it("uses the danger color for invalid fields and a readable placeholder", () => {
    expect(valueFor('[aria-invalid="true"]', "border-color")).toBe("var(--color-danger)");
    expect(valueFor(".error", "color")).toBe("var(--color-danger)");
    expect(valueFor(".hint", "color")).toBe("var(--color-text-muted)");
    expect(valueFor("input::placeholder", "color")).toBe("var(--color-placeholder)");
    expect(valueFor("textarea::placeholder", "color")).toBe("var(--color-placeholder)");
    expect(valueFor("input::placeholder", "opacity")).toBe("1");
    expect(valueFor("textarea::placeholder", "opacity")).toBe("1");
  });

  it("leaves the current page width and desktop columns in place", () => {
    expect(valueFor("main", "max-width")).toBe("1200px");
    const desktop = rules.find(
      (rule) =>
        selectorParts(rule.selector).includes(".layout") &&
        rule.conditions.some((condition) => condition.includes("min-width: 960px")),
    );
    expect(desktop?.declarations?.get("grid-template-columns")).toBe("minmax(0, 1fr) minmax(0, 1fr)");
  });

  it("does not apply the destructive class in the current components", () => {
    const componentsDir = path.join(PROJECT_ROOT, "components");
    const files = fs.readdirSync(componentsDir).filter((file) => file.endsWith(".tsx"));
    const applied = files.filter((file) => fs.readFileSync(path.join(componentsDir, file), "utf-8").includes("destructive"));
    expect(applied).toEqual([]);
  });
});
