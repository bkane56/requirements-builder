import {
  CLIENT_STATE_LABELS,
  CLIENT_STATES,
  DATA_LIBRARIES,
  DATA_LIBRARY_LABELS,
  REACT_ROUTER_LABELS,
  REACT_ROUTERS,
  UI_FRAMEWORKS,
  type ClientState,
  type DataLibrary,
  type ReactViteFramework,
  type UiFramework,
  type UiFrameworkId,
} from "./constants";

export type UiFrameworkPatch = Partial<Pick<ReactViteFramework, "routing" | "state" | "dataLibrary">>;

export function defaultUiFramework(framework: "nextjs"): Extract<UiFramework, { framework: "nextjs" }>;
export function defaultUiFramework(framework: "react-vite"): ReactViteFramework;
export function defaultUiFramework(framework: UiFrameworkId): UiFramework;
export function defaultUiFramework(framework: UiFrameworkId): UiFramework {
  if (framework === "nextjs") return { framework: "nextjs", state: "none", dataLibrary: "none" };
  return { framework: "react-vite", routing: "react-router", state: "none", dataLibrary: "none" };
}

export function isLegalUiFrameworks(entries: unknown): entries is UiFramework[] {
  if (!Array.isArray(entries)) return false;
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!isLegalEntry(entry) || seen.has(entry.framework)) return false;
    seen.add(entry.framework);
  }
  return true;
}

// Drops unknown frameworks, replaces unsupported option values with defaults, keeps one entry per
// framework, and sorts Next.js before React + Vite.
export function normalizeUiFrameworks(entries: unknown): UiFramework[] {
  if (!Array.isArray(entries)) return [];
  const seen = new Set<string>();
  const coerced: UiFramework[] = [];
  for (const raw of entries) {
    if (!isRecord(raw) || !isOneOf(UI_FRAMEWORKS, raw.framework) || seen.has(raw.framework)) continue;
    seen.add(raw.framework);
    coerced.push(coerceEntry(raw.framework, raw));
  }
  return [...coerced].sort(
    (left, right) => UI_FRAMEWORKS.indexOf(left.framework) - UI_FRAMEWORKS.indexOf(right.framework),
  );
}

export function replaceUiFramework(
  entries: UiFramework[],
  framework: UiFrameworkId,
  patch: UiFrameworkPatch,
): UiFramework[] {
  return entries.map((entry) => (entry.framework === framework ? ({ ...entry, ...patch } as UiFramework) : entry));
}

export function hasUiFramework(entries: UiFramework[], framework: UiFrameworkId): boolean {
  return entries.some((entry) => entry.framework === framework);
}

export function uiFrameworkSummary(entry: UiFramework): string {
  const state = `client state: ${CLIENT_STATE_LABELS[entry.state]}`;
  const data = `server data: ${DATA_LIBRARY_LABELS[entry.dataLibrary]}`;
  if (entry.framework === "nextjs") return `Next.js (App Router, ${state}, ${data})`;
  return `React + Vite (routing: ${REACT_ROUTER_LABELS[entry.routing]}, ${state}, ${data})`;
}

export function uiFrameworkPlaceholderValues(entry: UiFramework): Record<string, string> {
  return {
    routingSentence: routingSentence(entry),
    stateSentence: stateSentence(entry.state),
    dataSentence: dataSentence(entry.dataLibrary),
  };
}

export function uiFrameworksEqual(left: UiFramework[], right: UiFramework[]): boolean {
  if (left.length !== right.length) return false;
  const ordered = (entries: UiFramework[]) =>
    [...entries].sort((a, b) => UI_FRAMEWORKS.indexOf(a.framework) - UI_FRAMEWORKS.indexOf(b.framework));
  return ordered(left).every((entry, index) => sameFramework(entry, ordered(right)[index]));
}

function routingSentence(entry: UiFramework): string {
  if (entry.framework === "nextjs") {
    return "Use the Next.js App Router. Do not add React Router or another client router.";
  }
  if (entry.routing === "react-router") return "Use React Router for browser routes.";
  if (entry.routing === "tanstack-router") return "Use TanStack Router for browser routes.";
  return "Do not add a client router unless a later requirement names one.";
}

function stateSentence(state: ClientState): string {
  if (state === "redux-toolkit") return "Use Redux Toolkit for shared client state. Keep server data out of that store.";
  if (state === "zustand") return "Use Zustand for shared client state. Keep server data out of that store.";
  if (state === "context") return "Use React context for shared client state. Do not add Redux or Zustand.";
  return "Do not add a client state library. Keep state in the component that owns it.";
}

function dataSentence(library: DataLibrary): string {
  if (library === "tanstack-query") return "Use TanStack Query for server data, cache, and request status.";
  return "Do not add a data-fetching library unless a later requirement names one.";
}

function coerceEntry(framework: UiFrameworkId, raw: Record<string, unknown>): UiFramework {
  const defaults = defaultUiFramework(framework);
  const state = pick(CLIENT_STATES, raw.state, defaults.state);
  const dataLibrary = pick(DATA_LIBRARIES, raw.dataLibrary, defaults.dataLibrary);
  if (framework === "nextjs") return { framework, state, dataLibrary };
  return {
    framework,
    routing: pick(REACT_ROUTERS, raw.routing, defaultUiFramework("react-vite").routing),
    state,
    dataLibrary,
  };
}

function isLegalEntry(entry: unknown): entry is UiFramework {
  if (!isRecord(entry)) return false;
  if (entry.framework === "nextjs") {
    return isOneOf(CLIENT_STATES, entry.state) && isOneOf(DATA_LIBRARIES, entry.dataLibrary);
  }
  if (entry.framework === "react-vite") {
    return (
      isOneOf(REACT_ROUTERS, entry.routing) &&
      isOneOf(CLIENT_STATES, entry.state) &&
      isOneOf(DATA_LIBRARIES, entry.dataLibrary)
    );
  }
  return false;
}

function sameFramework(left: UiFramework, right: UiFramework): boolean {
  if (left.framework !== right.framework || left.state !== right.state || left.dataLibrary !== right.dataLibrary) {
    return false;
  }
  if (left.framework === "react-vite" && right.framework === "react-vite") return left.routing === right.routing;
  return true;
}

function pick<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return isOneOf(values, value) ? value : fallback;
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
