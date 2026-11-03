/** Independently switchable visualization layers. Shared by the store, the UI and renderers. */

export const LAYER_IDS = [
  'road',
  'lanes',
  'traffic',
  'lights',
  'trajectory',
  'labels',
  'grid',
] as const

export type LayerId = (typeof LAYER_IDS)[number]

export type LayerVisibility = Readonly<Record<LayerId, boolean>>

export const DEFAULT_LAYERS: LayerVisibility = {
  road: true,
  lanes: true,
  traffic: true,
  lights: true,
  trajectory: true,
  labels: true,
  grid: true,
}
