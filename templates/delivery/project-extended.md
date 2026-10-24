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
