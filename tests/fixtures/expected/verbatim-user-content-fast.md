# Project Requirements

## Project Metadata and Summary

- Project name:   Café {{projectName}} & <Tools>  
- Mode: Fast Mode
- Application type: Other
- Language: Other
- HTTP API: Not included
- Assembly: deterministic, generated without AI

### Description (user-provided)

Uses *Markdown*, `code`, and <b>HTML</b> as typed.

## Business Objectives and Scope

### Module: `business-core` v1.0.0

- Treat the user-provided requirements in this document as the authoritative statement of business needs.
- Implement only the behavior described. Do not add features that were not requested.
- Identify in-scope and out-of-scope behavior explicitly before implementation begins.
- Express each business rule as testable behavior with a clear expected outcome.
- Record every assumption and ambiguity under Assumptions and Unresolved Questions, and resolve it with the user before implementing the affected behavior.

## Functional Requirements

### User-provided requirements

  Leading spaces are kept.

# A user heading stays as typed

- Literal {{lineCoverage}} and {{unknown}} are not substituted.
- Symbols: ü ñ 東京 — 🚀 \ $1 $& <script>alert(1)</script>
	Tabbed line

Trailing spaces here   


## Acceptance Criteria

### User-provided requirements

Not provided. Measurable acceptance criteria must be supplied by the user before implementation.

## Assumptions and Unresolved Questions

### Open questions

- What are the measurable acceptance criteria for each functional requirement? None were provided.
- Which programming language and toolchain should be used? "Other" was selected, so no language conventions are included.

## Technical Stack and Coding Conventions

### Module: `engineering-core` v1.0.0

- Separate presentation, business logic, and data access so business logic can be tested on its own.
- Validate all external input at system boundaries and return clear, actionable error messages.
- Place reusable constant values in constants modules organized by responsibility. Do not scatter magic values.
- Handle expected failures explicitly. Do not silently swallow exceptions; make unexpected failures visible.
- Never hard-code credentials, secrets, or environment-specific configuration.
- Deliver incrementally in small, verifiable changes.
- Prefer clear, maintainable code over clever or compressed code.

## Testing and Verification

### Module: `unit-tests` v1.0.0

- Write behavioral unit tests for business logic, covering success paths, failure paths, boundaries, and empty or missing values.
- Assert observable outcomes, not implementation details.
- Keep unit tests deterministic and independent of external services, timing, and shared mutable state.
- Do not delete, disable, or weaken a valid test to make an implementation pass.

### Module: `coverage-targets` v1.0.0

- Maintain at least 70% line coverage and 60% branch coverage of functional and business-logic code, enforced by the test runner.
- Every critical business rule must have explicit behavioral tests for its success and failure paths, even when the coverage targets are already met.
- Exclude only generated code, configuration, and framework bootstrap code, and list each exclusion with a justification. Excluded code does not count as tested business behavior.
- Do not write tests solely to raise coverage numbers.

### Module: `local-build-run` v1.0.0

- Document the install, build, test, start, and smoke-check commands in the README.
- Run each documented command successfully before declaring a stage complete.
- Report actual command results. Do not state that a command or test passed unless it was run.

## Implementation Phases and Priorities

### Stretch goals (user-provided)

{{branchCoverage}} stays literal.

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
- `unit-tests` v1.0.0: Unit tests
- `coverage-targets` v1.0.0: Coverage targets
- `local-build-run` v1.0.0: Local build and run verification
- `fast-delivery` v1.1.0: Fast Mode delivery plan and complexity constraints
- `definition-of-done` v1.0.0: Definition of Done
