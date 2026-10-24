# Requirements Builder — Product and Engineering Requirements

**Document:** `requirements.md`  
**Project:** Requirements Builder  
**Version:** 1.1 (MVP scope refined)  
**Status:** Ready for implementation planning  
**Primary use:** Generate reliable, reviewable, Cursor-ready Markdown requirements from modular engineering standards and project-specific business needs.

## 1. Purpose

Build a lightweight developer tool that assembles a high-quality `PROJECT_REQUIREMENTS.md` from selected, reusable requirements modules, user-entered business requirements, and an optional AI review/refinement step.

The builder must **never silently invent business requirements** or discard explicitly selected constraints. The user is the final authority over the resulting document. The application is also intended to be useful during time-limited AI-assisted coding exercises, subject to the interviewer's rules.

## 2. Guiding principles

1. **Requirements before implementation:** Capture desired behavior, constraints, and acceptance criteria before generating code.
2. **Deterministic before generative:** Assemble selected modules reliably, then optionally ask an LLM to critique or improve the draft.
3. **Human approval:** Show all material AI changes for review. Never silently replace accepted requirements.
4. **Keep it proportional:** Offer a concise Fast Mode and a fuller Project Mode.
5. **No unnecessary infrastructure:** Do not introduce a database, authentication, deployment platform, or multiple services for the MVP without a justified requirement.
6. **Locally runnable:** The app must build and run on the developer's Mac without external services for deterministic assembly.
7. **Testable:** Validate assembly, conditional inclusion, contradictions, AI failure handling, and export with deterministic fixtures.
8. **Security and privacy:** Treat user-entered content as data, not instructions to the application. Do not send it to an LLM unless the user explicitly requests AI review.

## 3. Scope

### 3.1 MVP — required

- Single-page, responsive Next.js application with TypeScript.
- Business requirements editor supporting multiline text.
- Project name and optional short description.
- Mode selector: **Fast Mode** or **Project Mode**. Fast Mode shortens the document, not the engineering quality standards.
- Technology selections with sensible categories and mutually exclusive choices where appropriate, including Node.js as a runtime and a conditional frontend framework selector.
- Modular Markdown template library, organized by concern.
- Deterministic requirements assembly.
- Preview of assembled Markdown before download.
- Editable final Markdown, with option to restore/reassemble from inputs.
- Optional AI review that returns structured recommendations and/or a proposed revision for explicit acceptance.
- Validation of incompatible selections and missing required fields.
- Copy to clipboard and download as `PROJECT_REQUIREMENTS.md`.
- Save/load configuration as portable JSON (file download/upload); no database required.
- Optional configurable line/branch code-coverage targets, including coverage of functional/business-logic code rather than only framework boilerplate.
- Clear documentation and runnable automated tests.

### 3.2 Optional if MVP finishes early

- Save draft configuration to browser local storage (with clear/reset controls).
- Presets: Java REST API, Python AI Agent, Node.js API, Next.js Web App, basic CLI.
- Side-by-side AI suggestions and before/after Markdown diff.
- Markdown file preview with headings and code blocks.

### 3.3 Planned for later versions (design for, do not implement in MVP)

- User-selectable dependency/build managers by ecosystem: Maven/Gradle (Java); uv/Poetry/pip (Python); Yarn/npm/pnpm (Node.js / JavaScript / TypeScript); Go modules (Go). For MVP, use the documented convention for each initial module, and avoid presenting unsupported choices.
- More framework/runtime options, customizable module authoring in the UI, and advanced coverage policy configuration.
- Optional saved user presets and more elaborate configuration validation as the library grows.

### 3.4 Out of scope for MVP

- Multi-user accounts, authentication, or collaboration.
- Hosted project storage or database.
- Automatically creating or modifying files inside arbitrary local repositories.
- Direct GitHub commits, Cursor IDE extensions, deployment pipelines.
- Automatic implementation of the generated requirements.
- Provider-specific orchestration agents, multiple AI agents, or complicated workflows.

## 4. Proposed stack

- **Framework:** Next.js with App Router, React, TypeScript.
- **UI:** Accessible semantic components with simple styling; avoid adding a large component framework unless it clearly reduces effort.
- **Package manager:** **Yarn** (not npm for normal project workflows).
- **Runtime:** A current supported Node.js LTS version, explicitly documented in README.
- **AI:** Optional server-side route calling a configurable LLM provider through environment variables. Keep the AI provider behind a small adapter interface. A single AI review call is sufficient for MVP.
- **Validation:** Zod or equivalent schema validation for project configuration, selected modules, and AI responses.
- **Tests:** Vitest (or an equivalent lightweight TypeScript unit test runner); React Testing Library for key UI behaviors; optional Playwright smoke test if feasible.
- **Storage:** In-memory UI state plus JSON file import/export; no database.

Do not choose additional dependencies without documenting the reason.

## 5. User experience and workflows

### 5.1 Main workflow

1. User enters project name and business requirements.
2. User chooses **Fast Mode** or **Project Mode**.
3. User chooses application type: REST API, AI Agent, Web App, CLI/Library, or Other.
4. User chooses primary language (Java, Python, TypeScript, JavaScript, Other).
5. User chooses applicable framework/runtime choices (Node.js for JavaScript/TypeScript backends; Next.js or React + Vite for a browser UI) and optional testing, persistence, API documentation, and security modules. Build/dependency manager selection is deferred beyond the MVP; module defaults are visible.
6. UI identifies incompatible or irrelevant combinations; dependent options appear only when applicable.
7. User clicks **Assemble Draft**.
8. The system generates a deterministic Markdown document, visibly listing included module identifiers/versions.
9. User reviews and optionally edits the result.
10. User may click **AI Review**. The system proposes improvements and flags ambiguities, contradictions, missing acceptance criteria, and likely overengineering; user chooses whether to apply changes.
11. User copies or downloads the resulting Markdown; optionally exports configuration JSON for later reuse.

### 5.2 Fast Mode

Fast Mode is a general-purpose quick-specification workflow, useful for prototypes, small projects, and time-limited exercises; do not refer to it as an interview-specific feature in the UI.

Prioritize short, actionable sections and rapid execution:

- Problem statement and functional requirements.
- Assumptions and questions to resolve.
- Acceptance criteria and edge cases.
- Technology/runtime constraints.
- Minimal implementation stages with **working vertical slice first**.
- Deterministic golden dataset and expected outputs where applicable.
- Commands and criteria to verify build, tests, and local execution.
- Conditional Swagger/OpenAPI and Postman requirements **only if an API is selected**.
- Explicit distinction between **must-have** and **stretch** goals.

Fast Mode should produce a useful draft with only a few interactions. It must **not** require AI access, and should avoid generating a long enterprise specification.

### 5.3 Technology configuration and coverage

- **Language:** Java, Python, TypeScript or JavaScript (with Other as a text fallback). Do not conflate a language with a runtime.
- **Runtime/backend:** Offer Node.js only when relevant to JavaScript/TypeScript backend projects. Other backend framework choices remain conditional and modest in the MVP.
- **Frontend:** Only show if the application includes a user interface; use Next.js, React + Vite, or No preference. Avoid presenting a separate browser UI requirement for a pure API or CLI.
- **Coverage:** Offer simple optional numeric targets for statement/line and branch coverage. Suggested initial values (e.g., 85% line, 80% branch) may be changed or disabled. Generated docs should emphasize functional/business-logic verification and clear exclusions for generated code and configuration, not encourage gaming the numbers.
- **Dependency/build tooling:** Include a schema field with ecosystem-appropriate defaults but defer selectable package managers to a later release. Never generate commands for an unsupported configuration.

### 5.4 Project Mode

Includes Fast Mode fundamentals plus optional fuller sections for architecture, data model, observability, accessibility, authentication, CI/CD, deployment, reliability, and maintenance.

## 6. Requirements module library

Store reusable Markdown modules as files in the project repository, with structured metadata (ID, title, version, category, applicability, dependencies, and conflicting selections). Keep the module content human readable and easy to edit.

Initial modules:

| Category | Suggested module | Behavior |
|---|---|---|
| Business | `business-core` | Project purpose, user stories, business rules, scope, assumptions |
| General | `engineering-core` | Separation of concerns, input validation, constants, error handling, incremental delivery |
| Language | `java-17-maven` | Java 17, Maven, test/build instructions |
| Language | `python-uv` | Python, `uv`, environment setup, typing, tests |
| Language | `typescript-yarn` | TypeScript and Yarn conventions |
| Runtime | `nodejs-runtime` | Node.js server runtime, async/await, error handling, environment variables and logging; not a programming language |
| Backend | `nodejs-api` | Node.js backend API conventions, minimal framework-neutral guidance (Express/Fastify/NestJS variations deferred) |
| Frontend | `react-vite` | React + Vite browser UI conventions, accessibility and UI testing |
| Frontend | `nextjs-react` | Next.js/React architecture, accessibility, UI testing |
| Backend | `spring-boot` | Spring Boot service conventions, conditional REST support |
| Backend | `fastapi` | FastAPI, Pydantic, conditional REST support |
| Testing | `unit-tests` | Behavioral unit tests |
| Testing | `integration-tests` | Integration tests and isolated dependencies |
| Testing | `golden-dataset` | Deterministic fixtures, expected outcomes, resettable state |
| Testing | `coverage-targets` | Configurable line/branch coverage with justified exclusions; explicit testing of critical functional code |
| Verification | `local-build-run` | Verified install/build/test/start/smoke commands |
| API | `openapi-swagger` | Document all implemented REST endpoints |
| API | `postman` | Importable collection with positive and negative assertions |
| Data | `persistence-optional` | Database only if requirements warrant persistence |
| Security | `security-baseline` | Input validation, secret handling, safe dependency choices |
| AI | `agent-tool-calling` | Tool contracts, failure handling, and agent evaluation |

**Rules:**
- Selected modules may not be silently omitted or rewritten to remove mandatory requirements.
- The UI must disable or flag incompatible combinations (e.g., Maven-only rules with Python).
- Distinguish language, runtime, framework, and dependency manager as separate concepts in configuration. Node.js is a runtime; do not present it as a language.
- Show frontend choices only for projects requiring a UI. For MVP, offer Next.js and React + Vite (or "No preference"), without requiring a frontend for backend/CLI projects.
- For MVP, use explicit package-manager defaults rather than a large choice matrix: Maven for Java, uv for Python, Yarn for JavaScript/TypeScript. Model the selected/default manager in configuration so later versions can support choice without a migration problem.
- Keep optional coverage thresholds configurable; defaults should be guidance, not misleading guarantees of correctness. Include meaningful tests for critical business logic even when coverage numbers are met.
- Only show OpenAPI/Postman as relevant when an API surface exists; do not assume every app needs an API.
- Do not automatically add persistence just because data exists; local fixture files or in-memory data may be sufficient.
- All modules must be inspectable prior to assembly.
- Modules should preserve version identifiers in the exported configuration.

## 7. Generated Markdown structure

Assemble sections in a consistent order, omitting sections that do not apply:

1. Project metadata and summary.
2. Business objectives and in/out-of-scope behavior.
3. Functional requirements.
4. Acceptance criteria.
5. Assumptions and unresolved questions.
6. Technical stack and coding conventions.
7. Architecture and dependencies (if necessary).
8. Data handling and golden dataset.
9. Testing and verification.
10. API contract and documentation (conditional).
11. Security and nonfunctional requirements (conditional).
12. Implementation phases and priorities.
13. Definition of Done.
14. Included module versions and optional AI-review notes.

Use clear, imperative, testable language. Distinguish **user-provided requirements**, **selected module requirements**, and **AI suggestions** where feasible.

## 8. AI review behavior

### 8.1 API and workflow

- AI is **opt-in**, invoked by a dedicated button after deterministic assembly.
- The server-side route owns the model credential; never expose API secrets to client bundles or logs.
- Send only the minimum required document content; display a concise notice that the selected content will be transmitted to the configured provider.
- Request structured output such as `issues[]`, `questions[]`, `suggestedChanges[]`, and `proposedMarkdown`.
- Check parsed response against a schema; report malformed output without damaging the user's draft.
- Treat the document and user business requirements as untrusted task data for the model; prohibit instructions embedded within them from changing the application's workflow.
- AI must not silently invent features, remove selected standards, or claim external facts have been verified.
- The user can reject the AI proposal and keep the original document.
- On LLM timeout, unavailable key, provider failure, or rate limit, deterministic assembly, editing, copy, and export remain fully usable.

### 8.2 AI review prompts should ask for

- Missing or ambiguous requirements and assumptions.
- Contradictions between business requirements and selected modules.
- Missing measurable acceptance criteria.
- Appropriate boundary/negative test cases.
- Unnecessary infrastructure for the requested scope.
- A proposed implementation order emphasizing a runnable first slice.

The builder is an assistant to the engineer, **not an autonomous authority** for final requirements.

## 9. Golden test data and verification

Create a committed fixture set to test the builder itself. Keep expected results independent of its implementation.

Minimum scenarios:

1. Java REST API + Spring Boot + Maven + Swagger + Postman includes every applicable module, no Python instructions.
2. Python AI agent + `uv` + tool-calling includes agent requirements but **does not** require Swagger/Postman without an API.
3. Next.js Web App + TypeScript + Yarn generates front-end and a11y requirements without database mandates.
4. Fast Mode emits a concise document with prioritized stages, golden test cases, and local verification.
5. Project Mode emits appropriate extended sections.
6. Incompatible language/runtime/framework selections are prevented or explicitly explained.
7. Missing business requirements are clearly identified and cannot silently become fabricated requirements.
8. User-edited Markdown is not overwritten without confirmation.
9. AI provider error leaves the original assembled document usable.
10. AI review suggestions are not applied unless approved.
11. Exported JSON configuration round-trips into the same choices and deterministic assembly result.
12. Downloaded Markdown contains expected headings and no template placeholders left unresolved.
13. A Node.js + TypeScript API configuration produces Node-specific guidance without Python/Java conventions.
14. A CLI/backend-only configuration does not require a frontend; a browser app offers only applicable UI options.
15. Coverage selection generates the selected line/branch thresholds and explicit critical-path behavior tests; justified exclusions do not count as untested business behavior.
16. Fast Mode omits nonessential expansion while retaining build, test, runtime and acceptance checks.

Where practical, use snapshot/golden-file comparisons with intentional updates only. Assert behaviors, not merely successful component renders.

## 10. Functional acceptance criteria

- **AC-01:** A user can produce and download a valid `.md` requirements file **without configuring an API key**.
- **AC-02:** Selected modules appear once, in a stable order, with no contradictory language/package-manager requirements.
- **AC-03:** Changing selections and reassembling changes only applicable sections in a predictable way.
- **AC-04:** Fast Mode clearly separates must-haves, stretch goals, and verification steps.
- **AC-05:** Golden dataset guidance includes fixed example inputs and expected outputs, with a reset strategy when stateful behavior applies.
- **AC-06:** Swagger/OpenAPI and Postman instructions appear only when an API is part of the configured application.
- **AC-07:** The application warns before replacing user-edited output.
- **AC-08:** Optional AI review identifies suggestions separately and requires user acceptance.
- **AC-09:** AI failure does not prevent deterministic generation, editing, or export.
- **AC-10:** A configuration JSON file can be exported and reimported to reproduce the same assembled document for a fixed template-library version.
- **AC-11:** UI controls are keyboard accessible, visibly labeled, and show useful validation messages.
- **AC-12:** The project builds, tests, and starts locally using documented commands.
- **AC-13:** Node.js is represented as a runtime, not a language; Node backend modules do not leak into Java/Python projects.
- **AC-14:** Frontend framework controls appear only for application types with a UI; unsupported or contradictory combinations are rejected.
- **AC-15:** Generated testing requirements reflect chosen coverage targets and require verification of functional behavior, not only numerical coverage.
- **AC-16:** Dependency manager choices are not exposed until implemented; current module defaults are explicit and can be extended without reworking the configuration model.

## 11. Security, accessibility, and maintainability

- Never hardcode API keys. Supply `.env.example` containing sanitized variable names and sample placeholders.
- Add `.env*` secrets to `.gitignore` while allowing `.env.example`.
- Validate imports and AI output; impose reasonable file-size and input-length bounds.
- Render Markdown safely; sanitize any HTML or disable unsafe embedded HTML.
- Do not add analytics, tracking, or external telemetry by default.
- Use clear constants/configuration definitions instead of scattered hardcoded values.
- Keep business logic (template selection, validation, assembly) separate from React UI components and AI-provider code.
- No emojis or em dashes in source code, generated sample code, comments, or naming.
- Include meaningful accessible labels, focus indicators, and usable error/status feedback.

## 12. Suggested repository layout

```text
requirements-builder/
├── app/
│   ├── page.tsx
│   └── api/
│       └── ai-review/route.ts       # optional provider-backed review
├── components/
│   ├── project-config-form.tsx
│   ├── requirements-preview.tsx
│   └── review-suggestions.tsx
├── lib/
│   ├── schema.ts
│   ├── module-registry.ts
│   ├── assemble-requirements.ts
│   ├── validate-config.ts
│   ├── export-files.ts
│   └── ai/
│       └── provider.ts
├── templates/
│   ├── business/
│   ├── languages/
│   ├── frameworks/
│   ├── testing/
│   ├── api/
│   ├── security/
│   └── ai/
├── tests/
│   ├── fixtures/
│   ├── assembly.test.ts
│   ├── validation.test.ts
│   ├── exports.test.ts
│   └── ai-review.test.ts
├── .env.example
├── .gitignore
├── README.md
├── requirements.md
└── package.json
```

Adjust the precise layout to fit standard Next.js conventions; do not create files or directories that add no value.

## 13. Scope control and implementation stages

**Scope guard:** Version 1 is a small, usable document builder, not a generalized IDE, agent platform, or dependency matrix. Use deterministic Markdown assembly first. New selections should be driven by a narrow list of compatible modules, and any feature that risks the Stage 1 offline generation workflow is deferred. A working Stage 1 is more valuable than a partially implemented Stage 4.


### Stage 1 — Functional offline generator (highest priority)

1. Initialize Next.js + TypeScript using Yarn.
2. Add configuration schema and a deliberately small initial module set (Java, Python, TypeScript/Node.js, essential testing, Fast Mode, local execution).
3. Build module selection, business requirements input, Fast/Project mode switch, and conditional Node.js/frontend controls.
4. Implement deterministic assembler and Markdown preview.
5. Implement copy/download Markdown.
6. Add golden fixtures, unit tests, and optional coverage targets with clear functional-line/branch guidance.
7. Confirm local development startup and production build.

**Exit criteria:** The user can generate a meaningful `PROJECT_REQUIREMENTS.md` offline, and the project builds and runs locally.

### Stage 2 — Usability and configuration portability

1. Add configuration JSON export/import.
2. Add compatibility/conditional selection warnings.
3. Add editable output with unsaved-edit protection.
4. Improve accessibility and error handling.
5. Add UI integration tests, including conditional frontend/runtime controls and coverage settings.

**Exit criteria:** Selected configurations are reproducible and users can safely edit the final result.

### Stage 3 — Optional AI review

1. Add provider adapter, environment configuration, and protected server-side API route.
2. Add structured critique/suggestion schema and validation.
3. Add explicit review/apply/reject flow.
4. Test timeout, missing key, invalid output, and failure scenarios.
5. Verify deterministic generation remains functional with AI disabled.

**Exit criteria:** AI review enhances drafts without taking control of the requirements or compromising the offline workflow.

### Stage 4 — Fast Mode polish (only after prior stages work)

1. Shorten Fast Mode outputs and interaction time.
2. Add relevant presets and one-click reset.
3. Rehearse a new challenge: receipt of requirements to exported Markdown in a few minutes.
4. Produce a short demo and README instructions.

**Exit criteria:** User can create a compact, reviewable prompt fast enough that it helps rather than slows a coding interview.

## 14. Definition of Done

A stage is complete only when:

- Its acceptance criteria are met.
- Its tests have actually been executed and pass.
- The application has actually been built successfully.
- The application starts locally and its critical workflows have been exercised.
- Any AI-powered path has explicit failure handling.
- The README documents installation, test, build, run, and environment setup commands.
- No credentials or other secrets are checked into source control.
- Known issues and incomplete requirements are listed honestly.

Suggested commands (verify against the generated `package.json`):

```bash
yarn install
yarn test
yarn build
yarn dev
```

Provide a `.env.example` and instructions for optional AI review. Do not state that a command or test passed unless it was actually run successfully.

## 15. Instructions for Cursor's planning agent

1. **Read this requirements document in full.** Do not begin coding immediately.
2. Identify contradictions, unresolved decisions, and scope risks. Ask only questions that block a viable implementation; otherwise state reasonable assumptions.
3. Produce a concise implementation plan organized into the stages above, with file changes, dependencies, validation steps, and expected outcomes.
4. Favor the simplest implementation satisfying Stage 1; avoid premature infrastructure or broad architectural abstractions.
5. Review the plan with the human before implementation.
6. Build one stage at a time. After each stage, run relevant tests and a build, inspect failures, and repair them before proceeding.
7. **Never claim completion from generated code alone.** Verify the application is runnable locally.
8. Distinguish implemented/verified features from planned/unverified features in every status report.
9. Never invent features or rewrite the stated business needs without explaining the change and obtaining approval.

---

**MVP success statement:** A developer can describe a small application, select relevant engineering standards, generate an accurate Markdown requirements document without an LLM, optionally obtain a controlled AI critique, and use the document in Cursor to guide a working implementation.
