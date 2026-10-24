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
