import { parseRoadPilotMapPackageV1 } from './mapPackageV1'
import type { RoadPilotMapPackageV1 } from '@/domain/mapPackage'
import type { MapPackageFileIntegrity } from './mapPackageV1'

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
    const files = [request.geometry, ...request.additionalFiles]
    const [manifestText, geometryText, ...integrityResults] = await Promise.all([
      request.manifest.text(),
      request.geometry.text(),
      ...files.map(checksumFile),
    ])
    const verifiedFiles = Object.fromEntries(
      files.map((file, index) => [file.name, integrityResults[index]!]),
    ) as Record<string, MapPackageFileIntegrity>
    const data = parseRoadPilotMapPackageV1(manifestText!, geometryText!, {}, verifiedFiles)
    workerScope.postMessage({ type: 'loaded', data }, [data.coordinates.buffer as ArrayBuffer])
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
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
