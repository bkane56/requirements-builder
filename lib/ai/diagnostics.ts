export type AnalysisDiagnostic = {
  stage: "response-json" | "response-status" | "output-text" | "output-json" | "schema";
  httpStatus?: number;
  responseStatus?: string | null;
  incompleteReason?: string | null;
  outputTextPresent?: boolean;
  jsonParsed?: boolean;
  schemaFailure?: string;
};

export function reportAnalysisDiagnostic(
  diagnostic: AnalysisDiagnostic,
  channel: "ai-analysis" | "ai-writing" = "ai-analysis",
): void {
  if (process.env.NODE_ENV !== "development" || process.env.VITEST === "true") return;
  console.error(`[${channel}] ${JSON.stringify(diagnostic)}`);
}
