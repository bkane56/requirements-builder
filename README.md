# Requirements Builder

Assembles a deterministic `PROJECT_REQUIREMENTS.md` from user-entered business requirements and reusable Markdown modules. No AI, database, or network access is needed to generate a document.

See [requirements.md](requirements.md) for the full product requirements. This repository currently implements Stage 1 through Build 1C.

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

To add a module, create its Markdown file under `templates/` and add an entry to `MODULES` in `lib/module-registry.ts`. Any new `{{placeholder}}` must also be added to `TEMPLATE_PLACEHOLDERS` in `lib/constants.ts`.

## Tests

All tests run with Vitest (`yarn test`). The UI tests use React Testing Library with `happy-dom`, selected per file by the `// @vitest-environment happy-dom` comment; all other tests run in Node. `happy-dom` was chosen over jsdom because current jsdom requires Node `^22.22.2 || ^24.15.0`, which is narrower than this project's supported range.

- `tests/assembly.test.ts`, `tests/validation.test.ts`, `tests/selection-rules.test.ts`: unit tests for the pure logic in `lib/`.
- `tests/golden.test.ts`: compares the assembled document for each golden configuration with its approved document, character for character.
- `tests/templates.test.ts`: template integrity. Every registered file exists, every template file is registered, module IDs are unique, versions and sections are valid, templates use only supported placeholders and no `#`, `##`, or `###` headings (those levels belong to the assembled document). It also enforces the requirements.md rule against em dashes and emojis in `app/`, `components/`, `lib/`, and `templates/`. User-entered text is exempt and is preserved verbatim.
- `tests/requirements-builder.test.tsx`: UI behavior, including conditional controls, compatibility resets, validation messages and focus, assembly, and the assembly error alert.

`yarn test:coverage` enforces at least 85% line and 80% branch coverage over `lib/` and `components/`. `app/layout.tsx` and `app/page.tsx` are excluded as framework scaffolding; template loading through the page is verified by `yarn build`.

## Golden fixtures

Each case is a pair: `tests/fixtures/configs/<name>.json` (the form input) and `tests/fixtures/expected/<name>.md` (the approved document). The expected documents were written and reviewed by hand against the templates. They are never produced by the assembler, and the tests never write or update them.

Current cases: `java-spring-rest-fast`, `python-agent-no-api-fast`, `nextjs-web-app-project`, `node-ts-api-project`, and `verbatim-user-content-fast` (Markdown, special characters, whitespace, and literal `{{placeholders}}` in user text).

When a golden test fails:

1. Read the diff printed by `yarn test`. Decide whether the change is an intended consequence of your template, registry, or assembler change, or a regression.
2. If it is a regression, fix the code, not the fixture.
3. If it is intended, edit the affected `expected/*.md` files by hand so they match the intended output, and review each changed line. Do not copy the received output wholesale into the fixture.
4. Check whitespace explicitly: trailing spaces, tabs, blank lines between sections, and exactly one final newline. Editors that trim whitespace on save will corrupt the verbatim fixture.
5. Commit fixture changes together with the code change that caused them, and explain the change in the commit message so the reviewer can confirm it.

To add a case, add a configuration JSON (it must pass validation and must already be in its normalized form, meaning reachable through the UI) and a hand-written expected document with the same name. The test fails if either file of a pair is missing.

## Current status (Build 1C)

Implemented: project inputs, Fast/Project mode, application type, language, Node.js runtime, backend framework, frontend framework (Web App only), HTTP API inclusion, Swagger/OpenAPI and Postman (only with an HTTP API), optional testing/data/security modules, configurable coverage targets, Fast Mode architecture and complexity constraints, compatibility validation, deterministic assembly, read-only Markdown preview.

Package managers are fixed per language (Maven for Java, uv for Python, Yarn for TypeScript and JavaScript) and are not selectable.

Build 1C adds golden fixtures, template integrity tests, UI behavior tests, and enforced coverage thresholds.

Not yet implemented: copy and download (1D); all Stage 2+ features (editing, JSON import/export, AI review).
