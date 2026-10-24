# Requirements Builder

Assembles a deterministic `PROJECT_REQUIREMENTS.md` from user-entered business requirements and reusable Markdown modules. No AI, database, or network access is needed to generate a document.

See [requirements.md](requirements.md) for the full product requirements. This repository implements Stage 1 and the Stage 2A editing workflow. No environment variables are required.

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
- `lib/validate-config.ts` checks required fields, input lengths, selection compatibility, and coverage targets. An invalid line target and an invalid branch target are reported separately. `lib/assemble-requirements.ts` builds the document as a pure function of the configuration and template text.
- User-entered text is inserted verbatim. Missing optional inputs are listed as open questions rather than filled in. Template placeholders (currently only the coverage targets) are filled in template text only, never in user text.

To add a module, create its Markdown file under `templates/` and add an entry to `MODULES` in `lib/module-registry.ts`. Any new `{{placeholder}}` must also be added to `TEMPLATE_PLACEHOLDERS` in `lib/constants.ts`.

## Tests

All tests run with Vitest (`yarn test`). The UI tests use React Testing Library with `happy-dom`, selected per file by the `// @vitest-environment happy-dom` comment; all other tests run in Node. `happy-dom` was chosen over jsdom because current jsdom requires Node `^22.22.2 || ^24.15.0`, which is narrower than this project's supported range.

- `tests/assembly.test.ts`, `tests/validation.test.ts`, `tests/selection-rules.test.ts`, `tests/config.test.ts`, `tests/download-filename.test.ts`: unit tests for the pure logic in `lib/`.
- `tests/golden.test.ts`: compares the assembled document for each golden configuration with its approved document, character for character.
- `tests/templates.test.ts`: template integrity. Every registered file exists, every template file is registered, module IDs are unique, versions and sections are valid, templates use only supported placeholders and no `#`, `##`, or `###` headings (those levels belong to the assembled document). It also enforces the requirements.md rule against em dashes and emojis in `app/`, `components/`, `lib/`, and `templates/`. User-entered text is exempt and is preserved verbatim.
- `tests/requirements-builder.test.tsx`: UI behavior, including conditional controls, compatibility resets, validation messages and focus, separate coverage-field errors, assembly, editing, stale and edited notices, reassembly confirmation, restore, copy, download, and the assembly error alert.

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

## Usage

1. Start the app with `yarn dev`, or with `yarn build` and `yarn start`.
2. Enter a project name and the business requirements. Both are required. Optional description, acceptance criteria, and stretch goals are inserted verbatim when provided.
3. Choose Fast or Project mode, then the application type, language, and any technology options the form shows. Dependent choices reset when a parent choice changes.
4. Select Assemble Draft. The preview stays empty until this succeeds. Fix any field errors and select Assemble Draft again. Focus moves to the first invalid field. After a document exists, the same button is labeled Reassemble.
5. Edit the Markdown document directly if you want. Those edits stay in the document until you confirm a replacement. Changing the form does not change the document by itself. A notice says when the form no longer matches the last assembly, and a separate notice says when the document has manual edits. Changing a value back removes the matching notice.
6. Copy or download the current document. Both actions stay disabled while the document is empty. They use the text in the document, including manual edits.

Copy Markdown writes that text to the clipboard unchanged, including spaces, line endings, and any `{{placeholders}}`. A success message confirms it. If the browser clipboard API is missing or rejects the write, the page shows an error and leaves the text in the document so it can be selected manually. Copy works in a secure context such as `localhost`.

Download Markdown saves that same string. The first download in a browser tab is `PROJECT_REQUIREMENTS.md`, the next is `PROJECT_REQUIREMENTS (1).md`, and later downloads continue in order. The tab remembers the next number in session storage, including after a refresh. The file is built in the browser from a UTF-8 Blob and a temporary object URL, which is revoked after the download starts. The number advances only after the browser has been asked to start the download. Starting a download does not mean the file was saved. A name can still match a file left from an earlier browser session. If session storage is unavailable, numbering continues for the current page view and starts again when the page is opened again. There is no server download route. The assembler ends a generated document with one newline, and a download keeps the current text as shown.

Reassemble replaces the document from the current form. If the document has manual edits that would be lost, the page asks you to keep or replace them. Keep edits, or Escape, leaves the document as it is. Restore generated draft is available only when the document differs from the last successful assembly. It asks before putting that assembly back. Restoring does not apply later form changes, so the stale notice can remain.

The browser may show its generic leave prompt while the document has manual edits. That prompt is best-effort and does not save the document.

## Current status (Stage 2A)

Implemented: project inputs, Fast/Project mode, application type, language, Node.js runtime, backend framework, frontend framework (Web App only), HTTP API inclusion, Swagger/OpenAPI and Postman (only with an HTTP API), optional testing/data/security modules, configurable coverage targets, Fast Mode architecture and complexity constraints, compatibility validation, deterministic assembly, an editable Markdown document, stale and edited notices, confirmed reassembly and restore, copy, and download.

Package managers are fixed per language (Maven for Java, uv for Python, Yarn for TypeScript and JavaScript) and are not selectable.

### Limitations

- The document updates from the form only when assembly succeeds. A failed attempt leaves the current document in place. Manual edits are not written back into the form.
- Copy uses the browser clipboard API. When that API is unavailable, the assembled text stays in the preview for manual selection.
- Download names are remembered only for the current browser tab. They can still match a file saved in an earlier session, and starting a download does not confirm that the file was saved.
- Templates are read at build time. Editing a template requires another build before `yarn start` serves it.
- Line and branch coverage are whole-number targets from 0 to 100. They are guidance in the generated document, not a test run.

### Deferred to later stages

- Stage 2B: configuration JSON import/export.
- Stage 2C: further integration polish.
- Stage 3: optional AI review.
- Stage 4: Fast Mode presets, one-click reset, and demo polish.
