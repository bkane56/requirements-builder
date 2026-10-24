# Project Requirements

## Project Metadata and Summary

- Project name: Order Service
- Mode: Fast Mode
- Application type: REST API
- Language: Java
- Package manager: Maven (default for Java)
- Backend framework: Spring Boot
- HTTP API: Included
- Assembly: deterministic, generated without AI

### Description (user-provided)

Internal service for creating and retrieving customer orders.

## Business Objectives and Scope

### Module: `business-core` v1.0.0

- Treat the user-provided requirements in this document as the authoritative statement of business needs.
- Implement only the behavior described. Do not add features that were not requested.
- Identify in-scope and out-of-scope behavior explicitly before implementation begins.
- Express each business rule as testable behavior with a clear expected outcome.
- Record every assumption and ambiguity under Assumptions and Unresolved Questions, and resolve it with the user before implementing the affected behavior.

## Functional Requirements

### User-provided requirements

- Clients can create an order with one or more line items.
- Clients can fetch an order by its ID.
- Unknown order IDs return 404.

## Acceptance Criteria

### User-provided requirements

- POST /orders with valid items returns 201 and the new order ID.
- GET /orders/{id} for an unknown ID returns 404.

## Technical Stack and Coding Conventions

### Module: `engineering-core` v1.0.0

- Separate presentation, business logic, and data access so business logic can be tested on its own.
- Validate all external input at system boundaries and return clear, actionable error messages.
- Place reusable constant values in constants modules organized by responsibility. Do not scatter magic values.
- Handle expected failures explicitly. Do not silently swallow exceptions; make unexpected failures visible.
- Never hard-code credentials, secrets, or environment-specific configuration.
- Deliver incrementally in small, verifiable changes.
- Prefer clear, maintainable code over clever or compressed code.

### Module: `java-17-maven` v1.0.0

- Use Java 17.
- Use Maven for build and dependency management. Prefer the Maven Wrapper (`./mvnw`) and commit it. Do not introduce Gradle or Ant.
- Pin plugin and dependency versions in `pom.xml`.
- Build and test with `./mvnw clean verify`. Run tests alone with `./mvnw test`.
- Use JUnit 5 for tests.

### Module: `spring-boot` v1.0.0

- Keep controllers thin. Place business logic in services and persistence in repositories.
- Expose DTOs at the API boundary; do not return persistence entities.
- Validate request bodies with Bean Validation (`@Valid`) and map errors to a consistent response through `@RestControllerAdvice`.
- Externalize configuration in `application.yml` with environment variable overrides. Keep transactions short.
- Start locally with `./mvnw spring-boot:run`.

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

### Module: `integration-tests` v1.0.0

- Test each external boundary (HTTP, database, file system, third-party service) through integration tests.
- Run dependencies in isolation, such as containers or local test instances, and reset their state between tests.
- Keep integration tests runnable locally with a single documented command.

### Module: `coverage-targets` v1.0.0

- Maintain at least 85% line coverage and 80% branch coverage of functional and business-logic code, enforced by the test runner.
- Every critical business rule must have explicit behavioral tests for its success and failure paths, even when the coverage targets are already met.
- Exclude only generated code, configuration, and framework bootstrap code, and list each exclusion with a justification. Excluded code does not count as tested business behavior.
- Do not write tests solely to raise coverage numbers.

### Module: `local-build-run` v1.0.0

- Document the install, build, test, start, and smoke-check commands in the README.
- Run each documented command successfully before declaring a stage complete.
- Report actual command results. Do not state that a command or test passed unless it was run.

## API Contract and Documentation

### Module: `openapi-swagger` v1.0.0

- Document every implemented HTTP endpoint in an OpenAPI specification, including request and response schemas, error responses, and examples.
- Serve Swagger UI or the specification at a documented local URL.
- Keep the specification in sync with the implementation; verify it as part of the test suite where practical.

### Module: `postman` v1.0.0

- Provide an importable Postman collection covering every implemented endpoint.
- Include positive and negative requests with assertions on status codes and response bodies.
- Use a Postman environment variable for the base URL. Never store credentials or secrets in the collection.

## Security and Nonfunctional Requirements

### Module: `security-baseline` v1.0.0

- Validate and bound all external input, including size limits.
- Supply secrets through environment variables. Provide a sanitized `.env.example` and ignore real `.env` files in `.gitignore`.
- Never log secrets, tokens, or sensitive personal data.
- Prefer well-maintained dependencies, and add one only when the platform cannot reasonably meet the need.

## Implementation Phases and Priorities

### Stretch goals (user-provided)

No stretch goals were provided. Treat every functional requirement above as must-have.

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
- `java-17-maven` v1.0.0: Java 17 with Maven
- `spring-boot` v1.0.0: Spring Boot service
- `golden-dataset` v1.0.0: Golden dataset
- `unit-tests` v1.0.0: Unit tests
- `integration-tests` v1.0.0: Integration tests
- `coverage-targets` v1.0.0: Coverage targets
- `local-build-run` v1.0.0: Local build and run verification
- `openapi-swagger` v1.0.0: Swagger / OpenAPI documentation
- `postman` v1.0.0: Postman collection
- `security-baseline` v1.0.0: Security baseline
- `fast-delivery` v1.1.0: Fast Mode delivery plan and complexity constraints
- `definition-of-done` v1.0.0: Definition of Done
