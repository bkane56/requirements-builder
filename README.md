# Requirements Builder

Assembles a deterministic `PROJECT_REQUIREMENTS.md` from user-entered business requirements and reusable Markdown modules. Generating a document does not need AI, a database, or network access.

See [requirements.md](requirements.md) for the full product requirements. This repository implements Stage 1, the Stage 2A editing workflow, Stage 2B configuration import and export, and optional AI requirements analysis. Deterministic assembly does not need environment variables. Optional AI analysis stays off unless the server is configured, as described under Optional AI analysis.

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

The path from page render through assembly, editing, configuration import and export, copy, and download is in [docs/EXECUTION_FLOW.md](docs/EXECUTION_FLOW.md).

- `templates/` holds the Markdown module content. `lib/module-registry.ts` holds each module's metadata (ID, version, target section, and when it applies).
- `app/page.tsx` reads the templates with `fs.readFileSync` while rendering. The route exports `ensureStatic = "navigation"`, so it is prerendered at build time and the build fails if it ever becomes dynamic. `yarn start` therefore does not read `templates/` at runtime; rebuild after editing a template.
- `lib/selection-rules.ts` defines which runtime, backend framework, and frontend choices apply to the current selections, and resets dependent choices when a parent choice changes. The UI and the validator both use it.
- `lib/validate-config.ts` checks required fields, input lengths, selection compatibility, and coverage targets. An invalid line target and an invalid branch target are reported separately. `lib/advisories.ts` recommends integration tests for a Web App that has a UI and an HTTP backend when that module is off. The recommendation does not block assembly and is not written into the document. `lib/assemble-requirements.ts` builds the document as a pure function of the configuration and template text.
- User-entered text is inserted verbatim. Missing optional inputs are listed as open questions rather than filled in. Template placeholders (currently only the coverage targets) are filled in template text only, never in user text.
- Free-text business requirements are the document source until you choose structured requirements. Structured mode emits confirmed `FR-###` and `AC-###` entries only, under confirmed-requirement headings. Proposed items stay in the form and do not block assembly when their text is incomplete. A missing `requirementsContent` field in an older configuration file stays in free-text mode. A present but invalid field is rejected.

To add a module, create its Markdown file under `templates/` and add an entry to `MODULES` in `lib/module-registry.ts`. Any new `{{placeholder}}` must also be added to `TEMPLATE_PLACEHOLDERS` in `lib/constants.ts`.

## Tests

All tests run with Vitest (`yarn test`). The UI tests use React Testing Library with `happy-dom`, selected per file by the `// @vitest-environment happy-dom` comment; all other tests run in Node. `happy-dom` was chosen over jsdom because current jsdom requires Node `^22.22.2 || ^24.15.0`, which is narrower than this project's supported range.

- `tests/assembly.test.ts`, `tests/validation.test.ts`, `tests/advisories.test.ts`, `tests/requirements-content.test.ts`, `tests/selection-rules.test.ts`, `tests/config.test.ts`, `tests/config-file.test.ts`, `tests/download-filename.test.ts`, `tests/ai-analysis.test.ts`: unit tests for the pure logic in `lib/`. AI tests use a fake provider and do not call a network.
- `tests/golden.test.ts`: compares the assembled document for each golden configuration with its approved document, character for character.
- `tests/templates.test.ts`: template integrity. Every registered file exists, every template file is registered, module IDs are unique, versions and sections are valid, templates use only supported placeholders and no `#`, `##`, or `###` headings (those levels belong to the assembled document). It also enforces the requirements.md rule against em dashes and emojis in `app/`, `components/`, `lib/`, and `templates/`. User-entered text is exempt and is preserved verbatim.
- `tests/requirements-builder.test.tsx`: UI behavior, including conditional controls, compatibility resets, validation messages and focus, separate coverage-field errors, assembly, editing, stale and edited notices, reassembly confirmation, restore, configuration import and export, copy, download, the assembly error alert, and AI analysis. The AI tests mock `fetch`. They check the privacy confirmation, an edit made while a request is in flight, a late response, and that the form and document stay unchanged.

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
3. Choose Fast or Project mode, then the application type. Check one or more backend languages, and, for a Web App, one or more UI languages and UI frameworks. Checking the first UI framework selects TypeScript, which you can change. Assemble Draft requires a UI language when a UI framework is selected. Import does not add a language that was not saved. Each checked language shows its package manager, version, test runner, and linter, already filled with defaults. Next.js and React + Vite can both be checked. Next.js uses the App Router and offers client state and server data. React + Vite also offers routing. A Web App can include a backend at the same time: keep the backend languages, and include an HTTP API to choose one backend framework. Dependent choices reset when a parent choice changes. JavaScript and TypeScript on the same side share one package manifest, so those shared choices stay in sync. The two sides stay separate.
4. Select Assemble Draft. The preview stays empty until this succeeds. Fix any field errors and select Assemble Draft again. Focus moves to the first invalid field. After a document exists, the same button is labeled Reassemble.
5. Edit the Markdown document directly if you want. Those edits stay in the document until you confirm a replacement. Changing the form does not change the document by itself. A notice says when the form no longer matches the last assembly, and a separate notice says when the document has manual edits. Changing a value back removes the matching notice.
6. Copy or download the current document. Both actions stay disabled while the document is empty. They use the text in the document, including manual edits.
7. Export configuration saves the current form as `PROJECT_CONFIGURATION.json`. Import configuration reads that file back into the form. Import does not change the document until you assemble again.

Copy Markdown writes that text to the clipboard unchanged, including spaces, line endings, and any `{{placeholders}}`. A success message confirms it. If the browser clipboard API is missing or rejects the write, the page shows an error and leaves the text in the document so it can be selected manually. Copy works in a secure context such as `localhost`.

Download Markdown saves that same string. The first download in a browser tab is `PROJECT_REQUIREMENTS.md`, the next is `PROJECT_REQUIREMENTS (1).md`, and later downloads continue in order. The tab remembers the next number in session storage, including after a refresh. The file is built in the browser from a UTF-8 Blob and a temporary object URL, which is revoked after the download starts. The number advances only after the browser has been asked to start the download. Starting a download does not mean the file was saved. A name can still match a file left from an earlier browser session. If session storage is unavailable, numbering continues for the current page view and starts again when the page is opened again. There is no server download route. The assembler ends a generated document with one newline, and a download keeps the current text as shown.

Export configuration writes the current form, including an incomplete form, as `PROJECT_CONFIGURATION.json`. The file contains the format name, format version, the version of every template module, and the configuration. The browser builds it from a UTF-8 Blob. The name does not increment. Import configuration reads a JSON file of at most 256 KB. A valid file replaces the form and shows any validation errors. It leaves the current document in place, so a previously assembled document becomes stale until you assemble again. A file that is not valid JSON, is too large, uses a different format, or does not contain the required choices leaves the form unchanged and shows an error. If the saved module versions differ from the versions in this build, the form still loads and the page says that assembly uses the current templates. There is no server route for either action.

Reassemble replaces the document from the current form. If the document has manual edits that would be lost, the page asks you to keep or replace them. Keep edits, or Escape, leaves the document as it is. Restore generated draft is available only when the document differs from the last successful assembly. It asks before putting that assembly back. Restoring does not apply later form changes, so the stale notice can remain.

The browser may show its generic leave prompt while the document has manual edits. That prompt is best-effort and does not save the document.

## Optional AI analysis

Analyze requirements with AI reviews the current form. It does not run when you assemble a draft, and it does not need a document to exist. The first click in a page session asks before anything is sent. Cancel, or Escape, sends nothing. A later click in that page session sends the current form.

The request includes the project name, description, active requirements, and selected technology choices. In structured mode the preserved free-text fields are not sent. Template text, package manager, linter, test runner, Node version, coverage numbers, and stretch goals are not sent. User text is data for the model, not instructions. Findings stay on the page until you explicitly apply a proposed requirement change. Review decisions and clarification answers stay in the current page session. They are not written into `PROJECT_CONFIGURATION.json`. A saved answer keeps its exact text and stays associated with that analysis run and finding. Changing the form marks an existing analysis as not matching the current requirements, and a change cannot be applied from that analysis until you run it again. The answer stays available for review. It is not sent to the writing model again until you confirm that it still applies to the current requirements. That check compares a fingerprint of the requirements with the fingerprint stored for the answer. It is a consistency and staleness safeguard. It does not identify you and it is not an access-control mechanism. A response that belongs to an older request does not replace a newer analysis.

In structured mode you can propose one requirement change. The suggested action is reference only. You write the requirement text. The preview shows the identifier, source, status, exact text, and, for an acceptance criterion, the scope and linked requirements. If the structured requirements change after that preview, it is discarded and you preview again before anything is written. If you apply after that change, the panel says the change was not applied. A new item is a proposed user requirement and stays out of the Markdown document until you confirm it in the structured requirements editor. Updating a proposed item applies after the preview. Updating a confirmed item shows the current authoritative text and a suggested replacement. It does not change the confirmed text until you confirm that the authoritative requirement will change. The identifier and source stay the same. Running analysis again asks before it discards decisions and answers. Requirements already written into the form stay. Free-text mode does not apply a change and does not switch modes for you.

An empty result uses this sentence: "The AI analysis did not identify any issues. This does not guarantee the requirements are complete or correct."

## Optional AI writing

Draft requirements with AI asks the same provider to propose functional requirements, acceptance criteria, wording revisions, and unresolved questions. It does not run during assembly. The first external send in a page session, whether analysis or writing, uses the same confirmation. Cancel, or Escape, sends nothing. If analysis was already confirmed, writing does not ask again.

The writing request uses the same active requirements as analysis. Confirmed structured items, free-text requirements, the description, the selected technology, and clarification answers that still match those requirements are facts. Proposed items are visible so the draft does not repeat them. They are not facts. The model does not assign requirement identifiers. The application assigns `W-001` style suggestion ids after it accepts the response. A response with an unknown id, a duplicate, a revision that repeats the current text, or text over the limit is rejected as a whole.

A draft stays on the page. It is not written into the form or into `PROJECT_CONFIGURATION.json`. Nothing is confirmed automatically. In free-text mode the draft explains the existing Copy current text and Start with an empty list choices. Copy current text makes the exact business requirements one confirmed user requirement and, when the acceptance text is not blank, one confirmed project-wide user criterion. Start with an empty list creates no structured requirement. The original free-text fields stay exactly as they were. Switching mode does not send the draft to the model again, as long as the project name, description, free-text fields, selected technology, and included answers are unchanged. After that switch, each remaining suggestion can be previewed. A suggestion whose text already exists is not added. Accepting a suggestion uses the same preview and latest-configuration check as an analysis change. A new item is source AI and status proposed. It stays out of the Markdown document until you confirm it in the structured requirements editor. A revision of a confirmed requirement keeps that requirement's identifier and source, and it does not change the confirmed text until the second confirmation. Nested criteria stay with their parent suggestion. The functional requirement preview lists those criteria and says that applying the parent creates only that proposed requirement. Accepting the parent creates only the functional requirement. Each nested criterion then becomes its own suggestion, linked only to that new requirement, and still needs its own preview and acceptance. The panel names the new functional requirement and the new suggestion identifiers, and groups those suggestions under that requirement. Each criterion preview shows its scope and linked requirement. Dismissing the parent dismisses those nested criteria. If the linked requirement is later deleted, a still-pending criterion is not retargeted and is not made project-wide.

Unresolved questions have no add control. They never enter the assembled document.

The browser calls `POST /api/ai-write`. The server recomputes the analysis fingerprint and includes an answer only when the submitted fingerprint matches. A client flag cannot force an old answer into the model input. The review session is not stored on the server, so this check can bind an answer to the current configuration but cannot prove that the answer text came from the original analysis. Writing has its own limit of 10 requests per 10 minutes in the current process, separate from the analysis limit. The output budget is 6000 tokens. At the published rates above, using that full budget is about three cents of output. The shared timeout can reject a slow draft. You can run it again. The page does not call the writer while assembling.

The page route stays prerendered. The browser calls `POST /api/ai-review` and `POST /api/ai-write` on the Node server from `yarn dev` or `yarn start`. A static file host cannot serve those routes. Copy `.env.example` to `.env` in this directory and set the values you want:

```bash
AI_REVIEW_ENABLED=true
AI_PROVIDER=openai
AI_MODEL=gpt-5.4-mini
AI_API_KEY=your-key
AI_REQUEST_TIMEOUT_MS=30000
```

`AI_REVIEW_ENABLED` must be the exact string `true`. Any other value, including an omitted file, leaves analysis and writing off. The routes then return `unavailable`, and assembly, editing, import, export, copy, and download keep working. `AI_API_KEY` is read only on the server. Do not commit a real key. `.env` is gitignored; `.env.example` holds empty placeholders.

The model name comes from `AI_MODEL`. The example uses `gpt-5.4-mini`. Published standard rates at the time of implementation were $0.75 per million input tokens and $4.50 per million output tokens. A normal review is about one cent. Prices can change. The analysis request budget is 2000 output tokens. A response that exceeds a text limit or the token budget is rejected and is not truncated.

An enabled endpoint is not authenticated. Do not expose it on the public internet. Each server process allows 10 analysis requests and 10 writing requests per 10 minutes. Those limits are separate. They are only for local or private development. They reset when the process restarts, and they are not sufficient protection for a public deployment. This application does not add an authentication system. The writing fingerprint check is a consistency and staleness safeguard. It is not that authentication system.

## Current status (Stage 2B)

Implemented: project inputs, Fast/Project mode, application type, backend languages (Java, Python, TypeScript, JavaScript, Other) and, for a Web App, UI languages (TypeScript, JavaScript, Other) plus UI frameworks (Next.js and React + Vite, including routing, client state, and server data), per-language package manager, language version, test runner, and linter choices, Node.js runtime, one backend framework alongside the UI for a full-stack Web App, HTTP API inclusion, Swagger/OpenAPI and Postman (only with an HTTP API), optional testing/data/security modules, configurable coverage targets, Fast Mode architecture and complexity constraints, compatibility validation, deterministic assembly, an editable Markdown document, stale and edited notices, confirmed reassembly and restore, configuration JSON import and export, copy, and download.

Package manager choices are Yarn, npm, and pnpm for JavaScript and TypeScript (default Yarn), Maven and Gradle for Java (default Maven), and uv, Poetry, and pip for Python (default uv). Defaults also include TypeScript 7.0, Node.js 26, Vitest, ESLint plus Prettier, Java 17, JUnit 5, Spotless, Python 3.13, pytest, and Ruff. React + Vite defaults to React Router. Client state and server data default to None. Redux Toolkit, Zustand, React context, and TanStack Query are optional.

### Limitations

- The document updates from the form only when assembly succeeds. A failed attempt leaves the current document in place. Manual edits are not written back into the form.
- Copy uses the browser clipboard API. When that API is unavailable, the assembled text stays in the preview for manual selection.
- Download names are remembered only for the current browser tab. They can still match a file saved in an earlier session, and starting a download does not confirm that the file was saved.
- Templates are read at build time. Editing a template requires another build before `yarn start` serves it.
- Line and branch coverage are whole-number targets from 0 to 100. They are guidance in the generated document, not a test run.
- The form can check more than one backend language, but it still offers only one backend framework.
- Next.js and React + Vite can both be checked. Each keeps its own routing, client state, and server data choices. Forms and styling are not choices yet.
- JavaScript and TypeScript on the same side share package manager, Node.js version, test runner, and linter. UI and backend selections are separate packages. There is no monorepo or workspace choice.
- AI analysis and writing have no authentication. Do not enable them on a public server. The in-memory request limits are not public protection. The writing fingerprint check only detects a stale or mismatched answer. It does not identify the user.
- Review decisions, clarification answers, and writing drafts stay in the current page session. Reloading the page drops them. They are not part of `PROJECT_CONFIGURATION.json`.
- A change from an analysis can be applied only in structured mode, only while that analysis still matches the current requirements, and only after you preview it. A new item from analysis starts as a proposed user requirement. A new item from writing starts as a proposed AI requirement. Confirming it for the document is a separate action in the structured requirements editor. A confirmed item does not change until you confirm that its authoritative text will change.
- A host that only serves static files cannot answer `POST /api/ai-review` or `POST /api/ai-write`.
- The server does not store the review session, so it cannot prove that a submitted answer is the text saved from the original analysis. It can only check that the submitted fingerprint matches the current requirements.

### Deferred to later stages

- Stage 2C: further integration polish.
- Stage 4: Fast Mode presets, one-click reset, and demo polish.
