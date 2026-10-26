import { useEffect, useRef, useState } from 'react'
import type { FileDiffMetadata } from '@pierre/diffs'
import type { PatchEntry } from '../patchIndex'
import { upgradeInWorker } from '../diffWorkerClient'

const ZERO_OID = /^0+$/

/**
 * Upgrades patch-parsed (partial) file diffs to full diffs by fetching the
 * complete old/new file contents, which enables hunk context expansion. The
 * re-processing runs in the background worker. Only files already parsed are
 * considered, so hidden files are never upgraded until the user expands them.
 * Returns a map from entry id to the upgraded metadata.
 */
export function useFullDiffs(
  entries: PatchEntry[],
  parsed: Map<string, FileDiffMetadata>,
  options: { staged: boolean; untracked: boolean },
) {
  const [fullFiles, setFullFiles] = useState<Map<string, FileDiffMetadata>>(() => new Map())
  const requested = useRef(new Set<string>())
  const entriesRef = useRef(entries)

  useEffect(() => {
    if (entriesRef.current !== entries) {
      entriesRef.current = entries
      requested.current = new Set()
      setFullFiles(new Map())
    }
    for (const entry of entries) {
      const file = parsed.get(entry.id)
      if (!file || !file.isPartial || file.hunks.length === 0) continue
      if (file.type !== 'change' && file.type !== 'rename-changed') continue
      const prevOid = file.prevObjectId
      if (!prevOid || ZERO_OID.test(prevOid) || !file.newObjectId) continue
      if (requested.current.has(entry.id)) continue
      requested.current.add(entry.id)

      const params = new URLSearchParams({
        path: file.name,
        oldOid: prevOid,
        newOid: file.newObjectId ?? '',
        staged: String(options.staged),
        untracked: String(options.untracked),
      })
      fetch(`/api/file-versions?${params}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { old: string; new: string } | null) => {
          if (!data || entriesRef.current !== entries) return null
          return upgradeInWorker(entry.id, data.old, data.new)
        })
        .then((upgraded) => {
          if (!upgraded || entriesRef.current !== entries) return
          setFullFiles((prev) => new Map(prev).set(entry.id, upgraded))
        })
        .catch(() => {})
    }
  }, [entries, parsed, options.staged, options.untracked])

  return fullFiles
}
