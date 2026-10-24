# Project Requirements

## Project Metadata and Summary

- Project name: Team Retro Board
- Mode: Project Mode
- Application type: Web App
- Language: TypeScript
- Package manager: Yarn (default for TypeScript)
- Frontend: Next.js
- HTTP API: Not included
- Assembly: deterministic, generated without AI

### Description (user-provided)

Browser app for running sprint retrospectives.

## Business Objectives and Scope

### Module: `business-core` v1.0.0

- Treat the user-provided requirements in this document as the authoritative statement of business needs.
- Implement only the behavior described. Do not add features that were not requested.
- Identify in-scope and out-of-scope behavior explicitly before implementation begins.
- Express each business rule as testable behavior with a clear expected outcome.
- Record every assumption and ambiguity under Assumptions and Unresolved Questions, and resolve it with the user before implementing the affected behavior.

## Functional Requirements

### User-provided requirements

- Facilitators create a board with three columns.
- Participants add, edit, and vote on cards.
- Boards are kept only for the current browser session.

## Acceptance Criteria

### User-provided requirements

- A new board shows the columns Went well, To improve, and Actions.
- Each participant can vote at most three times per board.

## Technical Stack and Coding Conventions

### Module: `engineering-core` v1.0.0

- Separate presentation, business logic, and data access so business logic can be tested on its own.
- Validate all external input at system boundaries and return clear, actionable error messages.
- Place reusable constant values in constants modules organized by responsibility. Do not scatter magic values.
- Handle expected failures explicitly. Do not silently swallow exceptions; make unexpected failures visible.
- Never hard-code credentials, secrets, or environment-specific configuration.
- Deliver incrementally in small, verifiable changes.
- Prefer clear, maintainable code over clever or compressed code.

### Module: `typescript-yarn` v1.0.0

- Use TypeScript with `strict` mode enabled. Avoid `any`; type external data at boundaries.
- Use Yarn for dependency management and commit `yarn.lock`. Never create `package-lock.json`.
- Install with `yarn install --frozen-lockfile`. Provide `yarn lint`, `yarn typecheck`, `yarn test`, and `yarn build` scripts.

### Module: `nextjs-react` v1.0.0

- Use the Next.js App Router. Default to Server Components; use Client Components only where interactivity requires them.
- Keep business logic in plain modules outside React components so it can be unit tested.
- Meet WCAG 2.2 AA: semantic markup, labeled controls, keyboard operation, visible focus, and clear error messages.
- Test key user behaviors with React Testing Library, asserting outcomes rather than successful renders.

## Architecture and Dependencies

### Module: `project-extended` v1.0.0

#### Architecture

- Document the main components, their responsibilities, and how they communicate.
- Introduce a new layer, service, or abstraction only when a stated requirement needs it, and document the reason.

#### Data model

- Document the core entities, their relationships, and validation rules.
- Add persistence only if the requirements need data to outlive a process.

#### Observability

- Log meaningful events and failures with enough context to diagnose them. Never log secrets.

#### Accessibility

- User interfaces must meet WCAG 2.2 AA: labeled controls, keyboard operation, visible focus, and clear error messages.

#### Authentication and authorization

- Define who may perform each action. Omit authentication only if the requirements state that the system has no protected actions.

#### CI/CD and deployment

- Automate build, lint, and test on every change. Document the deployment target and procedure if deployment is in scope.

#### Reliability

- Define expected behavior when dependencies are slow or unavailable, including timeouts and retries where appropriate.

#### Maintenance

- Keep the README accurate for setup, configuration, test, build, and run instructions.
- Record known issues and deferred work honestly.

## Testing and Verification

### Module: `unit-tests` v1.0.0

- Write behavioral unit tests for business logic, covering success paths, failure paths, boundaries, and empty or missing values.
- Assert observable outcomes, not implementation details.
- Keep unit tests deterministic and independent of external services, timing, and shared mutable state.
- Do not delete, disable, or weaken a valid test to make an implementation pass.

### Module: `coverage-targets` v1.0.0

- Maintain at least 85% line coverage and 80% branch coverage of functional and business-logic code, enforced by the test runner.
- Every critical business rule must have explicit behavioral tests for its success and failure paths, even when the coverage targets are already met.
- Exclude only generated code, configuration, and framework bootstrap code, and list each exclusion with a justification. Excluded code does not count as tested business behavior.
- Do not write tests solely to raise coverage numbers.

### Module: `local-build-run` v1.0.0

- Document the install, build, test, start, and smoke-check commands in the README.
- Run each documented command successfully before declaring a stage complete.
- Report actual command results. Do not state that a command or test passed unless it was run.

## Security and Nonfunctional Requirements

### Module: `security-baseline` v1.0.0

- Validate and bound all external input, including size limits.
- Supply secrets through environment variables. Provide a sanitized `.env.example` and ignore real `.env` files in `.gitignore`.
- Never log secrets, tokens, or sensitive personal data.
- Prefer well-maintained dependencies, and add one only when the platform cannot reasonably meet the need.

## Implementation Phases and Priorities

### Stretch goals (user-provided)

No stretch goals were provided. Treat every functional requirement above as must-have.

### Module: `project-delivery` v1.0.0

#### Phases

1. Working vertical slice: implement the core functional requirement end to end with automated tests.
2. Functional completeness: implement the remaining must-have requirements, each with tests for its acceptance criteria.
3. Nonfunctional quality: address security, accessibility, observability, and reliability requirements that apply.
4. Delivery: add CI/CD, deployment configuration, and operational documentation where required.
5. Stretch goals: start only after all must-have requirements are implemented and verified.

#### Verification after each phase

- Build the project, run the automated tests, and start the application locally.
- Report results from commands actually run. Do not claim a phase is complete from generated code alone.

## Definition of Done

### Module: `definition-of-done` v1.0.0

- Every must-have functional requirement is implemented and its acceptance criteria are verified.
- Automated tests have been executed and pass.
- The production build succeeds and the application starts locally.
- The README documents installation, configuration, test, build, and run commands.
- No credentials or other secrets are committed to source control.
- Known issues and incomplete requirements are listed honestly.

## Included Modules

- `business-core` v1.0.0: Business requirements handling
- `engineering-core` v1.0.0: Engineering core standards
- `typescript-yarn` v1.0.0: TypeScript with Yarn
- `nextjs-react` v1.0.0: Next.js and React frontend
- `project-extended` v1.0.0: Project Mode extended sections
- `unit-tests` v1.0.0: Unit tests
- `coverage-targets` v1.0.0: Coverage targets
- `local-build-run` v1.0.0: Local build and run verification
- `security-baseline` v1.0.0: Security baseline
- `project-delivery` v1.0.0: Project Mode delivery plan
- `definition-of-done` v1.0.0: Definition of Done
