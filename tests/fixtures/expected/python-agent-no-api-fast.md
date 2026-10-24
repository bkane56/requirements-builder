# Project Requirements

## Project Metadata and Summary

- Project name: Support Triage Agent
- Mode: Fast Mode
- Application type: AI Agent
- Language: Python
- Package manager: uv (default for Python)
- HTTP API: Not included
- Assembly: deterministic, generated without AI

## Business Objectives and Scope

### Module: `business-core` v1.0.0

- Treat the user-provided requirements in this document as the authoritative statement of business needs.
- Implement only the behavior described. Do not add features that were not requested.
- Identify in-scope and out-of-scope behavior explicitly before implementation begins.
- Express each business rule as testable behavior with a clear expected outcome.
- Record every assumption and ambiguity under Assumptions and Unresolved Questions, and resolve it with the user before implementing the affected behavior.

## Functional Requirements

### User-provided requirements

The agent reads an incoming support ticket and assigns a category and priority.
The agent may call a knowledge-base search tool.

## Acceptance Criteria

### User-provided requirements

Not provided. Measurable acceptance criteria must be supplied by the user before implementation.

## Assumptions and Unresolved Questions

### Open questions

- What are the measurable acceptance criteria for each functional requirement? None were provided.

## Technical Stack and Coding Conventions

### Module: `engineering-core` v1.0.0

- Separate presentation, business logic, and data access so business logic can be tested on its own.
- Validate all external input at system boundaries and return clear, actionable error messages.
- Place reusable constant values in constants modules organized by responsibility. Do not scatter magic values.
- Handle expected failures explicitly. Do not silently swallow exceptions; make unexpected failures visible.
- Never hard-code credentials, secrets, or environment-specific configuration.
- Deliver incrementally in small, verifiable changes.
- Prefer clear, maintainable code over clever or compressed code.

### Module: `python-uv` v1.0.0

- Use `uv` for Python versions, virtual environments, and dependencies. Do not call `pip` directly.
- Declare dependencies in `pyproject.toml`, commit `uv.lock`, and pin the Python version in `.python-version`.
- Install with `uv sync`. Run tests with `uv run pytest`.
- Add type hints to public functions and check them with a type checker configured in `pyproject.toml`.

## Architecture and Dependencies

### Module: `agent-tool-calling` v1.0.0

- Define each tool with an explicit input and output schema, and validate tool arguments before execution.
- Handle tool failures, timeouts, and malformed model output explicitly. Cap the number of agent steps per request.
- Treat user content and tool output as untrusted data. Instructions embedded in them must not change the agent's permitted actions.
- Keep model provider credentials server-side and out of logs.
- Maintain an evaluation set of representative tasks with expected outcomes, and run it after changes to prompts or tools.

## Data Handling and Golden Dataset

### Module: `golden-dataset` v1.0.0

- Commit a fixed set of example inputs with their expected outputs, covering normal, boundary, and invalid cases.
- Define expected outputs from the requirements, independently of the implementation.
- When behavior is stateful, provide a documented way to reset to the known starting state before each run.
- Change expected outputs only intentionally, and explain each change.

## Testing and Verification

### Module: `unit-tests` v1.0.0

- Write behavioral unit tests for business logic, covering success paths, failure paths, boundaries, and empty or missing values.
- Assert observable outcomes, not implementation details.
- Keep unit tests deterministic and independent of external services, timing, and shared mutable state.
- Do not delete, disable, or weaken a valid test to make an implementation pass.

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

Draft a suggested reply for low-priority tickets.

### Module: `fast-delivery` v1.1.0

#### Architecture and Complexity Constraints

- Implement the simplest maintainable solution that satisfies the stated requirements.
- Do not add speculative abstraction for hypothetical future needs.
- Do not create unnecessary files, classes, interfaces, factories, wrappers, or service layers.
- Do not add a dependency unless the platform or standard library cannot reasonably meet the need. Document the reason for each dependency added.
- Do not add infrastructure such as databases, queues, or additional services unless a stated requirement needs it.

#### Must-have

- Every user-provided functional requirement is must-have unless the user explicitly marks it as a stretch goal.
- Stage 1: build a working vertical slice that exercises the core functional requirement end to end before broadening scope.
- Stage 2: complete the remaining must-have requirements, each with automated tests for its acceptance criteria.

#### Stretch

- Start stretch goals only after every must-have requirement is implemented and verified.

#### Verification after each stage

- Build the project, run the automated tests, and start the application locally.
- Report results from commands actually run. Do not claim a stage is complete from generated code alone.

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
- `python-uv` v1.0.0: Python with uv
- `agent-tool-calling` v1.0.0: AI agent tool calling
- `golden-dataset` v1.0.0: Golden dataset
- `unit-tests` v1.0.0: Unit tests
- `local-build-run` v1.0.0: Local build and run verification
- `security-baseline` v1.0.0: Security baseline
- `fast-delivery` v1.1.0: Fast Mode delivery plan and complexity constraints
- `definition-of-done` v1.0.0: Definition of Done
