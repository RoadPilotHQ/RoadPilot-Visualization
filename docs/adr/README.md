# Architecture decision records

| ADR                                                  | Decision                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| [0001](0001-renderer-independent-scene-model.md)     | Renderer-independent scene model, Canvas 2D first, Three.js later |
| [0002](0002-read-only-visualization.md)              | The application is strictly read-only                             |
| [0003](0003-coordinates-and-unconfirmed-map-unit.md) | Centralized coordinates, no assumption that map units are metres  |
| [0004](0004-own-frame-contract.md)                   | Visualization owns the `roadpilot-visualization-frame` contract   |
| [0005](0005-browser-first-pinned-dependencies.md)    | Browser-first development, Tauri later, pinned dependencies       |
