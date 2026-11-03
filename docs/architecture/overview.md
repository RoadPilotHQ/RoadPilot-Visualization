# Architecture overview

RoadPilot-Visualization is a browser-first TypeScript application (React, Vite, Zustand). It displays data; it never produces driving decisions.

## Layers

```
src/
  domain/     Pure data model and math. No React, no DOM, no imports from other layers.
  contract/   Wire format `roadpilot-visualization-frame` (validation, mapping to domain).
  sources/    Everything that produces frames: simulation, later replay and live.
  state/      Zustand store and the glue that connects a source to the store.
  render/     Renderer-independent camera math, the Renderer interface, the Canvas 2D backend, later Three.js.
  ui/         React components and presentation helpers.
  theme/      Stylesheet and fonts (self-hosted, so the app works offline).
  app/        Composition root: the only place that chooses a concrete data source.
```

Allowed dependencies (enforced by `eslint.config.js`):

| Layer      | May import                           |
| ---------- | ------------------------------------ |
| `domain`   | nothing                              |
| `contract` | `domain`                             |
| `sources`  | `domain`, `contract`                 |
| `state`    | `domain`, `sources`                  |
| `render`   | `domain`                             |
| `ui`       | `domain`, `state`, `render`, `theme` |
| `app`      | everything                           |

In particular, `render` never sees data sources or the store, and `domain` never depends on a framework.

## Data flow

```
DataSource  ->  SceneStore (SceneFrame, status, playback)  ->  UI panels / Renderer
```

- A `DataSource` (`src/sources/DataSource.ts`) emits immutable `SceneFrame` objects and status changes. Sources with a timeline (simulation, replay) also expose a `PlaybackControl`.
- `attachSource` (`src/state/sceneStore.ts`) connects a source to the store. High-frequency timeline ticks are not published to the store; only discrete playback changes are. The current time is `frame.timestampS`.
- UI components and renderers only read from the store.

## Read-only boundary

The application is a viewer. This is enforced structurally:

- `DataSource` has no method for sending data to RoadPilot.
- The scene model contains observed values (`VehicleInputs`, `AccInfo`, `Trajectory`) as reported by the system; nothing in the application computes steering, braking or planning.
- ESLint forbids `fetch`, `WebSocket`, `EventSource` and `XMLHttpRequest` outside `src/sources`.
- The simulation source produces mock input data; it is not a planner.

These checks are guardrails, not a security boundary. Reviewers should keep them in mind when adding a live source.

## Coordinates and units

There are two coordinate systems.

**Scene frame** (all of `SceneFrame`, the renderer, the panels)

- x = east, y = north, units = **metres**, heading in radians counter-clockwise from +x.
- Defined by the `roadpilot-visualization-frame` contract.

**RoadPilot-Map world frame**

- Axes: x = east, y = up, z = south. Positions are integers; dividing by 256 gives the "world unit".
- The physical size of one world unit is **not confirmed** (RoadPilot-Map open question G2). It must not be assumed to be one metre.

All conversions are centralized in `src/domain/coordinates.ts`:

- `MAP_UNIT_SCALE` holds `metresPerUnit: null` and status `unconfirmed`.
- `mapWorldToScenePlane` converts the axes and tags the result with its unit. Until a scale is confirmed the result is tagged `map-world-unit`, and consumers must not show it as metres.
- When the scale is confirmed, only `MAP_UNIT_SCALE` changes.

Limitation: until the scale is confirmed, map data and metric scene data cannot be overlaid truthfully. Map views must label their distances as "map units" or hide them.

## Rendering

Renderers implement `Renderer` (`src/render/Renderer.ts`): `resize`, `render(input)` and `dispose`. A `RenderInput` holds the `SceneFrame`, the layer visibility, the view (pan, zoom, follow) and the scene label. Renderers keep no scene state, only read the scene model, and cannot send anything anywhere.

The first backend is **Canvas 2D** (`src/render/canvas2d`). Drawing is split into painters, one per layer, drawn back to front: background, grid, road, lanes, trajectory, traffic, lights, ego, labels. A painter whose layer is switched off is skipped; the background and the ego vehicle are always drawn. Painters draw only what the frame contains: with no lane data there is no road, and nothing is interpolated or invented.

**Layers** (`src/domain/layers.ts`): road surface, lane boundaries, other vehicles, traffic lights, planned trajectory, labels and overlay, grid. They are independent and live in the scene store.

**View** (`src/render/view.ts`, pure functions):

- `follow` mode: the camera is centred on the ego vehicle and its heading points up.
- Dragging pans and switches to `free` mode: the camera stays fixed in the world with its heading frozen, and the ego vehicle drives across the screen. The Follow button, `F`, or a double-click (which also resets the zoom) returns to follow mode.
- Zoom is limited to 2 to 60 pixels per metre (default 9). In free mode the wheel zooms about the cursor; in follow mode the zoom is about the ego vehicle.
- Keyboard on the focused canvas: `+` and `-` zoom, `F` follows, `0` resets.

**Performance and React.** Drawing happens outside React. `CanvasSceneView` subscribes to the scene store and to a local view store and only calls `RenderController.invalidate()`. The controller draws at most once per animation frame with the newest input, so many store updates between two frames cost one draw. React re-renders only the small toolbar, and only when zoom or mode change. The canvas is sized by the device pixel ratio. Everything runs on the main thread; an OffscreenCanvas worker is possible later behind the same interface if profiling shows a need.

A Three.js backend can be added later as a second `Renderer` without changing the data model, because renderers only consume `RenderInput`.

## Map data

Map data from RoadPilot-Map is static and large. It will be loaded separately from live frames through a loader in `src/sources`, using the RoadPilot-Map navigation graph export (JSON Lines, schema 1.x) that is documented in RoadPilot-Map. Parsing happens in a Web Worker with a spatial index. The map layer shows only what the data contains; it does not invent lane geometry that RoadPilot-Map does not provide yet.

## Testing

Vitest runs in a Node environment. The simulation is a pure function of time, so scenarios are tested as plain data. Time is injected through `FrameScheduler`, so the playback clock is tested without a browser.
