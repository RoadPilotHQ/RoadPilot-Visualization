# 0004: Visualization owns the `roadpilot-visualization-frame` contract

Status: accepted

## Context

RoadPilot has no output interface yet, and the repositories share no source code. Visualization needs a stable input to develop against, and recordings need a file format.

## Decision

- This repository defines and versions `roadpilot-visualization-frame` (see `docs/contracts/visualization-frame-v1.md`).
- The same format is used for live frames and for recordings (JSON Lines).
- Readers ignore unknown fields, require the same major version and accept any minor version.
- RoadPilot can either produce the format directly or use a small adapter. The contract is one-directional and contains no commands.

## Consequences

- Development does not wait for RoadPilot.
- If RoadPilot's needs differ, the contract gets a new minor or major version instead of a private fork.
- Transport (WebSocket or Tauri IPC) is decided separately with the live source.
