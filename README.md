# RoadPilot-Visualization

Standalone visualization and debugging application for the RoadPilot ecosystem.

> **Status: early development.** The application runs in a browser on deterministic simulated data and can load RoadPilot-Map schema 1 packages locally for offline curve inspection. It is not connected to RoadPilot, and there are no releases.

## Purpose

RoadPilot-Visualization shows what the RoadPilot driving stack perceives and plans: road geometry and lanes, the ego vehicle, other traffic, traffic lights, the planned trajectory, steering and curvature, Adaptive Cruise Control information, and telemetry and debugging panels.

## Key responsibilities

- Vehicle visualization
- Lane visualization
- Route visualization (planned; depends on RoadPilot-Map data)
- Telemetry visualization
- Debugging views
- Simulation visualization
- Development tools

RoadPilot-Visualization is intended to be used by the RoadPilot application and by developers working on RoadPilot-Map and the driving logic.

## Scope

It is a separate repository and a separate application. It is a **read-only** viewer:

- It contains no driving decisions and no vehicle control logic.
- It cannot send steering, throttle or brake commands, and it has no channel back to RoadPilot.
- It does not modify RoadPilot or RoadPilot-Map.

## Implemented

| Area                                                             | Status                                                                                                                        |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Dashboard layout (sidebar, metrics, scene, inspector, telemetry) | Data-driven from a `SceneFrame`                                                                                               |
| Scene model (`src/domain`)                                       | Ego, agents, signals, lanes, trajectory, ACC, observed inputs, status                                                         |
| Data source interface and deterministic simulation               | Highway-follow scenario with play, pause, seek and speed                                                                      |
| Playback clock                                                   | Looping timeline, injectable scheduler for tests                                                                              |
| State (Zustand)                                                  | Latest frame, source status, playback state, layer toggles                                                                    |
| `roadpilot-visualization-frame` v1                               | Wire contract with validation and serialization, see [`docs/contracts`](docs/contracts/visualization-frame-v1.md)             |
| 2D renderer                                                      | Canvas 2D with pan, zoom, ego-follow and seven independent layers; drawing runs outside React                                 |
| RoadPilot-Map package                                            | Schema 1 geometry and optional graph validation in a worker; offline curve view, graph summary and selectable topology sample |

Not implemented yet: scenario library, session recording and replay, full unsampled graph browsing and path inspection, live connection to RoadPilot, 3D rendering, Tauri packaging.

## Requirements

- Node.js 22.12 or newer
- npm

Tauri 2 and the Rust toolchain are only needed for the later packaging phase.

## Development

```sh
npm install
npm run dev      # http://127.0.0.1:5173
npm run check    # typecheck, lint, format check and tests
npm run build
```

Dependency versions are pinned exactly in `package.json`. TypeScript is pinned to 6.0.x because `typescript-eslint` does not support TypeScript 7 yet.

## Architecture

```
ui -> state -> sources -> contract -> domain
ui -> render -> domain
```

Rendering, data models and data sources are strictly separated, and the dependency direction is enforced by ESLint. Details are in [`docs/architecture/overview.md`](docs/architecture/overview.md); decisions are recorded in [`docs/adr/`](docs/adr/README.md).

## Coordinates and units

The scene frame uses metres. RoadPilot-Map coordinates use a world unit whose physical size is **not confirmed**, so they are never treated as metres. All conversions live in [`src/domain/coordinates.ts`](src/domain/coordinates.ts). See [the architecture overview](docs/architecture/overview.md#coordinates-and-units).

## Integration with the RoadPilot ecosystem

RoadPilot is split into independent repositories. Each one is developed, versioned and released on its own; there is no monorepo and no shared source code.

| Repository                                                              | Role                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------- |
| [RoadPilot](https://github.com/RoadPilotHQ/RoadPilot)                   | Main desktop application                       |
| [RoadPilot-Map](https://github.com/RoadPilotHQ/RoadPilot-Map)           | Map processing and geographic data             |
| [RoadPilot-Language](https://github.com/RoadPilotHQ/RoadPilot-Language) | Translations and localization                  |
| **RoadPilot-Visualization** (this repository)                           | Visualization components and development tools |
| [RoadPilot-Plugin](https://github.com/RoadPilotHQ/RoadPilot-Plugin)     | Plugin architecture and SDK                    |
| [RoadPilot-Website](https://github.com/RoadPilotHQ/RoadPilot-Website)   | Official website                               |
| [RoadPilot-Discord](https://github.com/RoadPilotHQ/RoadPilot-Discord)   | Discord community infrastructure               |
| [RoadPilot-Docs](https://github.com/RoadPilotHQ/RoadPilot-Docs)         | Central documentation                          |

How Visualization is meant to receive data:

- **RoadPilot** will provide live data through the `roadpilot-visualization-frame` contract. The interface is not defined on the RoadPilot side yet.
- **RoadPilot-Map** provides local map data through its versioned package (`manifest.json`, `geometry.jsonl`, optional `navigation.jsonl`). The current viewer validates schema 1 package integrity, visualizes estimated road curves, summarizes the optional navigation graph, and draws a bounded schematic sample of graph connections from map-node positions. It does not draw lane geometry or routes.

## Roadmap

The development phases and their status are in [`docs/architecture/phases.md`](docs/architecture/phases.md).

## Contributing

RoadPilot is at an early stage and the contribution process is still being defined. Shared guidelines are planned in [RoadPilot-Docs](https://github.com/RoadPilotHQ/RoadPilot-Docs).

Until then, please open an issue before starting any work, so it can be coordinated. All contributions, issues and documentation must be written in English.

## License

Licensing is currently undecided. No license has been selected for this repository yet. Until a license is published here, no permission is granted to use, copy, modify or distribute its contents beyond what the GitHub Terms of Service allow.

## Repository

`git@github.com:RoadPilotHQ/RoadPilot-Visualization.git`

---

Euro Truck Simulator 2 and American Truck Simulator are trademarks of SCS Software. RoadPilot is not an official SCS Software product.
