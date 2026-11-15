# Execution flow

Requirements Builder turns a form into one Markdown document. A user enters business requirements, chooses a mode and a technology stack, and selects Assemble Draft. The page then validates that configuration, chooses Markdown modules, and writes `PROJECT_REQUIREMENTS.md` content into an editable preview. Copy and download use the text currently in that preview.

Assembly is a synchronous, deterministic function of the current configuration and the template text loaded with the page. The same inputs always produce the same string. Nothing in that path calls an AI service, a database, or a network API. Configuration JSON import and export stay in the browser. Optional AI analysis is a separate `POST /api/ai-review` request, and optional AI writing is a separate `POST /api/ai-write` request. Neither is part of assembly, and the page route stays prerendered.

## Main path

```mermaid
flowchart TD
  build["yarn build renders Page"] --> load["loadTemplates reads each MODULES file"]
  load --> client["RequirementsBuilder stores config and an empty document"]
  client --> change["User edits config"]
  change --> kind{"Which control changed?"}
  kind -->|"Technology, HTTP API, or optional module"| norm["normalizeSelections replaces config"]
  kind -->|"Text, mode, or coverage"| plain["setConfig without normalization"]
  norm --> submit["User submits the form"]
  plain --> submit
  submit --> validate["validateConfig"]
  validate --> bad{"hasErrors"}
  bad -->|yes| focus["Clear pending, focus the first invalid field, leave the document"]
  bad -->|no| assemble["assembleRequirements"]
  assemble --> threw{"Function throws"}
  threw -->|yes| alert["Clear pending, show the error, leave the document"]
  threw -->|no| overwrite{"Snapshot exists, the textarea differs from it, and the new string differs from the textarea"}
  overwrite -->|yes| ask["Store a replace confirmation and wait"]
  overwrite -->|no| apply["applyAssembly writes markdown and the snapshot"]
  ask -->|Replace edits| apply
  ask -->|Keep edits or Escape| keep["Clear pending and leave the textarea and snapshot"]
  apply --> output["Copy or download the current markdown"]
```

Changing the form does not assemble a document. Assembly runs only when the form is submitted.

## 1. Entry point and template loading

[`app/page.tsx`](../app/page.tsx) exports `Page` and `ensureStatic = "navigation"`. `Page` is a Server Component. During its render it calls `loadTemplates()` and passes the result to `RequirementsBuilder` as the `templates` prop. `ensureStatic` makes the production build fail if this route stops being fully prerendered, because a dynamic route would need to read template files at request time.

[`lib/load-templates.ts`](../lib/load-templates.ts) `loadTemplates` is synchronous. It maps `MODULES` from [`lib/module-registry.ts`](../lib/module-registry.ts) and reads each `module.file` with `fs.readFileSync` from `TEMPLATES_DIR` (`templates/` under the process working directory). The return value is a `Templates` record: module id to UTF-8 file text. A missing file throws here, so `yarn build` fails before a page is emitted. After a successful build, `yarn start` serves the prerendered page and does not read `templates/` again. [`next.config.ts`](../next.config.ts) enables `cacheComponents` and `partialPrefetching`; those settings do not change the assembly function.

[`app/layout.tsx`](../app/layout.tsx) only supplies the document shell and the page title. It does not load templates or hold form state.

Template presence, registration, and placeholder rules are checked by [`tests/templates.test.ts`](../tests/templates.test.ts). The production build is the check that `Page` still prerenders.

## 2. Configuration and document state

[`components/requirements-builder.tsx`](../components/requirements-builder.tsx) `RequirementsBuilder` is a client component. It owns the working state:

| State | Set by | Meaning |
| --- | --- | --- |
| `config` | `useState(defaultConfig)` | The form. `defaultConfig` in [`lib/config.ts`](../lib/config.ts) starts in Fast Mode with empty required text. |
| `errors` | `handleSubmit` | The latest `ValidationErrors` map. Empty until a submit. |
| `assemblyError` | `handleSubmit` | Message from a thrown assembly, or `""`. |
| `markdown` | `applyAssembly`, the textarea, or restore | The preview string, including manual edits. |
| `assembled` | `applyAssembly` | Last successful snapshot: `{ config, markdown }`, or `null` before the first success. |
| `pending` | Reassemble or Restore | A confirmation that is shown only while it still matches the live form and textarea. |
| `copyStatus` | `copyMarkdown` | `"idle"`, `"copied"`, or `"failed"`. |
| `configFileNotice` | Import or a failed export | A status or alert about the configuration file, or `null`. |

Three refs are not rendered state. `copyGeneration` ignores a clipboard result that belongs to an older document. `keepEditsRef` receives focus when a confirmation opens. `downloadCount` is the in-memory download counter used when `sessionStorage` throws.

These values are derived during render and are not stored:

- `edited`: a snapshot exists and `markdown !== assembled.markdown` (exact string compare, no trim).
- `stale`: a snapshot exists and `configsMatch(config, assembled.config)` is false.
- `activePending`: `pending` only when `configsMatch(config, pending.config)` and `markdown === pending.markdown`. Otherwise the prompt is hidden, but `pending` itself stays until something clears it.
- `canRestore`: same as `edited`.

`configsMatch` in [`lib/config.ts`](../lib/config.ts) compares every text field, mode, technology choice, `exposesApi`, each `OPTIONAL_MODULES` flag, `coverage.enabled`, and both coverage percents with `Object.is` (so `NaN` matches `NaN`). [`tests/config.test.ts`](../tests/config.test.ts) covers that equality.

Text fields call `update`, which replaces one `config` property. Mode calls `update("mode", mode)`. Coverage calls `updateCoverage`. None of those three call `normalizeSelections`. The preview textarea calls `setMarkdown` and does not write the edit back into `config`. It is `readOnly` until `assembled !== null`, and its `onChange` returns immediately when there is no snapshot.

## 3. Technology selection and normalization

Application type, UI and backend language checkboxes, toolchain selects, UI framework checkboxes, runtime, backend framework, the HTTP API checkbox, and optional module checkboxes call `updateSelection`, `toggleLanguage`, `changeToolchain`, `toggleUiFramework`, `changeUiFramework`, or `updateModule`. Each builds the next `ProjectConfig` and passes it through `normalizeSelections` in [`lib/selection-rules.ts`](../lib/selection-rules.ts) before `setConfig`. Normalization is synchronous and does not touch the document.

`normalizeSelections` returns a new config in this order:

1. `exposesApi` becomes `FIXED_API_BY_APP_TYPE[appType]` when that app type has a fixed value. REST API is always true. CLI / Library is always false. Other app types keep the current boolean.
2. `backendLanguages` is coerced to the backend catalog: unknown languages are dropped, unsupported option values become that language's default, duplicates collapse, and the list is sorted Java, Python, TypeScript, JavaScript, Other. When both TypeScript and JavaScript are present, package manager, Node.js version, test runner, and linter are copied from the language that just changed, or from TypeScript when no language was named. `uiLanguages` gets the same treatment for TypeScript, JavaScript, and Other, and is cleared unless the app type is Web App.
3. If `runtime` is not in `allowedRuntimes`, it becomes `"none"`. Node.js is offered only when backend TypeScript or JavaScript is checked. A UI language does not offer the runtime.
4. If `backendFramework` is not in `allowedBackendFrameworks`, it becomes `"none"`. A framework is offered only when `exposesApi` is true, and then only Spring Boot when backend Java is checked, FastAPI when backend Python is checked, or the Node.js API module for the Node.js runtime. The form still stores one framework even when more than one language is checked.
5. `uiFrameworks` is cleared unless the app type is Web App. On a Web App, unknown frameworks are dropped, unsupported option values become that framework's default, duplicates collapse, and the list is sorted Next.js, then React + Vite. Checking a framework does not clear backend languages or the backend framework. Leaving Web App clears the UI frameworks and, when the new app type forbids an HTTP API, also clears the backend framework.
6. If `exposesApi` is false, the `openapi` and `postman` flags are set to false.

The render uses the same helpers to decide what is visible. `isApiChoiceFixed` replaces the HTTP API checkbox with a hint. The backend language fieldset is always shown. Checking a language reveals that language's toolchain selects, already filled with defaults. Java shows JUnit 5 as text rather than a select. The UI framework and UI language fieldsets render only for `appType === "web-app"`. Checking Next.js or React + Vite reveals that framework's options. Next.js uses the App Router and offers client state and server data. React + Vite also offers routing. The two frameworks do not share those choices. A Web App can keep backend languages and, when it includes an HTTP API, a backend framework. The runtime and backend selects render only when more than one option exists. The API documentation fieldset renders only when `exposesApi` is true. JavaScript and TypeScript on the same side share one package manifest, so those four shared selects stay in sync. The two sides do not sync. Checking the second of those languages adopts the toolchain already chosen for the first.

[`tests/selection-rules.test.ts`](../tests/selection-rules.test.ts) checks the allowed sets and each reset. [`tests/requirements-builder.test.tsx`](../tests/requirements-builder.test.tsx) (`conditional controls`, `compatibility resets`) checks the same behavior through the form.

## 4. Assemble Draft and Reassemble

The submit button calls `handleSubmit`. The label is Assemble Draft while `assembled === null` and Reassemble after a snapshot exists. Both labels use the same function. `handleSubmit` is synchronous except for the React state updates it schedules.

1. `preventDefault` keeps the browser from navigating.
2. `validateConfig(config)` runs. `setErrors` stores the result and `setAssemblyError("")` clears an older assembly alert.
3. If `hasErrors` is true, the function clears `pending`, focuses the first invalid control, and returns. `markdown` and `assembled` stay as they are.
4. Otherwise `assembleRequirements(config, templates)` runs inside `try/catch`.
5. On throw, `pending` is cleared, `assemblyError` becomes the error message, and the function returns. The document stays as it is.
6. A replace confirmation is stored only when all three are true: a snapshot exists, `markdown !== assembled.markdown`, and the newly assembled string is also different from `markdown`. `pending` becomes `{ kind: "replace", config, markdown, next }`.
7. Every other success calls `applyAssembly(config, next)` immediately. That includes the first assembly, a reassembly with no manual edits, and a reassembly whose new string already equals the textarea.

`applyAssembly` sets `markdown`, replaces `assembled` with `{ config: nextConfig, markdown: nextMarkdown }`, clears `pending`, increments `copyGeneration`, and sets `copyStatus` to `"idle"`.

UI coverage is the `assembly` and `editable document and stale preview` blocks in [`tests/requirements-builder.test.tsx`](../tests/requirements-builder.test.tsx). Character-for-character output is [`tests/golden.test.ts`](../tests/golden.test.ts) and [`tests/assembly.test.ts`](../tests/assembly.test.ts).

## 5. Validation and focus

[`lib/validate-config.ts`](../lib/validate-config.ts) `validateConfig` is synchronous and pure. It checks, in order:

- Required project name and business requirements. `trim` decides that a value is blank, so whitespace-only text fails. The stored text is not rewritten.
- Maximum lengths from `INPUT_LIMITS`: project name 120, description 1000, and the three long fields 20000. The inputs also set `maxLength`, so a person typing in the form cannot pass those limits. The function still enforces them for a config built in code.
- Fixed HTTP API mismatches, UI languages on a project that is not a Web App, a toolchain value outside the catalog, a Web App that has a UI framework and no UI language, a Node.js runtime without backend TypeScript or JavaScript, a backend framework that `allowedBackendFrameworks` rejects, UI frameworks on a project that is not a Web App, a UI framework option outside the catalog, API module flags while `exposesApi` is false, and, when coverage is enabled, line and branch targets that are not whole numbers from 0 to 100. Disabled coverage does not validate the numbers. Line and branch errors are separate keys. UI and backend toolchain errors are separate keys. A missing UI language is an error only when at least one UI framework is selected. Other satisfies that check and still produces its open question. A non-Web-App project with no UI language remains valid.

`hasErrors` is `Object.keys(errors).length > 0`.

On failure, `ERROR_FOCUS_ORDER` picks the first key that has a message: project name, description, business requirements, acceptance criteria, stretch goals, HTTP API, backend languages, runtime, backend framework, UI frameworks, UI languages, API modules, line target, branch target. `focusInvalid` focuses `field-<name>` for most keys. For `uiLanguages` it focuses the first checkbox inside `#field-uiLanguages`, which is the UI TypeScript checkbox and is in the tab order. The UI languages fieldset and every language checkbox in it receive `aria-invalid` and `aria-describedby` pointing at `field-uiLanguages-error`, so the message belongs to the group and to the focused control. Other language and API module targets are fieldsets (`tabIndex={-1}`). If a key is invalid but its control is not rendered, the focus call does nothing. The form normally avoids that by normalizing selections before submit. Normalization does not add a UI language when a framework is present and no language was saved. Checking the first UI framework in the form selects TypeScript when no UI language is checked. Import keeps a saved framework without a language and shows the validation error.

[`tests/validation.test.ts`](../tests/validation.test.ts) covers accepted configs, required fields, lengths, incompatible selections, and separate coverage errors. The UI tests `reports missing required fields` and `focuses the line target when both coverage targets are invalid` cover focus.

### Advisories

[`lib/advisories.ts`](../lib/advisories.ts) `evaluateAdvisories` is a separate pure function. It does not call `validateConfig`, does not change `ProjectConfig`, and does not affect `assembleRequirements`. The form calls it on every render.

The one rule recommends integration tests when a Web App has a UI (`hasUserInterface`) and an HTTP backend (`exposesApi` plus `hasBackendSelection`) while `modules.integrationTests` is false. A UI is a selected UI framework or UI language. A backend selection is a backend language or a backend framework. The recommendation is omitted for every other combination, including a REST API, a Web App with no HTTP API, and the same full-stack setup after integration tests are checked. Redux Toolkit and the wording of the business requirements do not create advisories.

The Integration tests checkbox shows the recommendation directly underneath, prefixed `Recommendation:`. The checkbox `aria-describedby` points at `advisory-integration-tests-http-fullstack`. The note is not an alert and does not use `aria-invalid`. Checking the box, clearing the HTTP API, removing the UI or backend, or leaving Web App removes the note on the next render. Assembly is not required. The checkbox is the only control, and the advisory never changes it. An unresolved advisory still allows Assemble Draft, copy, and download. The sentence is not written into the Markdown document.

## 6. Module selection

`assembleRequirements` calls `resolveModules(config)`, which returns `MODULES.filter((module) => module.appliesTo(config))`. Array order is the order of module blocks inside a section. `resolveModules` does not sort or deduplicate.

Each `RequirementModule` has an id, title, version, category, `section`, `file`, and `appliesTo`. The predicates are the selection rule:

- Always: `business-core`, `engineering-core`, `unit-tests`, `local-build-run`, `definition-of-done`.
- Mode: `fast-delivery` or `project-delivery`, plus `project-extended` only in Project Mode.
- Language modules are one per side: `typescript-ui`, `javascript-ui`, `java-backend`, `python-backend`, `typescript-backend`, and `javascript-backend`. Each applies when that language is checked on that side. UI and backend copies share a template file and receive different placeholder values. Runtime and backend framework still match the corresponding config field. `nextjs-react` applies when Next.js is checked, and `react-vite` applies when React + Vite is checked. Both can apply in one document.
- `agent-tool-calling` matches an AI Agent app type.
- `golden-dataset`, `persistence-optional`, `integration-tests`, and `security-baseline` match their module flags. Golden dataset and security start enabled in `defaultConfig`.
- `coverage-targets` matches `coverage.enabled`.
- `openapi-swagger` and `postman` match `exposesApi` and their flags.

[`tests/assembly.test.ts`](../tests/assembly.test.ts) (`technology module selection`) and the golden fixtures check which modules appear for representative stacks.

## 7. Markdown construction and placeholders

`assembleRequirements(config, templates)` is synchronous and deterministic. It does not read the clock, randomize, or mutate `config` or `templates`.

`placeholderValues` builds the coverage percents, the backend Node.js version (or `LTS` when no backend JavaScript or TypeScript toolchain exists), and the Spring Boot and FastAPI start commands from the backend toolchain. A language module then merges the sentences and commands for that side's toolchain, so one language's install command is not applied to another language. The keys are `TEMPLATE_PLACEHOLDERS` in [`lib/constants.ts`](../lib/constants.ts). The record is built even when a module that uses a key is omitted.

The function starts `parts` with `# Project Requirements`. It then walks `SECTIONS` from [`lib/constants.ts`](../lib/constants.ts). For each section it concatenates `userBlocks(...)` and one `moduleBlock` for every resolved module whose `section` matches. A section with no blocks is omitted. The parts are joined with a blank line, and the result ends with one newline.

`userBlocks` inserts user-owned text. It never calls `fillPlaceholders`:

- Metadata: project name, mode, the technology summary from `technologySummary`, and a line stating that assembly was deterministic. A non-blank description is added under its own heading.
- Functional requirements and acceptance criteria: in free-text mode, or when `requirementsContent` is absent, the user string under the heading `User-provided requirements`, or a fixed missing-text sentence when the string is blank. In structured mode, the headings are `Confirmed functional requirements` and `Confirmed acceptance criteria`. The document contains confirmed `FR-###` and `AC-###` entries in ID order. Project-wide criteria say they apply to the whole project. Requirement-specific criteria list their functional requirement IDs. Proposed items are not emitted. The original free-text fields are kept and are not repeated in the document. A confirmed AI item includes the words `approved AI proposal`. Project-wide and proposed criteria do not cover a specific functional requirement. Uncovered-requirement questions are added only when at least one confirmed requirement-specific criterion exists, and only for confirmed functional requirements that none of those criteria reference. When no confirmed acceptance criterion exists, the existing acceptance open question is used. Fast Mode does not block on that gap.
- Assumptions: open questions for a blank business requirement, blank acceptance criteria, no backend language, a backend Other choice, a Web App with no UI language, a UI Other choice, different Node.js versions on the two sides, or a Web App with no UI framework. No questions means the section is omitted.
- Implementation: the stretch-goal string, or a fixed sentence when it is blank. Delivery modules for the selected mode are appended in the same section.
- Included modules: one bullet per resolved module, with id, version, and title.

A non-blank user string is copied as entered, including Markdown, whitespace, and a literal `{{placeholder}}`. Blank detection uses `trim` only to choose the fallback sentence.

`moduleBlock` reads `templates[module.id]`. A missing entry throws `Missing template for module "<id>".` Otherwise `fillPlaceholders` runs on that template only. One `String.replace` pass replaces every `{{...}}` match. A key that is not in the values object throws `Template for module "<id>" contains an unresolved placeholder {{key}}.` A substituted value is not scanned again. The filled template is passed through `trimEnd` and placed under a `### Module` heading that includes the module id and version. User blocks are not passed through `trimEnd`.

[`tests/assembly.test.ts`](../tests/assembly.test.ts) covers section order, verbatim user text, missing optional text, both throw paths, and coverage substitution. [`tests/fixtures/expected/verbatim-user-content-fast.md`](../tests/fixtures/expected/verbatim-user-content-fast.md) is the approved verbatim document.

## 8. Snapshots, edits, stale state, and confirmation

`assembled` is the last document the form successfully produced, together with the config that produced it. `markdown` is what the textarea shows now. They diverge only through typing, or through restore.

`edited` and `stale` are independent. A config change sets `stale` and leaves `edited` false. Typing sets `edited` and leaves `stale` false. Both can be true. Changing a value back clears the matching flag because both are derived, not latched. Notices render only while the matching flag is true.

The confirmation region is outside the form, and its buttons are `type="button"`. While `activePending` is set, an effect focuses Keep edits. Escape or Keep edits calls `setPending(null)`. That leaves `markdown` and `assembled` unchanged.

Replace edits calls `confirmPending`, which calls `applyAssembly(activePending.config, activePending.next)` when `next` is present. The snapshot config is the object captured when the prompt was created. The prompt is visible only while `configsMatch` still says that object matches the form, so the stored config and the live form describe the same selections.

Restore generated draft is disabled unless `canRestore`. Its click stores `{ kind: "restore", config, markdown }` and no `next` string. Confirming sets `markdown` to `assembled.markdown`, clears `pending`, bumps `copyGeneration`, and clears copy status. It does not replace `assembled`, so a stale form stays stale and the restored text is the previous assembly.

A `beforeunload` listener exists only while `edited` is true. It calls `preventDefault` and sets `returnValue` to `""`, which asks the browser for its generic leave prompt. Whether that prompt appears is browser-dependent. The listener does not save the document.

The editable-document tests in [`tests/requirements-builder.test.tsx`](../tests/requirements-builder.test.tsx) cover both notices, immediate reassembly, the prompt, Keep edits, Escape, confirmed replacement, a prompt that disappears when the form or textarea changes, restore while stale, and the leave listener.

## Cancellation: keep manual edits

1. A successful assembly has stored a snapshot, and the user has typed into the textarea. `edited` is true. `pending` is null.
2. The user changes the form or leaves it, then submits Reassemble. Validation passes and `assembleRequirements` returns a string that differs from the textarea.
3. `handleSubmit` does not call `applyAssembly`. It stores a replace `pending`. The textarea and snapshot are unchanged, and the confirmation is shown because the live config and markdown still match that `pending`.
4. The user selects Keep edits, or presses Escape. `setPending(null)` runs. `markdown` and `assembled` are not written. The edited notice remains, and a stale notice remains if the form still differs from the snapshot.
5. Copy and download still read the edited textarea.

If the user instead changes the project name or the textarea while the prompt is open, `activePending` becomes null and the prompt unmounts. The stored `pending` can become visible again if both values return to the captured ones. Confirmed replacement is the other exit: `applyAssembly` then overwrites the textarea and the snapshot together.

## 9. Copy and download

Both buttons are disabled when `markdown.length === 0`. Both read the current textarea, including edits, whether or not the form is stale. Neither one assembles again.

`copyMarkdown` is asynchronous and browser-dependent. It captures `markdown` and `copyGeneration`, then awaits `navigator.clipboard.writeText`. A missing clipboard API throws inside the function. A rejected write is caught. Success sets `copyStatus` to `"copied"` and failure sets `"failed"`, but only if `copyGeneration` is still the captured value. `applyAssembly`, a textarea edit, and a confirmed restore increment that ref so a late clipboard result cannot describe a document that has since changed.

`downloadMarkdown` starts synchronously in the browser. It does not look at the Downloads folder and it does not call a server route.

1. `loadDownloadCount` reads `sessionStorage` at `DOWNLOAD_COUNT_STORAGE_KEY` (`requirements-builder.download-count`) and `parseStoredDownloadCount` turns that string into a non-negative integer. `null`, blank, negative, and non-integer values become 0. If reading storage throws, the function uses `downloadCount.current` instead.
2. `downloadFilename(count)` in [`lib/download-filename.ts`](../lib/download-filename.ts) returns `PROJECT_REQUIREMENTS.md` for a count below 1, and `PROJECT_REQUIREMENTS (n).md` for 1, 2, and so on. This formatting is pure and synchronous.
3. The current markdown string becomes a `Blob` of type `text/markdown;charset=utf-8`. `URL.createObjectURL` supplies a temporary URL, and a detached anchor with that `download` name is clicked.
4. If `click` throws, the anchor is removed, the object URL is revoked immediately, and the count is not changed.
5. If `click` returns, the anchor is removed, `setTimeout(..., 0)` revokes the object URL on the next turn, and `storeDownloadCount(count + 1)` updates the ref and tries `sessionStorage.setItem`. A `setItem` failure leaves the ref advanced for this page view.

Starting the download does not mean the user finished saving the file. A name can still match a file saved in an earlier browser session. When storage is unavailable, numbering continues only until the page is loaded again.

The same tab also keeps a draft at `requirements-builder.draft`. That entry is this tab's session storage. Closing the tab removes it, and it is not stored on another device. A request that was still running is not sent again. `RequirementsBuilder` is the only writer. It restores the configuration, Markdown, assembled snapshot, and analysis review in the render that follows the storage read, and it does not call `assembleRequirements` or either AI route while doing that. The restored analysis is copied into component state. It is not passed through `applyPayload` or `emptyReviewSession`. Its request id is reserved, so the next analysis click uses a later id. Edited and stale notices are still derived. A restored analysis fingerprint is not rewritten; a mismatch stays visible and blocks requirement changes. Clarification text and `answerCheckedFingerprint` are restored, and `clarificationAnswersForWriting` decides whether a checked answer is authorized for the current requirements. An applied marker stays on that finding, so the same finding is not applied again. Saves are debounced. A failed or partial save is shown once beside the configuration, not on every keystroke. A corrupt analysis value is dropped and the configuration and Markdown remain. Start new project uses the same inline confirmation as the other destructive actions. Cancel and Escape change nothing. Confirm calls the persistence reset, clears the form, document, analysis review, and writing session, and ignores a later callback from the previous generation. Only a reset result of `storage: "cleared"` means the draft key was removed. A failed deletion leaves the key in place and shows an alert. The download key is not removed. The writing session is copied into component state. It is not passed through the writing response handler. Its request id is reserved. Suggestion text, nested criterion text, dismissals, accepted ids, and included clarifications are restored. An open preview, a pending apply, and a replacement confirmation are not. Source freshness is derived again, so a changed requirement or authorized answer leaves the suggestions visible and blocks preview. A corrupt writing value is dropped, and the configuration, Markdown, and analysis remain.

[`tests/download-filename.test.ts`](../tests/download-filename.test.ts) covers the pure filename and parser. The copy and download tests in [`tests/requirements-builder.test.tsx`](../tests/requirements-builder.test.tsx) cover exact blob text, the first name, later names, a remount that keeps the stored count, a click that does not advance the count, and the memory fallback.

## 10. Failure paths and tests

| What happens | State that changes | What stays | Test |
| --- | --- | --- | --- |
| Required field or coverage target is invalid | `errors` is set, `pending` is cleared, focus moves | `markdown`, `assembled` | [`tests/validation.test.ts`](../tests/validation.test.ts); UI validation tests |
| `assembleRequirements` throws because a resolved module has no template text | `pending` cleared, `assemblyError` set | `markdown`, `assembled` | `throws when a resolved module has no template` in [`tests/assembly.test.ts`](../tests/assembly.test.ts); `shows an alert` in the UI tests |
| A template contains an unknown `{{key}}` | Same throw path as a missing template | User text is not rewritten | `throws when a template contains an unknown placeholder` |
| Reassemble would discard manual edits and the user cancels | `pending` cleared | Textarea and snapshot | `asks before replacing manual edits` and `cancels replacement when Escape is pressed` |
| Assembly is attempted with an invalid form after an edit | Validation failure path | Edited textarea | `blocks an invalid reassembly and keeps the edited document` |
| Assembly throws after an edit | Assembly error path | Edited textarea | `keeps manual edits when assembly fails` |
| Clipboard API is missing or `writeText` rejects | `copyStatus` becomes `"failed"` | Textarea | `reports a clipboard failure` and `reports a failure when the clipboard API is missing` |
| Anchor `click` throws | Object URL revoked immediately | Download count | `leaves the counter unchanged when the download does not start` |
| Configuration file is unreadable, too large, or the wrong shape | `configFileNotice` alert | Form, document, and snapshot | `leaves the form unchanged when the file cannot be imported` |
| Configuration file is valid | Form replaced, validation errors refreshed, `pending` and `assemblyError` cleared | Current document and snapshot | `imports a configuration, leaves the current document, and reassembles the same draft` |
| `sessionStorage` throws | Ref holds the count for this page view | Download still starts | `keeps numbering in memory when session storage is unavailable` |
| A template file is missing at build time | `loadTemplates` throws while `Page` renders | No prerendered page | [`tests/templates.test.ts`](../tests/templates.test.ts) checks that every registered file exists; `yarn build` renders `Page` |

A failed submit clears `assemblyError` at the start, so an old assembly alert does not remain beside a new validation error. A later successful `applyAssembly` also leaves that message empty because the submit already cleared it. A successful import also clears `assemblyError` and `pending`.

## 11. Configuration import and export

Export and import use the form, not the Markdown document. Both run in the browser. There is no server route.

`serializeConfig` in [`lib/config-file.ts`](../lib/config-file.ts) first runs `normalizeSelections`, then writes a pretty-printed JSON file ending in one newline. The file has four fields: `format` (`requirements-builder-config`), `formatVersion` (`1`), `moduleVersions` from `moduleVersionMap()` in [`lib/module-registry.ts`](../lib/module-registry.ts), and `config`. Module version keys are sorted. The download name is always `PROJECT_CONFIGURATION.json`. `downloadBlob` uses the same object-URL sequence as Markdown download. If the anchor click throws, the page shows an alert and the form stays as it is.

`parseConfigText` rejects text larger than 256 KB, text that is not JSON, a different format or format version, and a configuration that is missing a required field or uses the wrong type. It copies known fields only. `normalizeSelections` then drops choices the form cannot keep, such as UI languages on a non-Web-App project or an unsupported package manager. `moduleVersionsDiffer` compares the saved version map with the current registry. A difference does not block the import.

On success, the page replaces `config`, runs `validateConfig`, clears `pending` and `assemblyError`, and leaves `markdown` and `assembled` untouched. Field errors from the imported form are shown immediately. On failure, the form and the document stay as they were. The file input is cleared after every attempt so the same file can be chosen again.

[`tests/config-file.test.ts`](../tests/config-file.test.ts) checks the round trip for every golden fixture, verbatim user text, repaired choices, a library-version warning, and rejected files. The UI tests cover export, import without changing the current document, the library warning, a rejected file, and a failed export.

## 12. Optional AI analysis

The analysis panel is rendered after the configuration form. It receives the current configuration. It updates that configuration only when you explicitly apply a previewed requirement change. The update runs against the latest structured requirements inside the form state update. If those requirements changed after the preview, the update is discarded, the newer requirements stay, and the panel says the change was not applied. A new preview is required before another attempt. The finding is marked applied only when the saved requirements match that preview. A review decision, a clarification answer, or a dismissed finding does not change the configuration.

The first click opens an in-page confirmation. Nothing is sent before that confirmation. Escape or Cancel closes it.

The browser posts `{ config }` to `/api/ai-review`. The route reads the body, rejects a body over 64 KB, and returns `unavailable` when `AI_REVIEW_ENABLED` is not exactly `true`, the provider is not `openai`, or the model or key is missing. When analysis is enabled, the route allows 10 requests per 10 minutes in the current process. That limit is for local or private use. It is not authentication and it is not protection for a public deployment.

`handleAnalysisPost` rebuilds the model input with `buildAnalysisInput`. The model sees that JSON as untrusted data. The OpenAI adapter sends one Responses API request with `text.format.type` set to `json_schema`, `strict: true`, and `max_output_tokens` set to 2000. It retries once, and only for HTTP 429 or 503. Timeout and authentication failures are not retried. The adapter does not log the key, the requirements, or the provider body.

The application parser assigns `F-001` style ids and rejects a response that is missing a field, has an extra field, names an unknown requirement id, or exceeds a text limit. It does not truncate. An incomplete provider response, including one stopped for the output-token budget, is `invalid-response`.

The panel stores the returned fingerprint and compares it with the fingerprint of the latest configuration. A mismatch shows that the analysis does not match the current requirements. The findings stay visible, and they are not described as current. Applying a requirement change is disabled until you run analysis again. There is no way to apply a change from a stale analysis. A response for an older request is ignored once a newer request has started or a newer result has been applied. Editing the form does not send a new request and does not clear the findings.

Each finding can be marked addressed, dismissed, or deferred. Those decisions do not create, edit, or confirm a requirement. A finding with a question has an answer field. Saving an answer keeps the exact text, including spaces and line breaks, and associates it with that analysis request and finding. `clarificationAnswersForWriting` in [`lib/ai/review.ts`](../lib/ai/review.ts) returns those answers for the writing step in the same page session. Saving an answer while the analysis still matches the current requirements records a checked fingerprint. Editing the requirements clears that check without changing the answer, the question, or the analysis-run fingerprint. The page keeps the answer for review. Use this answer for the current requirements sets the checked fingerprint again. That fingerprint is a consistency and staleness safeguard. It does not identify the user and it is not an access-control mechanism. The review session is component state. It is not part of `ProjectConfig`, and export does not write it into `PROJECT_CONFIGURATION.json`. Refreshing this tab restores those decisions and answers from the draft. Two analyses can both show `F-001`. The records stay separate because the key includes the request id.

If the session has a decision, an answer, or an applied change, Analyze again asks before discarding that session. Cancel or Escape keeps it. The session is replaced only when a new result is stored, so a failed rerun keeps the old records. Requirements already written into the form stay. When the session has no review records, Analyze again replaces the findings immediately.

A requirement change is available only in structured mode and only while the analysis fingerprint matches. Free-text mode leaves the control disabled and does not switch modes. The suggested action is reference text. It is not copied into the requirement field, and it is not used to choose `source`. You write the text, choose create or update, and preview it. The preview lists the identifier, source, status, exact text, and, for an acceptance criterion, the scope and linked functional requirements. The preview is tied to the structured requirements used to create it. If those requirements change, the preview is discarded and has to be created again. Applying the change checks that same state again, so a preview cannot write a different identifier or counter than the one it showed. A new functional requirement or acceptance criterion uses the next identifier, `source: "user"`, and `status: "proposed"`. An update changes text only. The identifier, source, status, and criterion links stay. Previewing a confirmed item shows the current authoritative text and does not write. A second inline confirmation states that the authoritative requirement will change, and only that confirmation writes the new text. Escape or Cancel closes that confirmation and returns focus to the control that opened it. These confirmations are inline regions, not modal dialogs. The identifier and source stay the same. A proposed item stays out of the Markdown document until you set its status to confirmed in the structured editor. That confirmation does not change `source`.

No findings shows: "The AI analysis did not identify any issues. This does not guarantee the requirements are complete or correct."

[`tests/ai-analysis.test.ts`](../tests/ai-analysis.test.ts) covers the input, the parser, the fake provider, and the route. [`tests/ai-review.test.ts`](../tests/ai-review.test.ts) covers review records, exact answers, provenance, confirmed replacement, and stale rejection. The AI cases in [`tests/requirements-builder.test.tsx`](../tests/requirements-builder.test.tsx) mock `fetch` and check decisions, answers, explicit changes, and that assembly does not include an unconfirmed item.

## 13. Optional AI writing

The writing panel is rendered with the analysis panel. Draft requirements with AI sends one request. The first external send in a page session, analysis or writing, uses the same inline confirmation. If analysis was already confirmed, writing does not ask again. Assembly does not call the writer.

The browser posts `{ config, clarifications }` to `/api/ai-write`. The body limit is the same 64 KB. The route uses the same provider switch, model, key, and timeout as analysis. It has a separate process-local bucket of 10 requests per 10 minutes. The adapter sends one Responses API request with the writing schema, `strict: true`, and `max_output_tokens` set to 6000. It retries once, and only for HTTP 429 or 503. The user message is the writing input JSON. The system prompt tells the model that confirmed items, free-text requirements, the description, selected technology, and included clarification answers are facts, and that proposed items are not.

`selectModelClarifications` recomputes `analysisFingerprint(buildAnalysisInput(config))` and includes a submitted answer only when its `analysisFingerprint` equals that value. A client `current` flag is ignored. A mismatched or stale answer is omitted. A malformed clarification record rejects the request. The server does not store the review session, so the check can bind an answer to this configuration but cannot prove the answer text came from the original analysis. The page sends the current fingerprint only for an answer the user has explicitly checked. Otherwise it sends the original run fingerprint, and the server excludes that answer.

`parseWritingResult` rejects the whole response for an unknown id, a duplicate target, a revision that repeats the current text, an exact-text duplicate, a bad criterion link, or an over-limit field. It assigns `W-001` style ids. Nested criteria do not receive ids in that response. Free-text input has no known requirement ids, so a response that names a target is rejected.

The writing session is restored from the tab draft. Accepting a suggestion still calls `prepareRequirementChange` and then `onApplyPrepared`, which runs `commitPreparedRequirementChange` against the latest configuration. Refresh does not restore a prepared suggestion or apply one. A rejected commit shows the same not-applied message as analysis and does not mark the suggestion accepted. A new functional requirement or acceptance criterion uses `source: "ai"` and `status: "proposed"`. A revision uses the existing update path, so the identifier, source, and status stay. A confirmed revision still needs the second inline confirmation. The deterministic assembler is unchanged. Only confirmed items appear in the Markdown.

A free-text draft can survive Copy current text or Start with an empty list without another model call. The source fingerprint covers the project name, description, both free-text fields, the selected technology, and the included answers. It does not cover document mode or the structured lists, so the explicit mode switch does not by itself make the draft stale. Editing one of those source facts does. After the switch, the copied requirement is authoritative user text. Suggestions stay proposed. An exact match of an existing item cannot be accepted. A structured-mode draft uses a source fingerprint of the structured items instead, so an edit to the inactive free-text fields does not stale it.

The functional requirement preview lists its nested criteria and states that applying the parent creates only the proposed functional requirement. Accepting a new functional requirement detaches its nested criteria into separate suggestions linked only to the returned functional requirement id. The panel then names that functional requirement and the new suggestion identifiers, and groups those suggestions under it. Each criterion preview shows its scope and linked requirement. Each one still needs its own preview and acceptance. Dismissing the parent leaves those criteria unpromoted. If that functional requirement is deleted before a nested criterion is accepted, the pending criterion is refused. It is not retargeted and it is not made project-wide. A criterion that has already been stored follows the existing deletion rule in the structured editor.

[`tests/ai-writing.test.ts`](../tests/ai-writing.test.ts) covers the writing input, the forged-flag exclusion, the parser, nested-criterion lifecycle, and the route. The writing cases in [`tests/requirements-builder.test.tsx`](../tests/requirements-builder.test.tsx) cover the mode switch, exact free-text preservation, duplicate refusal, a stale source, answer revalidation, confirmed replacement, keyboard cancellation, and a parent-side rejection after a locally valid preview.
