// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownPreview } from "../components/markdown-preview";

describe("MarkdownPreview", () => {
  it("renders headings, lists, code, links, and tables from the given markdown", () => {
    const { container } = render(
      <MarkdownPreview
        markdown={[
          "# Receipts",
          "",
          "- Upload a file",
          "",
          "```",
          "keep this code",
          "```",
          "",
          "[Docs](https://example.com/docs)",
          "",
          "| Name | State |",
          "| --- | --- |",
          "| Receipt | Saved |",
          "",
        ].join("\n")}
      />,
    );

    expect(screen.getByRole("heading", { name: "Receipts" }).tagName).toBe("H1");
    expect(screen.getByRole("list").textContent).toContain("Upload a file");
    expect(container.querySelector("code")?.textContent).toContain("keep this code");
    expect(screen.getByRole("link", { name: "Docs" }).getAttribute("href")).toBe("https://example.com/docs");
    expect(screen.getByRole("cell", { name: "Saved" })).toBeTruthy();
  });

  it("does not execute raw HTML or unsafe links", () => {
    const marker = "rendered-markdown-attack";
    const { container } = render(
      <MarkdownPreview
        markdown={[
          `<script>window.${marker} = true</script>`,
          "",
          `<img src="x" onerror="window.${marker} = true">`,
          "",
          `[click](javascript:window.${marker} = true)`,
        ].join("\n")}
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect((window as unknown as Record<string, unknown>)[marker]).toBeUndefined();
    expect(container.textContent).toContain("<script>");
  });
});
