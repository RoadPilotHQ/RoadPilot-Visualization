# 0002: The application is strictly read-only

Status: accepted

## Context

RoadPilot-Visualization is a viewer and debugging tool. Driving decisions and vehicle control belong to the main RoadPilot application. A convenience feature in a debug tool must never become a control path.

## Decision

- Visualization contains no steering, braking or driving decisions.
- `DataSource` has no method that sends data to the producer.
- Values such as trajectory, ACC state and vehicle inputs are displayed as reported and are never computed here.
- ESLint forbids `fetch`, `WebSocket`, `EventSource` and `XMLHttpRequest` outside `src/sources`.
- RoadPilot and RoadPilot-Map are never modified from this repository.

## Consequences

- Features that need a command channel (for example "set ACC speed from the debug panel") are out of scope.
- Derived values (lane offset, lookahead length) are allowed when they only describe reported data.
- The lint rule is a guardrail. Code review is still required for new sources.
