# 0001: Renderer-independent scene model, Canvas 2D first, Three.js later

Status: accepted

## Context

The application must show a detailed 2D driving view now and should allow 3D later. Rendering with hundreds of SVG nodes per frame does not scale, and a renderer that reads from data sources directly would be hard to replace.

## Decision

- All renderers consume only the immutable `SceneFrame` (`src/domain/scene.ts`) and shared camera math.
- The first production renderer is Canvas 2D behind a `Renderer` interface. A Three.js backend can be added as a second implementation.
- The Phase 1 SVG view was temporary and has been replaced by the Canvas 2D renderer in Phase 2. The `Renderer` interface (`src/render/Renderer.ts`) was introduced with it.
- `render` may import only `domain` (enforced by ESLint).

## Consequences

- Adding 3D does not change data models or sources.
- Anything a renderer needs beyond `SceneFrame` must be added to the scene model first.
- If Canvas 2D proves too slow, a different 2D backend (for example WebGL) can be added behind the same interface.
