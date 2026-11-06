# Development phases

| Phase | Scope                                                                                                                                                                                                           | Status      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 0     | Housekeeping: pinned dependencies, ESLint, Prettier, Vitest, self-hosted fonts, ADRs                                                                                                                            | Done        |
| 1     | Foundation: domain model, data source interface, deterministic simulation, playback clock, store, data-driven dashboard, frame contract v1                                                                      | Done        |
| 2     | Canvas 2D renderer with camera (pan, zoom, ego-follow) and independent layers                                                                                                                                   | Done        |
| 3     | Telemetry and debug panels: steering, curvature, ACC, time series, event log, stale-data indicator                                                                                                              | Planned     |
| 4     | Scenario library, session recording and replay                                                                                                                                                                  | Planned     |
| 5     | RoadPilot-Map package loader (worker, spatial index), estimated curve view, graph summary and selectable topology sample, full graph inspection and status-filtered topology path inspection, limitations panel | Done        |
| 6     | Live connection: read-only loopback WebSocket consumer for frame v1 with validation and reconnect; RoadPilot producer integration and live verification remain                                                  | In progress |
| 7     | Tauri packaging, Three.js backend                                                                                                                                                                               | Planned     |
