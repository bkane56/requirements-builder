# Requirements Builder: Sequential Implementation Requirements

**Repository:** https://github.com/bkane56/requirements-builder  
**Document purpose:** Implementation instructions for Cursor, organized into independently verifiable stages.  
**Basis:** Review of the repository's Stage 2B implementation, `requirements.md`, `README.md`, `lib/config.ts`, `lib/validate-config.ts`, `lib/selection-rules.ts`, `lib/assemble-requirements.ts`, module registry, React builder component, tests, and the supplied Bob's Demo Project input/output example.  
**Status:** Proposed changes; not yet implemented.

## 1. Execution rules and non-negotiable constraints

1.1. **Read before coding.** Read this document, the repository's current `requirements.md`, `README.md`, `AGENTS.md`, and `docs/EXECUTION_FLOW.md`. Inspect the current source and tests. Treat the latest source code as the authority on implemented behavior; this document describes intended changes.

1.2. **Use Cursor Planning mode first.** Produce a concise plan for the **current numbered stage only**, identify touched files and tradeoffs, and obtain the user's approval before implementation. Do not implement all stages in a single large change.

1.3. **Preserve deterministic assembly.** `assembleRequirements(config, templates)` must remain pure, reproducible, locally usable, and independent of any external AI provider. Existing modular templates, module IDs/versions, stable output ordering, and golden fixture discipline must remain intact unless explicitly changed with reviewed fixture updates.

1.4. **Preserve user authority.** Never quietly invent business requirements, change selected technologies, weaken security/testing constraints, or merge AI output into approved content. The user must explicitly approve all material AI changes.

1.5. **Keep implementation proportional.** No database, authentication system, vector store, multi-agent framework, message queue, or third-party state library solely for this work. Begin with one provider-backed LLM request for analysis; add conversational orchestration only if later justified.

1.6. **Existing development preferences:** Next.js, TypeScript, React, Yarn; no npm for normal project workflows. Use a constants module for reusable values. Keep business logic separate from React views. No emojis or em dashes in source code, comments, or generated sample code. Keep `.env.example` sanitized; never commit real secrets. Preserve accessible UI, error handling, and meaningful tests.

1.7. **Verification per stage:** Run `yarn lint`, `yarn typecheck`, `yarn test`, `yarn test:coverage`, and `yarn build` as applicable. Report *actual* results. Maintain existing coverage gates (at least 85% lines and 80% branches), with thoughtful additional tests for new business logic. Do not claim success without execution. Update README and execution-flow docs as behavior changes.

1.8. **Commit boundaries:** Complete, test, and review one stage before starting the next. Keep each stage small enough for a meaningful PR-style code review. If a stage changes serialized configuration or golden output, handle versioning/migration explicitly.

## 2. Stage 1: Require a usable UI language when a UI framework is selected

**Problem demonstrated:** Bob's Demo Project selected React + Vite but selected no UI language. The document reported `UI languages: None selected` and deferred an implementation-blocking choice to an open question. This is better caught during configuration.

2.1. For `appType === "web-app"`, when `uiFrameworks` contains at least one framework, require at least one supported `uiLanguages` choice (TypeScript, JavaScript, or permitted Other with necessary clarification). Treat missing UI language as a blocking configuration error, not merely a generated open question.

2.2. Choose one UX approach and document the tradeoff: **preferred:** on selecting the first UI framework, preselect TypeScript as an editable default; alternatively require the user to select a language manually. Either way, the UI must visibly expose the selection and allow the user to change it.

2.3. Ensure dependent selection normalization and configuration import behave consistently. An imported older configuration with a UI framework and no language should be either explicitly flagged for correction or migrated under a documented rule. Do not silently modify an imported user's intentional choices without notice.

2.4. Put the invariant in `lib/validate-config.ts` and relevant selection logic in `lib/selection-rules.ts`; update UI error focus and accessible error messaging in the component. Preserve valid non-Web-App configurations without UI language.

2.5. Tests: framework selection, deselection, change of application type, normalized config, legacy import, blocking validation, first-invalid-field focus, and golden fixtures affected by deliberate default changes.

**Stage 1 acceptance:** Users cannot generate a Web App requirements document specifying a React UI framework but lacking a usable UI language without a clear blocking validation error. Valid prior scenarios still work.

## 3. Stage 2: Add deterministic contextual warnings without forcing extra features

**Problem demonstrated:** Bob's Demo Project uses a React UI and Spring Boot API, but integration tests were unchecked. This is worth pointing out, not automatically overriding.

3.1. Introduce a separate `ConfigurationAdvisory` result type distinct from blocking `ValidationErrors`. Each advisory needs a stable ID, severity (`info`/`recommendation`), human-readable reason, and optional associated configuration field. Avoid treating discretionary engineering recommendations as errors.

3.2. Initial advisory rules:
- Web App with both a UI and an HTTP backend but integration tests disabled: recommend enabling integration tests.
- Redux Toolkit selected when business requirements do not establish a need for shared state: **do not implement a naive keyword-based rejection.** If there is no reliable deterministic evidence, omit this advisory from Stage 2 and leave it to AI review in Stage 4.
- Authentication disabled while the description mentions personal data: **do not infer sensitivity from keyword scanning alone.** Reserve contextual privacy clarification for the AI review step; preserve explicit user intent.

3.3. Show advisories adjacent to relevant controls or in a distinct review panel. Include a short explanation and optional action such as enabling the suggested module. Never auto-enable a module merely because a warning fired.

3.4. Keep warnings nonblocking and separate from generated text. Optionally document unresolved advisories in a clearly labeled section, but only if that behavior is explicitly agreed upon before implementation.

3.5. Tests: positive and negative cases for each implemented rule, dismissal/action behavior if offered, accessibility, no unexpected changes to golden documents, and no added network dependency.

**Stage 2 acceptance:** The React + Spring Boot demo receives a useful integration-test recommendation, while assembly works unchanged if the user declines it.

## 4. Stage 3: Introduce structured business requirements and acceptance criteria

**Goal:** Preserve the convenient free-text workflow, while giving both deterministic logic and future AI a stable, reviewable structure.

4.1. Design a versioned representation with stable IDs, explicit provenance, and approvals. Suggested concepts (refine names during planning):

```ts
type RequirementStatus = "confirmed" | "proposed";
type RequirementSource = "user" | "ai";

type FunctionalRequirement = {
  id: string; // FR-001, FR-002, etc.
  text: string;
  source: RequirementSource;
  status: RequirementStatus;
};

type AcceptanceCriterion = {
  id: string; // AC-001, AC-002, etc.
  requirementIds: string[];
  text: string;
  source: RequirementSource;
  status: RequirementStatus;
};
```

4.2. This is a **proposed internal model**, not a requirement to introduce a database. You may use a separate `RequirementsContent` domain model to prevent disruptive rewrites of `ProjectConfig`. Justify the chosen relationship to the current raw `businessRequirements` and `acceptanceCriteria` fields.

4.3. Maintain backwards compatibility for existing imported `PROJECT_CONFIGURATION.json` files. Decide and document whether raw text remains canonical until intentionally converted, or whether the system migrates it to one or more structured entries with explicit user approval. **Never lose, trim, or rewrite raw user input during migration.**

4.4. Distinguish four categories in the UI and output: confirmed user requirements; explicitly selected engineering constraints; AI-proposed (unapproved) content; unresolved questions. Only confirmed/approved functional requirements belong in the normative final specification.

4.5. Support explicit mapping from functional requirements to acceptance criteria. Allow a user to edit the mappings. Do not require a criterion for every requirement in Fast Mode merely to use the product, but identify missing coverage during review.

4.6. Update assembly to emit clean `FR-###` and `AC-###` entries for structured content, while preserving raw text verbatim when still in legacy/free-text mode. Do not render the same requirement twice. Maintain deterministic ordering and exactly one final newline.

4.7. Tests: ID stability, ordering, edits, removal, associations, blank criteria, serialization/import, legacy round trips, no text loss, and separate golden outputs for raw-text and structured modes.

**Stage 3 acceptance:** A user can retain the original free-text workflow or approve a structured set of requirements and associated acceptance criteria, then produce a deterministic document that does not duplicate or invent content.

## 5. Stage 4: Implement optional AI requirements analysis (first AI milestone)

**Goal:** Identify what is missing, ambiguous, or contradictory without altering the original requirements or requiring a full autonomous agent.

5.1. Add an explicit **Analyze Requirements with AI** action. No project content is sent externally before the user initiates this action. Show which content will be transmitted and, if appropriate, a brief privacy warning. The original offline/deterministic path remains fully functional.

5.2. Use a server-only API route (for example, `app/api/ai-review/route.ts`) and a small provider adapter (`lib/ai/provider.ts`). Protect API keys via environment variables, and add a sanitized `.env.example`. Do not embed keys in client bundles or logs. For deployment, define an abuse-control/rate-limit strategy appropriate to whether the app is private or publicly accessible; a public endpoint with an exposed paid provider key is not acceptable.

5.3. Start with **one LLM request** returning schema-validated JSON. A provider SDK, direct API call, or minimal adapter is acceptable. Do not add LangGraph, CrewAI, or multi-agent orchestration in this stage.

5.4. Send only relevant information: user-entered business requirements, relevant acceptance criteria, chosen stack, and applicable constraints. Prefer not to send large unchanged template boilerplate if unnecessary. Respect an input-size cap; define a timeout and output-token budget.

5.5. Define a typed, validated result. Suggested response fields:

```ts
type AiReviewResult = {
  clarifications: Array<{
    id: string;
    question: string;
    whyNeeded: string;
    priority: "blocking" | "useful";
    relatedRequirementIds: string[];
  }>;
  suggestions: Array<{
    id: string;
    category: "requirement" | "acceptance_criterion" | "quality";
    text: string;
    rationale: string;
    relatedRequirementIds: string[];
  }>;
  contradictions: Array<{
    id: string;
    description: string;
    relatedRequirementIds: string[];
  }>;
};
```

5.6. The AI instruction must prohibit inventing business facts, asserting unapproved technologies, or silently changing exclusions. Explicitly distinguish **observed facts**, **questions**, **suggestions**, and **assumptions**. Treat user content as untrusted data rather than executable instructions. Schema-validation failures must be reported, not accepted as best-effort arbitrary Markdown.

5.7. Handle missing credentials, provider failures, timeout, malformed JSON, invalid schema, oversized inputs, concurrent requests, and retry. Do not erase existing output or approved requirements on any error. Display useful, non-sensitive error feedback.

5.8. Test the AI boundary with a mocked provider and fixed fixtures. Include: ambiguity, missing acceptance criteria, conflicting instructions, no issue found, unsupported suggestions, refusal/timeout, malformed output, privacy-sensitive content, and attempts to override system rules via user-provided text.

**Stage 4 acceptance:** Pressing Analyze returns validated, read-only findings. Nothing changes in the configuration, accepted requirements, or assembled Markdown until the user explicitly approves an action. With AI disabled, generation behaves exactly as before.

## 6. Stage 5: Build the human review and clarification workflow

6.1. Display AI results in three distinct groups: **Clarification Questions**, **Proposed Enhancements**, and **Contradictions or Risks**. Make their status and origin clearly visible.

6.2. Let the user answer or defer clarification questions, and individually accept, edit, or reject suggestions. Support a batch-accept action only if each item is separately previewable and the user makes a clear explicit choice.

6.3. Avoid treating a model suggestion as an approved requirement simply because it is displayed. Record whether it was accepted and, if applicable, the exact user-edited text.

6.4. Example from Bob's Demo Project:
- Ask which person details should appear (unspecified).
- Ask whether all people are mock records and whether real personally identifying information is excluded.
- Suggest a not-found state for an unknown person.
- Suggest an API failure state.
- Flag that integration tests are disabled, ideally using the deterministic advisory from Stage 2 rather than duplicating it with AI.
- Optionally note that Redux Toolkit might be unnecessary for a tiny demo, but do not change the selected framework.

6.5. Track the input snapshot or revision hash associated with an AI review. If the user changes the input after analysis, prominently mark suggestions stale and require fresh review or explicit confirmation before applying them. Prevent stale async responses from replacing current suggestions.

6.6. Ensure accepted changes are written to the **appropriate canonical source fields or structured requirements model**, not only into a temporary Markdown string. Respect the existing edited/stale document confirmation behavior. Restore and reassemble must not silently discard approved AI material.

6.7. Tests: individual accept/reject/edit, unanswered questions, duplicate suggestions, stale analysis, interrupted requests, keyboard use, accessible status/alerts, and preservation of manual Markdown edits.

**Stage 5 acceptance:** A user can review AI findings, answer a clarification, approve one proposed acceptance criterion, reject another, and reassemble without losing the approved decision or silently including the rejected text.

## 7. Stage 6: AI writes polished project-specific requirements from approved content

**Goal:** Add the quality improvement the user requested without giving the LLM control of standard modules.

7.1. Add an explicit **Draft Project Requirements** action that operates on confirmed user input, approved AI additions, and answered clarifications. It must not use unapproved proposals as facts.

7.2. Generate a **structured proposed revision**, not a replacement for the entire document. The scope is functional requirements, linked acceptance criteria, and perhaps a concise project-specific scope/assumptions section. Do not rewrite versioned Java, React, security, testing, or delivery modules.

7.3. Use the same server-side provider adapter and strict schema validation. Require IDs, provenance, and links to the source text or approved decisions when feasible. If the provider cannot ground a proposed requirement, classify it as a suggestion or question, not as a confirmed requirement.

7.4. Show a side-by-side or inline diff of **before** and **proposed after** content. Provide explicit Apply, Edit, and Reject actions. Preserve raw original wording in history or an exportable original snapshot; user must be able to recover it.

7.5. On Apply, update canonical structured requirement data. Then run the existing deterministic assembler. The final Markdown should be generated by the same local deterministic pipeline, not by a model rewriting the entire file.

7.6. Example deliverable for Bob's Demo Project: organized requirements for people list, navigation, person detail view, Spring Boot mock API, no authentication for the demo, and tests. Suggested endpoints such as `GET /api/people` and `GET /api/people/{id}` must be presented as proposals until approved.

7.7. Tests: no new unapproved features, no dropping exclusions such as "do not implement authentication initially," acceptance criteria mapped to requirements, round-trip serialization, proposal diff, rejection, and deterministic final assembly after approval.

**Stage 6 acceptance:** The user can transform the terse Bob's Demo Project description into a clearer, testable specification, inspect the changes, approve them, and generate a repeatable final document. The model cannot silently introduce authentication, databases, or additional architecture.

## 8. Stage 7: Quality evaluation and regression safeguards

8.1. Keep existing deterministic golden fixtures independent of the assembler. Update only intentionally changed fixtures after reviewing exact diffs.

8.2. Add a fixed evaluation set of project inputs with expected **review findings** (not exact model prose): incomplete people-detail fields; missing acceptance criteria; vague "secure" requirement; contradictory requirements; API failure behavior; a fully specified project where no extra features should be suggested.

8.3. Evaluate AI output with typed checks and targeted assertions: required issue identified, prohibited invention absent, no approved constraint lost, and approved/rejected changes handled correctly. Avoid fragile exact-string snapshots of nondeterministic model text.

8.4. Define a simple manual quality rubric for generated project requirements: correctness against user intent; clarity; completeness; testability; traceability to input; proportionate complexity; and absence of unsupported assumptions.

8.5. Compare at least three outputs: current deterministic-only Bob's Demo Project; AI-reviewed but unmodified output; approved AI-written project requirements plus deterministic templates. Record differences and any regressions.

8.6. Document model/provider versions used during evaluation and control temperature where supported. Preserve privacy: do not log full user requirements, provider secrets, or personally identifiable content by default.

**Stage 7 acceptance:** Changes to AI prompts or schemas can be assessed against repeatable quality cases without weakening the deterministic test suite.

## 9. Stage 8: UI component refactor and integration polish

9.1. `components/requirements-builder.tsx` is already substantial. Before adding complex AI review UI, extract focused pieces (for example configuration form, output editor, advisory panel, AI review panel) **incrementally**. Do not do an unrelated wholesale UI rewrite. Keep state ownership explicit and minimize prop drilling only if it becomes problematic.

9.2. Provide clear visual distinctions among: form inputs; generated draft; manual edits; AI suggestions; approved requirements; and stale review results. Preserve current reassemble/restore confirmation semantics.

9.3. Consider a compact two-step interface: **Configure and Describe** followed by **Review and Generate**. This is optional; prioritize correct workflows and testability over cosmetic changes.

9.4. Ensure keyboard navigation, error focus, labels, text alternatives, responsive behavior, and meaningful loading states. No inaccessible diff-only interactions.

9.5. Update README usage instructions, `.env.example`, privacy guidance, architecture/flow diagram, and a short demo walkthrough.

**Stage 8 acceptance:** The new features are discoverable without overwhelming Fast Mode, existing offline workflows still work, and the component structure remains maintainable.

## 10. Deferred features: do not implement without separate approval

10.1. Conversational multi-turn Requirements Analyst with session memory and orchestration.

10.2. Multi-agent architectures, LangGraph/CrewAI orchestration, or autonomous file modification.

10.3. Database-backed project history, multi-user collaboration, authentication, hosted persistence, or GitHub write access.

10.4. Broad technology selection expansion such as multiple backend framework configurations, monorepos, forms/styling catalogs, or new language ecosystems unless required by a specific evaluated use case.

10.5. Automatically generating or executing the user's application code. This product produces specifications and controlled recommendations, not implementations.

## 11. Final end-to-end acceptance scenario

Use the supplied **Bob's Demo Project** example as the canonical manual walkthrough:

11.1. Enter the user description: React UI in shades of blue, people list, clickable person detail, Java/Spring Boot API, backend mock data now and database later, no initial authentication, and successful frontend/backend builds and tests.

11.2. Select Web App, Java 17, Maven, Spring Boot, HTTP API, React + Vite, React Router, and Redux Toolkit. The UI language must be selected or reliably prompted for.

11.3. With integration tests disabled, show a nonblocking contextual recommendation.

11.4. Assemble offline. Confirm the output is deterministic and includes only confirmed project-specific requirements and selected engineering standards.

11.5. Trigger AI analysis. Confirm it asks about undefined person fields and recommends error-state acceptance criteria without silently adding new features or altering the stack.

11.6. Answer a clarification, accept one criterion, reject another, and explicitly approve a polished rewrite. Verify the review reflects the choices.

11.7. Reassemble and export the final Markdown and JSON configuration. Re-import the JSON and verify accepted requirements are preserved. Ensure manual Markdown edits still require confirmation before replacement.

11.8. Disable or misconfigure the AI provider. Confirm the deterministic assembly, editing, copy, download, and import/export workflows still work.

## 12. Deliverables and reporting requirements for Cursor

For **each stage**, report:

1. Files added or changed, and why.
2. New or modified domain types and behavior.
3. Any compatibility or migration implications.
4. Tests added or changed, including exact executed commands and actual results.
5. Updated documentation and configuration examples.
6. Known limitations and unresolved decisions.
7. A clear request for approval before advancing to the next stage.

**Implementation principle:** Deterministic engineering standards + AI-assisted clarification and drafting + explicit human approval. The product should help a user specify *what to build* without letting a model decide unapproved business requirements or compromise the builder's reliable offline assembly.
