# Visualization frame, schema 2

Status: **defined and parsed** in `src/contract/frameV1.ts`. This major version supports live sources whose measurements are legitimately unavailable. Schema 1 remains supported unchanged.

The format, units, coordinate conventions, arrays, and optional `trajectory`, `acc`, and `status` fields match [schema 1](visualization-frame-v1.md). The `schema_version` is `{ "major": 2, "minor": 0 }`.

## Nullable ego readings

In schema 2, each of the following `ego` fields is required but may be `null` when the producer does not have a valid reading:

| Field                | Type                      | Meaning                                              |
| -------------------- | ------------------------- | ---------------------------------------------------- |
| `position`           | `{x, y}` or `null`        | Vehicle position in metres, x east and y north       |
| `heading_rad`        | number or `null`          | Counter-clockwise from +x (east)                     |
| `speed_mps`          | number or `null`          | Signed speed in metres per second                    |
| `steering_angle_rad` | number or `null`          | Observed road-wheel angle, positive = left           |
| `curvature_per_m`    | number or `null`          | Reported or explicitly derived signed path curvature |
| `length_m`           | positive number or `null` | Vehicle length, only when known                      |
| `width_m`            | positive number or `null` | Vehicle width, only when known                       |

`inputs`, when present, requires `steering`, `throttle`, and `brake`; each value may independently be `null`. `null` means unavailable, never zero. Producers must not substitute estimated vehicle dimensions, positions, angles, or inputs.

All other schema 1 fields retain their schema 1 validation and meaning. Readers for schema 2 accept only the same major version and ignore unknown fields. A schema 1 reader must reject schema 2, as required by the major-version rule.

## Live transport

The read-only live source accepts schema 1 and schema 2 JSON messages over `ws://` or `wss://` loopback addresses. The RoadPilot producer and its server-side origin policy are not implemented yet. See [the live source notes](../architecture/overview.md#read-only-boundary).
