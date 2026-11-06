import { parseRoadPilotMapPackageV1 } from './mapPackageV1'
import type { RoadPilotMapPackageV1 } from '@/domain/mapPackage'
import type { MapPackageFileIntegrity } from './mapPackageV1'
import { createNavigationGraphV1Accumulator } from './navigationGraphV1'

export interface MapPackageLoadRequest {
  readonly type: 'load'
  readonly manifest: File
  readonly geometry: File
  readonly additionalFiles: readonly File[]
}

export type MapPackageWorkerResponse =
  | { readonly type: 'loaded'; readonly data: RoadPilotMapPackageV1 }
  | { readonly type: 'error'; readonly message: string }

interface MapPackageWorkerScope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<MapPackageLoadRequest>) => void,
  ): void
  postMessage(message: MapPackageWorkerResponse, transfer?: Transferable[]): void
}

const workerScope = self as unknown as MapPackageWorkerScope

workerScope.addEventListener('message', (event) => {
  void load(event.data)
})

async function load(request: MapPackageLoadRequest) {
  try {
    const manifestText = await request.manifest.text()
    const navigationName = navigationFileName(manifestText)
    const navigationFile = request.additionalFiles.find((file) => file.name === navigationName)
    const navigationRead = navigationFile ? readNavigationFile(navigationFile) : null
    const files = [request.geometry, ...request.additionalFiles]
    const [geometryText, ...integrityResults] = await Promise.all([
      request.geometry.text(),
      ...files.map((file) =>
        file === navigationFile
          ? navigationRead!.then((result) => result.integrity)
          : checksumFile(file),
      ),
    ])
    const verifiedFiles = Object.fromEntries(
      files.map((file, index) => [file.name, integrityResults[index]!]),
    ) as Record<string, MapPackageFileIntegrity>
    const parsed = parseRoadPilotMapPackageV1(manifestText, geometryText!, {}, verifiedFiles)
    const navigationGraph = navigationRead ? (await navigationRead).summary : null
    const data: RoadPilotMapPackageV1 = { ...parsed, navigationGraph }
    const transfer: Transferable[] = [data.coordinates.buffer as ArrayBuffer]
    if (data.navigationGraph?.topology) {
      transfer.push(
        data.navigationGraph.topology.positions.buffer as ArrayBuffer,
        data.navigationGraph.topology.edges.buffer as ArrayBuffer,
      )
    }
    workerScope.postMessage({ type: 'loaded', data }, transfer)
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function navigationFileName(manifestText: string): string | null {
  try {
    const value: unknown = JSON.parse(manifestText)
    if (typeof value !== 'object' || value === null || !('files' in value)) return null
    const files = value.files
    if (!Array.isArray(files)) return null
    const navigation = files.find(
      (file): file is { name: string; role: string } =>
        typeof file === 'object' &&
        file !== null &&
        'role' in file &&
        file.role === 'navigation' &&
        'name' in file &&
        typeof file.name === 'string',
    )
    return navigation?.name ?? null
  } catch {
    return null
  }
}

async function readNavigationFile(file: File) {
  const parser = createNavigationGraphV1Accumulator()
  const reader = file.stream().getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let hash = 0xcbf29ce484222325n
  let bytes = 0
  let lineNumber = 0
  let remainder = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      for (const byte of value) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n)
      remainder += decoder.decode(value, { stream: true })
      lineNumber = pushCompleteLines(remainder, parser.push, lineNumber)
      const lastNewline = remainder.lastIndexOf('\n')
      remainder = lastNewline < 0 ? remainder : remainder.slice(lastNewline + 1)
      if (remainder.length > 4 * 1024 * 1024) {
        throw new Error(`navigation.jsonl line ${lineNumber + 1} exceeds the supported line length`)
      }
    }
    remainder += decoder.decode()
    if (remainder.length > 0) parser.push(remainder, lineNumber + 1)
  } finally {
    reader.releaseLock()
  }
  return {
    integrity: { bytes, checksum: hash.toString(16) },
    summary: parser.finish(),
  }
}

function pushCompleteLines(
  text: string,
  push: (line: string, lineNumber: number) => void,
  previousLineCount: number,
) {
  let lineStart = 0
  let lineNumber = previousLineCount
  for (;;) {
    const newline = text.indexOf('\n', lineStart)
    if (newline < 0) return lineNumber
    let line = text.slice(lineStart, newline)
    if (line.endsWith('\r')) line = line.slice(0, -1)
    lineNumber += 1
    push(line, lineNumber)
    lineStart = newline + 1
  }
}

async function checksumFile(file: File): Promise<MapPackageFileIntegrity> {
  const reader = file.stream().getReader()
  let hash = 0xcbf29ce484222325n
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      for (const byte of value) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n)
    }
  } finally {
    reader.releaseLock()
  }
  return { bytes, checksum: hash.toString(16) }
}
