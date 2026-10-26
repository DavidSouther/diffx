import type { FileDiffMetadata } from '@pierre/diffs'
import type { PatchEntry } from './patchIndex'
import type { WorkerRequest, WorkerResponse } from './diffWorker'

type Pending = (response: WorkerResponse) => void

let worker: Worker | null = null
let nextRid = 1
const pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./diffWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const resolve = pending.get(event.data.rid)
    pending.delete(event.data.rid)
    resolve?.(event.data)
  }
  return worker
}

function request<T extends WorkerResponse>(message: DistributiveOmit<WorkerRequest, 'rid'>): Promise<T> {
  const rid = nextRid++
  return new Promise<T>((resolve) => {
    pending.set(rid, resolve as Pending)
    getWorker().postMessage({ ...message, rid })
  })
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never

export async function indexPatchInWorker(patch: string): Promise<PatchEntry[]> {
  const res = await request<Extract<WorkerResponse, { kind: 'index' }>>({ kind: 'index', patch })
  return res.entries
}

export async function parseInWorker(id: string): Promise<FileDiffMetadata | null> {
  const res = await request<Extract<WorkerResponse, { kind: 'parse' }>>({ kind: 'parse', id })
  return res.file
}

export async function upgradeInWorker(
  id: string,
  oldContents: string,
  newContents: string,
): Promise<FileDiffMetadata | null> {
  const res = await request<Extract<WorkerResponse, { kind: 'upgrade' }>>({
    kind: 'upgrade',
    id,
    oldContents,
    newContents,
  })
  return res.file
}
