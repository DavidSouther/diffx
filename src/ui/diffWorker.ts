/// <reference lib="webworker" />
// Background diff work. Every request that scans or parses patch text runs
// here so the UI thread stays responsive on large inputs.
import type { FileDiffMetadata } from '@pierre/diffs'
import { indexPatch } from './patchIndex'
import type { PatchEntry } from './patchIndex'
import { parseChunk, upgradeChunk } from './diffProcessing'

export type WorkerRequest =
  | { rid: number; kind: 'index'; patch: string }
  | { rid: number; kind: 'parse'; id: string }
  | { rid: number; kind: 'upgrade'; id: string; oldContents: string; newContents: string }

export type WorkerResponse =
  | { rid: number; kind: 'index'; entries: PatchEntry[] }
  | { rid: number; kind: 'parse'; file: FileDiffMetadata | null }
  | { rid: number; kind: 'upgrade'; file: FileDiffMetadata | null }

let chunks: string[] = []
const parsed = new Map<string, FileDiffMetadata>()

function respond(message: WorkerResponse) {
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(message)
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data
  if (req.kind === 'index') {
    const indexed = indexPatch(req.patch)
    chunks = indexed.chunks
    parsed.clear()
    respond({ rid: req.rid, kind: 'index', entries: indexed.entries })
  } else if (req.kind === 'parse') {
    const chunk = chunks[Number(req.id)]
    const file = chunk === undefined ? null : parseChunk(chunk)
    if (file) parsed.set(req.id, file)
    respond({ rid: req.rid, kind: 'parse', file })
  } else {
    const chunk = chunks[Number(req.id)]
    const partial = parsed.get(req.id)
    const file =
      chunk === undefined || !partial
        ? null
        : upgradeChunk(chunk, partial, `full:${req.id}`, req.oldContents, req.newContents)
    respond({ rid: req.rid, kind: 'upgrade', file })
  }
}
