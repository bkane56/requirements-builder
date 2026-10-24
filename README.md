# Requirements Builder

Assembles a deterministic `PROJECT_REQUIREMENTS.md` from user-entered business requirements and reusable Markdown modules. No AI, database, or network access is needed to generate a document.

See [requirements.md](requirements.md) for the full product requirements. This repository currently implements Stage 1 through Build 1B.

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
- `lib/selection-rules.ts` defines which runtime, backend framework, and frontend choices apply to the current selections, and resets dependent choices when a parent choice changes. The UI and the validator both use it.
- `lib/validate-config.ts` checks required fields, input lengths, selection compatibility, and coverage targets. `lib/assemble-requirements.ts` builds the document as a pure function of the configuration and template text.
- User-entered text is inserted verbatim. Missing optional inputs are listed as open questions rather than filled in. Template placeholders (currently only the coverage targets) are filled in template text only, never in user text.

To add a module, create its Markdown file under `templates/` and add an entry to `MODULES` in `lib/module-registry.ts`.

## Current status (Build 1B)

Implemented: project inputs, Fast/Project mode, application type, language, Node.js runtime, backend framework, frontend framework (Web App only), HTTP API inclusion, Swagger/OpenAPI and Postman (only with an HTTP API), optional testing/data/security modules, configurable coverage targets, Fast Mode architecture and complexity constraints, compatibility validation, deterministic assembly, read-only Markdown preview.

Package managers are fixed per language (Maven for Java, uv for Python, Yarn for TypeScript and JavaScript) and are not selectable.

Not yet implemented: golden fixtures, UI tests, and an enforced coverage threshold (1C); copy and download (1D); all Stage 2+ features (editing, JSON import/export, AI review).
