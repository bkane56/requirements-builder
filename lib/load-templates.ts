import fs from "node:fs";
import path from "node:path";
import { MODULES } from "./module-registry";

export type Templates = Record<string, string>;

export const TEMPLATES_DIR = path.join(process.cwd(), "templates");

// Server-only: reads template files synchronously so the page is prerendered at build time.
export function loadTemplates(): Templates {
  return Object.fromEntries(
    MODULES.map((module) => [
      module.id,
      fs.readFileSync(path.join(TEMPLATES_DIR, module.file), "utf-8"),
    ]),
  );
}
