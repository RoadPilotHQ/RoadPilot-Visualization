export interface NavigationGraphInspectionIndex {
  readonly nodeCount: number
  readonly edgeCount: number
  readonly positions: Float64Array
  readonly altitudes: Float64Array
  readonly nodeKinds: Uint8Array
  readonly nodeMapIds: BigUint64Array
  readonly nodeOwnerIds: BigUint64Array
  /** Packed per-node index/arm/slot values; 0xffffffff marks an absent value. */
  readonly nodeDetails: Uint32Array
  /** 0 none, 1 left, 2 right. */
  readonly nodeSides: Uint8Array
  /** Packed edge from/to pairs, ordered by from-node. */
  readonly edgeEndpoints: Uint32Array
  readonly edgeStatuses: Uint8Array
  readonly edgeCategoryCodes: Uint32Array
  readonly edgeSourceIds: BigUint64Array
  readonly edgeOffsets: Uint32Array
  readonly categories: readonly string[]
  readonly edgeRules: ReadonlyMap<
    number,
    readonly { readonly name: string; readonly resolved: boolean }[]
  >
}

export interface NavigationGraphNodeDetails {
  readonly id: number
  readonly kind: string
  readonly mapNodeId: string
  readonly position: readonly [number, number, number] | null
  readonly ownerId: string | null
  readonly side: 'left' | 'right' | null
  readonly index: number | null
  readonly arm: number | null
  readonly slot: number | null
}

export interface NavigationGraphEdgeDetails {
  readonly id: number
  readonly from: number
  readonly to: number
  readonly status: string
  readonly category: string
  readonly sourceId: string
  readonly rules: readonly { readonly name: string; readonly resolved: boolean }[]
}

export interface NavigationGraphPathResult {
  readonly status: 'found' | 'not-found' | 'invalid' | 'unavailable'
  readonly from: number
  readonly to: number
  readonly totalEdges: number
  readonly exploredNodes: number
  readonly steps: readonly NavigationGraphEdgeDetails[]
  readonly truncated: boolean
}

const NODE_KIND_NAMES = ['lane_entry', 'lane_exit', 'prefab_input', 'prefab_output'] as const
const EDGE_STATUS_NAMES = ['confirmed', 'candidate', 'unknown', 'forbidden'] as const
const ABSENT = 0xffffffff
const MAX_PATH_STEPS = 250

export function inspectNavigationNode(
  index: NavigationGraphInspectionIndex | null,
  id: number,
): NavigationGraphNodeDetails | null {
  if (!index || !Number.isSafeInteger(id) || id < 0 || id >= index.nodeCount) return null
  const kindCode = index.nodeKinds[id]!
  const detailOffset = id * 3
  const positionOffset = id * 2
  const x = index.positions[positionOffset]!
  const z = index.positions[positionOffset + 1]!
  const ownerId = index.nodeOwnerIds[id]!
  return {
    id,
    kind: NODE_KIND_NAMES[kindCode] ?? 'unknown',
    mapNodeId: index.nodeMapIds[id]!.toString(16),
    position: Number.isFinite(x) && Number.isFinite(z) ? [x, index.altitudes[id]!, z] : null,
    ownerId:
      kindCode === 0 || kindCode === 1 || kindCode === 2 || kindCode === 3
        ? ownerId.toString(16)
        : null,
    side: index.nodeSides[id] === 1 ? 'left' : index.nodeSides[id] === 2 ? 'right' : null,
    index: readOptional(index.nodeDetails[detailOffset]!),
    arm: readOptional(index.nodeDetails[detailOffset + 1]!),
    slot: readOptional(index.nodeDetails[detailOffset + 2]!),
  }
}

export function inspectNavigationEdge(
  index: NavigationGraphInspectionIndex | null,
  id: number,
): NavigationGraphEdgeDetails | null {
  if (!index || !Number.isSafeInteger(id) || id < 0 || id >= index.edgeCount) return null
  const offset = id * 2
  const status = index.edgeStatuses[id]!
  const categoryCode = index.edgeCategoryCodes[id]!
  return {
    id,
    from: index.edgeEndpoints[offset]!,
    to: index.edgeEndpoints[offset + 1]!,
    status: EDGE_STATUS_NAMES[status] ?? 'unknown',
    category: index.categories[categoryCode] ?? 'unknown',
    sourceId: index.edgeSourceIds[id]!.toString(16),
    rules: index.edgeRules.get(id) ?? [],
  }
}

export function inspectNavigationPath(
  index: NavigationGraphInspectionIndex | null,
  from: number,
  to: number,
  allowedStatuses: readonly string[],
): NavigationGraphPathResult {
  const unavailable = (status: NavigationGraphPathResult['status']): NavigationGraphPathResult => ({
    status,
    from,
    to,
    totalEdges: 0,
    exploredNodes: 0,
    steps: [],
    truncated: false,
  })
  if (!index) return unavailable('unavailable')
  if (
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= index.nodeCount ||
    to >= index.nodeCount
  ) {
    return unavailable('invalid')
  }
  if (from === to) return { ...unavailable('found'), totalEdges: 0 }
  const allowed = new Uint8Array(4)
  for (const status of allowedStatuses) {
    const code = EDGE_STATUS_NAMES.indexOf(status as (typeof EDGE_STATUS_NAMES)[number])
    if (code >= 0) allowed[code] = 1
  }
  if (allowed.every((value) => value === 0)) return unavailable('not-found')

  const visited = new Uint8Array(index.nodeCount)
  const previousNode = new Int32Array(index.nodeCount)
  const previousEdge = new Int32Array(index.nodeCount)
  previousNode.fill(-1)
  previousEdge.fill(-1)
  const queue = new Uint32Array(index.nodeCount)
  let head = 0
  let tail = 0
  let exploredNodes = 0
  queue[tail++] = from
  visited[from] = 1

  while (head < tail) {
    const node = queue[head++]!
    exploredNodes += 1
    for (
      let edgeId = index.edgeOffsets[node]!;
      edgeId < index.edgeOffsets[node + 1]!;
      edgeId += 1
    ) {
      if (!allowed[index.edgeStatuses[edgeId]!]!) continue
      const nextNode = index.edgeEndpoints[edgeId * 2 + 1]!
      if (visited[nextNode]) continue
      visited[nextNode] = 1
      previousNode[nextNode] = node
      previousEdge[nextNode] = edgeId
      if (nextNode === to) {
        head = tail
        break
      }
      queue[tail++] = nextNode
    }
  }

  if (!visited[to]) {
    return { ...unavailable('not-found'), exploredNodes }
  }
  const edgeIds: number[] = []
  for (let node = to; node !== from; node = previousNode[node]!) {
    const edgeId = previousEdge[node]!
    if (edgeId < 0) return { ...unavailable('not-found'), exploredNodes }
    edgeIds.push(edgeId)
  }
  edgeIds.reverse()
  const steps = edgeIds
    .slice(0, MAX_PATH_STEPS)
    .map((edgeId) => inspectNavigationEdge(index, edgeId)!)
  return {
    status: 'found',
    from,
    to,
    totalEdges: edgeIds.length,
    exploredNodes,
    steps,
    truncated: edgeIds.length > steps.length,
  }
}

function readOptional(value: number) {
  return value === ABSENT ? null : value
}
