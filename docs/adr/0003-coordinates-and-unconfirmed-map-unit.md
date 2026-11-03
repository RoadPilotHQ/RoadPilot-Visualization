# 0003: Centralized coordinates, no assumption that map units are metres

Status: accepted

## Context

RoadPilot-Map exports positions in a world unit (integer positions divided by 256) with axes east, up, south. The physical size of that unit is unconfirmed (RoadPilot-Map open question G2). Assuming one metre would silently produce wrong distances, speeds and curvature in map views.

## Decision

- The scene frame is defined in metres (x east, y north).
- Map positions are converted only through `src/domain/coordinates.ts`.
- `MAP_UNIT_SCALE` is `{ metresPerUnit: null, status: 'unconfirmed' }`. While it is unconfirmed, `mapWorldToScenePlane` returns points tagged `map-world-unit`.
- Map views must label distances as map units or not show them until the scale is confirmed.
- When the scale is confirmed, only `MAP_UNIT_SCALE` changes.

## Consequences

- Map data and metric simulation data cannot be overlaid truthfully until G2 is resolved.
- Every consumer of converted map data has to look at the unit tag.
