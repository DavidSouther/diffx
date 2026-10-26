import { parsePatchFiles, processFile } from '@pierre/diffs'
import type { FileDiffMetadata } from '@pierre/diffs'

// The fetched contents can diverge from the patch (e.g. the worktree was
// edited after the diff was captured — for unstaged changes the worktree blob
// is usually not in the object database, so the server falls back to reading
// the file from disk). Compare every hunk line from the patch against the
// full contents at the positions the hunk headers claim; reject on mismatch
// so expansion never renders code the displayed patch wasn't built from.
export function contentsMatchHunks(partial: FileDiffMetadata, full: FileDiffMetadata): boolean {
  const norm = (line: string | undefined) => (line ?? '\0').replace(/\r?\n$/, '')
  for (const hunk of partial.hunks) {
    for (let i = 0; i < hunk.additionCount; i++) {
      if (norm(partial.additionLines[hunk.additionLineIndex + i]) !== norm(full.additionLines[hunk.additionStart - 1 + i])) {
        return false
      }
    }
    for (let i = 0; i < hunk.deletionCount; i++) {
      if (norm(partial.deletionLines[hunk.deletionLineIndex + i]) !== norm(full.deletionLines[hunk.deletionStart - 1 + i])) {
        return false
      }
    }
  }
  return true
}

export function parseChunk(chunk: string): FileDiffMetadata | null {
  try {
    return parsePatchFiles(chunk).flatMap((p) => p.files)[0] ?? null
  } catch {
    return null
  }
}

// Re-process a chunk with full old/new contents. Returns null when the full
// diff can't be built or doesn't agree with the patch.
export function upgradeChunk(
  chunk: string,
  partial: FileDiffMetadata,
  cacheKey: string,
  oldContents: string,
  newContents: string,
): FileDiffMetadata | null {
  const upgraded = processFile(chunk, {
    cacheKey,
    oldFile: { name: partial.prevName ?? partial.name, contents: oldContents },
    newFile: { name: partial.name, contents: newContents },
  })
  if (!upgraded || upgraded.isPartial || !contentsMatchHunks(partial, upgraded)) return null
  return upgraded
}
