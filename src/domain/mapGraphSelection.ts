import type { MapNavigationTopology } from './mapPackage'

export type MapGraphSelection =
  | { readonly type: 'node'; readonly id: number }
  | { readonly type: 'edge'; readonly sampleIndex: number }

export function findMapGraphSelection(
  topology: MapNavigationTopology | null,
  width: number,
  height: number,
  pointerX: number,
  pointerY: number,
  zoom: number,
  pan: { readonly x: number; readonly y: number },
): MapGraphSelection | null {
  if (!topology?.bounds || topology.sampledEdgeCount === 0 || width <= 0 || height <= 0) return null
  const { minX, minY, maxX, maxY } = topology.bounds
  const mapWidth = Math.max(maxX - minX, 1)
  const mapHeight = Math.max(maxY - minY, 1)
  const scale = Math.max(
    Math.min((width - 32) / mapWidth, (height - 32) / mapHeight) * zoom,
    0.000001,
  )
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const screenX = (x: number) => width / 2 + pan.x + (x - centerX) * scale
  const screenY = (y: number) => height / 2 + pan.y + (y - centerY) * scale
  let closestNode = -1
  let closestNodeDistance = 9
  for (let index = 0; index < topology.edges.length; index += 5) {
    for (const nodeId of [topology.edges[index + 1]!, topology.edges[index + 2]!]) {
      const offset = nodeId * 2
      const distance = Math.hypot(
        pointerX - screenX(topology.positions[offset]!),
        pointerY - screenY(topology.positions[offset + 1]!),
      )
      if (distance < closestNodeDistance) {
        closestNodeDistance = distance
        closestNode = nodeId
      }
    }
  }
  if (closestNode >= 0) return { type: 'node', id: closestNode }

  let closestEdge = -1
  let closestEdgeDistance = 7
  for (let index = 0; index < topology.edges.length; index += 5) {
    const from = topology.edges[index + 1]! * 2
    const to = topology.edges[index + 2]! * 2
    const distance = pointToSegmentDistance(
      pointerX,
      pointerY,
      screenX(topology.positions[from]!),
      screenY(topology.positions[from + 1]!),
      screenX(topology.positions[to]!),
      screenY(topology.positions[to + 1]!),
    )
    if (distance < closestEdgeDistance) {
      closestEdgeDistance = distance
      closestEdge = index / 5
    }
  }
  return closestEdge >= 0 ? { type: 'edge', sampleIndex: closestEdge } : null
}

function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}
