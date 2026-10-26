import { useEffect, useRef, useState } from 'react'
import type { FileDiffMetadata } from '@pierre/diffs'
import type { PatchEntry } from '../patchIndex'
import { indexPatchInWorker, parseInWorker } from '../diffWorkerClient'

const NO_ENTRIES: PatchEntry[] = []

/** Indexes a patch in the background worker; `entries` is null until done. */
export function usePatchEntries(patch: string | null) {
  const [state, setState] = useState<{ patch: string | null; entries: PatchEntry[] }>({ patch: null, entries: [] })

  useEffect(() => {
    if (!patch) return
    let cancelled = false
    indexPatchInWorker(patch).then((entries) => {
      if (!cancelled) setState({ patch, entries })
    })
    return () => {
      cancelled = true
    }
  }, [patch])

  const indexing = patch !== null && state.patch !== patch
  return { entries: patch && !indexing ? state.entries : NO_ENTRIES, indexing }
}

/**
 * Parses only the entries named in `wanted`, in the background worker.
 * Hidden entries are never parsed until the caller adds them to `wanted`.
 */
export function useParsedFiles(entries: PatchEntry[], wanted: Set<string>) {
  const [parsed, setParsed] = useState<Map<string, FileDiffMetadata>>(() => new Map())
  const requested = useRef(new Set<string>())
  const entriesRef = useRef(entries)

  useEffect(() => {
    if (entriesRef.current !== entries) {
      entriesRef.current = entries
      requested.current = new Set()
      setParsed(new Map())
    }
    for (const id of wanted) {
      if (requested.current.has(id)) continue
      requested.current.add(id)
      parseInWorker(id).then((file) => {
        if (!file || entriesRef.current !== entries) return
        setParsed((prev) => new Map(prev).set(id, file))
      })
    }
  }, [entries, wanted])

  return parsed
}
