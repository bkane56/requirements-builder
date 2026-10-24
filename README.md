# Requirements Builder

Assembles a deterministic `PROJECT_REQUIREMENTS.md` from user-entered business requirements and reusable Markdown modules. No AI, database, or network access is needed to generate a document.

See [requirements.md](requirements.md) for the full product requirements. This repository currently implements Stage 1, Build 1A.

## Prerequisites

- Node.js `^22.12.0 || ^24.0.0 || >=26.0.0` (the binding constraint is Vitest 5; Next.js 16 alone requires `>=20.9.0`). Verified locally on Node 24.14.1.
- Yarn 1.22 (classic). Do not use npm.

## Commands

```bash
yarn install
yarn lint
yarn typecheck
yarn test
yarn test:coverage
yarn build
yarn start   # production server on http://localhost:3000
yarn dev     # development server
```

## How it works

- `templates/` holds the Markdown module content. `lib/module-registry.ts` holds each module's metadata (ID, version, target section, and when it applies).
- `app/page.tsx` reads the templates with `fs.readFileSync` while rendering. The route exports `ensureStatic = "navigation"`, so it is prerendered at build time and the build fails if it ever becomes dynamic. `yarn start` therefore does not read `templates/` at runtime; rebuild after editing a template.
- `lib/validate-config.ts` checks required fields and input lengths. `lib/assemble-requirements.ts` builds the document as a pure function of the configuration and template text.
- User-entered text is inserted verbatim. Missing optional inputs are listed as open questions rather than filled in.

To add a module, create its Markdown file under `templates/` and add an entry to `MODULES` in `lib/module-registry.ts`.

## Current status (Build 1A)

Implemented: project name, description, business requirements, acceptance criteria, stretch goals, Fast/Project mode, deterministic assembly, read-only Markdown preview.

Not yet implemented: technology selections and conditional modules (1B), golden fixtures and coverage thresholds (1C), copy and download (1D), and all Stage 2+ features (editing, JSON import/export, AI review).
