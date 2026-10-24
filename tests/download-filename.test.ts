import { describe, expect, it } from "vitest";
import { downloadFilename, parseStoredDownloadCount } from "../lib/download-filename";

describe("downloadFilename", () => {
  it("uses the base name for the first download", () => {
    expect(downloadFilename(0)).toBe("PROJECT_REQUIREMENTS.md");
    expect(downloadFilename(-1)).toBe("PROJECT_REQUIREMENTS.md");
    expect(downloadFilename(Number.NaN)).toBe("PROJECT_REQUIREMENTS.md");
  });

  it("numbers later downloads sequentially", () => {
    expect(downloadFilename(1)).toBe("PROJECT_REQUIREMENTS (1).md");
    expect(downloadFilename(2)).toBe("PROJECT_REQUIREMENTS (2).md");
    expect(downloadFilename(12)).toBe("PROJECT_REQUIREMENTS (12).md");
  });
});

describe("parseStoredDownloadCount", () => {
  it("reads a stored count and ignores missing or invalid values", () => {
    expect(parseStoredDownloadCount(null)).toBe(0);
    expect(parseStoredDownloadCount("0")).toBe(0);
    expect(parseStoredDownloadCount("3")).toBe(3);
    expect(parseStoredDownloadCount("")).toBe(0);
    expect(parseStoredDownloadCount("1.5")).toBe(0);
    expect(parseStoredDownloadCount("-2")).toBe(0);
    expect(parseStoredDownloadCount("nope")).toBe(0);
  });
});