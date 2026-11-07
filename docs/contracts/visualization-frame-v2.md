# Visualization frame, schema 2

Status: **defined and parsed** in `src/contract/frame.ts`. The RoadPilot producer sends this version over the local read-only stream. This major version supports live sources whose measurements are legitimately unavailable. Schema 1 remains supported unchanged.

The format, units, coordinate conventions, arrays, and optional `trajectory`, `acc`, and `status` fields match [schema 1](visualization-frame-v1.md). The `schema_version` is `{ "major": 2, "minor": 0 }`.

The producer may include `source.game` as `"ats"` or `"ets2"`. Older producers may omit it or send `null`; readers must keep the frame usable and treat an unknown game string as unavailable. Consumers can use this metadata to reject a map package for a different game.

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

The read-only live source accepts schema 1 and schema 2 JSON messages over `ws://` or `wss://` loopback addresses. RoadPilot currently serves schema 2 at `ws://127.0.0.1:17891`; its server only binds loopback, restricts browser origins, caps clients and input message sizes, and closes the stream when live telemetry is lost. See [the live source notes](../architecture/overview.md#read-only-boundary).
