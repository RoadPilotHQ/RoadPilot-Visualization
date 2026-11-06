# Visualization frame, schema 1

Status: **defined and implemented** in `src/contract/frameV1.ts` (validation, mapping to the domain model, serialization). No producer other than the simulation exists yet.

This document specifies the format that RoadPilot (or any other producer, or a recording) uses to send scene data to RoadPilot-Visualization. It is owned by this repository. RoadPilot has not defined its output side yet; when it does, it can produce this format directly, or a small adapter can translate.

The contract is one-directional: producer to Visualization. It contains no commands.

## Overview

|                |                                                                           |
| -------------- | ------------------------------------------------------------------------- |
| Format name    | `roadpilot-visualization-frame`                                           |
| Schema version | `1.0` (`major` 1, `minor` 0)                                              |
| Encoding       | UTF-8 JSON, one frame per message                                         |
| Recordings     | JSON Lines, one frame per line                                            |
| Frame          | x = east, y = north, metres, seconds, radians (counter-clockwise from +x) |

Field names are `snake_case`, and units are part of the name suffix: `_m`, `_mps`, `_rad`, `_s`, `_per_m`.

## Compatibility rules

- A reader **ignores unknown fields**.
- A reader accepts the **same major version** and any minor version. A different major version is rejected with an error.
- Unknown values of enumerations are read as `unknown` (or `off` for ACC state) instead of rejecting the frame.
- New optional fields are added in minor versions. Removing or changing the meaning of a field needs a new major version.
- Numbers must be finite. `NaN` and infinity are invalid (JSON cannot represent them anyway).

## Frame

| Field            | Type           | Required         | Meaning                                                                 |
| ---------------- | -------------- | ---------------- | ----------------------------------------------------------------------- |
| `format`         | string         | yes              | Always `roadpilot-visualization-frame`                                  |
| `schema_version` | object         | yes              | `major`, `minor` (integers)                                             |
| `source`         | object         | yes              | `id`: non-empty string that identifies the producer                     |
| `sequence`       | integer        | yes              | Increases by one per frame from one producer; gaps indicate lost frames |
| `timestamp_s`    | number         | yes              | Time on the producer's clock in seconds                                 |
| `ego`            | object         | yes              | See below                                                               |
| `agents`         | array          | no, default `[]` | Other traffic participants                                              |
| `signals`        | array          | no, default `[]` | Traffic lights                                                          |
| `lanes`          | array          | no, default `[]` | Lane geometry near the ego vehicle                                      |
| `trajectory`     | object or null | no               | The planned trajectory, as reported                                     |
| `acc`            | object or null | no               | Adaptive Cruise Control information, as reported                        |
| `inputs`         | object or null | no               | Observed vehicle inputs                                                 |
| `status`         | array          | no, default `[]` | Status lines shown in the planner status panel                          |

### `ego`

| Field                 | Type       | Meaning                                    |
| --------------------- | ---------- | ------------------------------------------ |
| `position`            | `{x, y}`   | Centre of the vehicle, metres              |
| `heading_rad`         | number     | Counter-clockwise from +x (east)           |
| `speed_mps`           | number     | Speed in metres per second                 |
| `steering_angle_rad`  | number     | Observed road-wheel angle, positive = left |
| `curvature_per_m`     | number     | Signed path curvature, positive = left     |
| `length_m`, `width_m` | number > 0 | Vehicle dimensions                         |

### `agents[]`

`id` (non-empty string), `kind` (`car`, `truck`, `bus`, `motorcycle`, `pedestrian`, `unknown`), `position`, `heading_rad`, `speed_mps`, `length_m`, `width_m`.

### `signals[]`

`id`, `position`, `state` (`red`, `yellow`, `green`, `off`, `unknown`), `remaining_s` (number or null: seconds until the expected change).

### `lanes[]`

`id`, `centerline`, `left_boundary`, `right_boundary`: each an array of `{x, y}` points in driving direction.

### `trajectory`

`points`: array of `{x, y, speed_mps, curvature_per_m}`. `speed_mps` and `curvature_per_m` may be null or omitted.

### `acc`

`state` (`off`, `standby`, `active`, `overridden`, `fault`), `set_speed_mps`, `target_speed_mps`, `target_gap_s`, `lead_object_id` (id of an entry in `agents`, or null), `lead_distance_m` (bumper-to-bumper). All except `state` may be null or omitted.

### `inputs`

`steering` (normalized, positive = left), `throttle` (0 to 1), `brake` (0 to 1). These are readings of what the vehicle is doing, never commands.

### `status[]`

`id`, `label`, `state` (`active`, `idle`, `waiting`, `fault`, `unknown`), `text` (short display text).

## Example

```json
{
  "format": "roadpilot-visualization-frame",
  "schema_version": { "major": 1, "minor": 0 },
  "source": { "id": "roadpilot" },
  "sequence": 1042,
  "timestamp_s": 34.7,
  "ego": {
    "position": { "x": 12458.2, "y": 837.6 },
    "heading_rad": 1.5708,
    "speed_mps": 20.1,
    "steering_angle_rad": -0.012,
    "curvature_per_m": -0.0024,
    "length_m": 7.5,
    "width_m": 2.55
  },
  "agents": [
    {
      "id": "truck-0018",
      "kind": "truck",
      "position": { "x": 12458.2, "y": 900.0 },
      "heading_rad": 1.5708,
      "speed_mps": 20.0,
      "length_m": 12,
      "width_m": 2.55
    }
  ],
  "acc": {
    "state": "active",
    "set_speed_mps": 22.2,
    "lead_object_id": "truck-0018",
    "lead_distance_m": 46.8
  }
}
```

## Open points

- The live source currently accepts this schema over a loopback WebSocket (`ws://` or `wss://`). The producer and server-side origin/authentication policy are not implemented yet.
- The consumer reconnects with bounded exponential backoff. Producer frame rate and back-pressure remain to be defined with RoadPilot during Phase 6.
- Map data does not travel in frames. It comes from RoadPilot-Map's own export, and its coordinates are in the unconfirmed map world unit (see the architecture overview). A producer that sends `lanes` must send them in metres.
