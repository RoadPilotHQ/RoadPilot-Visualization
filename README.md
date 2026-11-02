# RoadPilot-Visualization

RoadPilot-Visualization is the planned set of visualization components and development tools for the RoadPilot ecosystem.

> **Status: early planning.** This repository does not contain source code yet. Responsibilities, architecture and roadmap below describe the **planned** scope, not existing functionality.

## Purpose

This repository is meant to make the internal state of RoadPilot visible, for users and especially for developers who need to understand and debug what the system sees and decides.

## Key responsibilities

- Vehicle visualization
- Lane visualization
- Route visualization
- Telemetry visualization
- Debugging views
- Simulation visualization
- Development tools

## Architecture overview

The following structure is a proposal and may change as development starts:

- **Rendering components**: reusable views for vehicles, lanes and routes.
- **Telemetry views**: displays of vehicle and game telemetry over time.
- **Debugging views**: overlays and inspectors for the internal state of RoadPilot.
- **Simulation views**: visual playback of simulated or recorded driving situations.
- **Developer tools**: standalone utilities built on the components above.

## Integration with the RoadPilot ecosystem

RoadPilot is split into independent repositories. Each one is developed, versioned and released on its own; there is no monorepo and no shared source code.

| Repository | Role |
|---|---|
| [RoadPilot](https://github.com/RoadPilotHQ/RoadPilot) | Main desktop application |
| [RoadPilot-Map](https://github.com/RoadPilotHQ/RoadPilot-Map) | Map processing and geographic data |
| [RoadPilot-Language](https://github.com/RoadPilotHQ/RoadPilot-Language) | Translations and localization |
| **RoadPilot-Visualization** (this repository) | Visualization components and development tools |
| [RoadPilot-Plugin](https://github.com/RoadPilotHQ/RoadPilot-Plugin) | Plugin architecture and SDK |
| [RoadPilot-Website](https://github.com/RoadPilotHQ/RoadPilot-Website) | Official website |
| [RoadPilot-Discord](https://github.com/RoadPilotHQ/RoadPilot-Discord) | Discord community infrastructure |
| [RoadPilot-Docs](https://github.com/RoadPilotHQ/RoadPilot-Docs) | Central documentation |

RoadPilot-Visualization is intended to be used by the RoadPilot application and by developers working on RoadPilot-Map and the driving logic. Its data inputs have not been defined yet.

## Development status

| Area | Status |
|---|---|
| Source code | Not started |
| Architecture | In planning |
| Releases | None |

## Planned roadmap

Planned work, in no fixed order and without dates:

- [ ] Select the rendering technology
- [ ] Define the data inputs for each view
- [ ] Build lane and route visualization
- [ ] Build telemetry visualization
- [ ] Build debugging and simulation views
- [ ] Package the development tools

## Contributing

RoadPilot is at an early stage and the contribution process is still being defined. Shared guidelines are planned in [RoadPilot-Docs](https://github.com/RoadPilotHQ/RoadPilot-Docs).

Until then, please open an issue before starting any work, so it can be coordinated. All contributions, issues and documentation must be written in English.

## License

Licensing is currently undecided. No license has been selected for this repository yet. Until a license is published here, no permission is granted to use, copy, modify or distribute its contents beyond what the GitHub Terms of Service allow.

---

Euro Truck Simulator 2 and American Truck Simulator are trademarks of SCS Software. RoadPilot is not an official SCS Software product.
