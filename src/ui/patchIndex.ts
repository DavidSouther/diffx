import type { FileDiffMetadata } from '@pierre/diffs'

// Cheap, string-only indexing of a unified patch. No @pierre/diffs parsing
// happens here: this runs first (in a worker) so the UI can list every file
// and decide which ones are too expensive to render until asked.

// Newer @pierre/diffs releases require these on FileDiffMetadata; the locked
// 1.2.9 types do not declare them. Spread (rather than a literal) so stubs
// type-check against both.
export const EMPTY_CHARACTER_COUNTS = { deletionCharacterCount: 0, additionCharacterCount: 0 }

export type HiddenReason = 'generated' | 'large' | 'long-lines'

export interface PatchEntry {
  // Position in the patch. Unique even when the same file appears twice
  // (staged + unstaged chunks).
  id: string
  name: string
  prevName?: string
  prevObjectId?: string
  newObjectId?: string
  additions: number
  deletions: number
  size: number
  maxLineLength: number
  hidden?: HiddenReason
}

export interface IndexedPatch {
  entries: PatchEntry[]
  chunks: string[]
}

export const LARGE_CHUNK_SIZE = 200_000
export const LARGE_CHANGED_LINES = 2_000
export const LONG_LINE_LENGTH = 2_000

const GENERATED_BASENAMES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'Cargo.lock',
  'Gemfile.lock',
  'Pipfile.lock',
  'poetry.lock',
  'uv.lock',
  'composer.lock',
  'flake.lock',
  'go.sum',
  'mix.lock',
  'pubspec.lock',
  'Podfile.lock',
  'packages.lock.json',
])
const GENERATED_PATH = /(\.min\.(js|css)|\.map|\.pb\.go|_pb2\.py|\.generated\.[^/]+|\.snap)$|(^|\/)(__generated__|dist|node_modules)\//
const GENERATED_MARKER = /@generated|Code generated .* DO NOT EDIT|auto-?generated/i

export function isGeneratedPath(path: string): boolean {
  const base = path.slice(path.lastIndexOf('/') + 1)
  return GENERATED_BASENAMES.has(base) || GENERATED_PATH.test(path)
}

function chunkName(chunk: string): { name: string; prevName?: string } | null {
  const rename = chunk.match(/^rename from (.+)$/m)
  const prevName = rename ? rename[1].trim() : undefined
  const to = chunk.match(/^\+\+\+ b\/([^\t\r\n]+)/m) ?? chunk.match(/^rename to (.+)$/m)
  if (to) return { name: to[1].trim(), prevName }
  const from = chunk.match(/^--- a\/([^\t\r\n]+)/m)
  if (from) return { name: from[1].trim(), prevName }
  const header = chunk.match(/^diff --git a\/(.+) b\/(.+)$/m)
  if (header) return { name: header[2].trim(), prevName }
  return null
}

// One pass over the chunk: longest line and +/- line counts.
function scanChunk(chunk: string): { additions: number; deletions: number; maxLineLength: number } {
  let additions = 0
  let deletions = 0
  let maxLineLength = 0
  let inHunk = false
  let pos = 0
  while (pos < chunk.length) {
    let end = chunk.indexOf('\n', pos)
    if (end === -1) end = chunk.length
    const length = end - pos
    if (length > maxLineLength) maxLineLength = length
    const c = chunk.charCodeAt(pos)
    if (c === 64 /* @ */ && chunk.charCodeAt(pos + 1) === 64) inHunk = true
    else if (inHunk) {
      if (c === 43 /* + */) additions++
      else if (c === 45 /* - */) deletions++
    }
    pos = end + 1
  }
  return { additions, deletions, maxLineLength }
}

export function classifyHidden(name: string, chunk: string, scan: ReturnType<typeof scanChunk>): HiddenReason | undefined {
  if (isGeneratedPath(name) || GENERATED_MARKER.test(chunk.slice(0, 2_000))) return 'generated'
  if (scan.maxLineLength > LONG_LINE_LENGTH) return 'long-lines'
  if (chunk.length > LARGE_CHUNK_SIZE || scan.additions + scan.deletions > LARGE_CHANGED_LINES) return 'large'
  return undefined
}

export function indexPatch(patch: string): IndexedPatch {
  const entries: PatchEntry[] = []
  const chunks: string[] = []
  for (const chunk of patch.split(/^(?=diff --git )/m)) {
    if (!chunk.startsWith('diff --git ')) continue
    const named = chunkName(chunk)
    if (!named) continue
    const index = chunk.match(/^index ([0-9a-f]+)\.\.([0-9a-f]+)/m)
    const scan = scanChunk(chunk)
    entries.push({
      id: String(entries.length),
      name: named.name,
      prevName: named.prevName,
      prevObjectId: index?.[1],
      newObjectId: index?.[2],
      additions: scan.additions,
      deletions: scan.deletions,
      size: chunk.length,
      maxLineLength: scan.maxLineLength,
      hidden: classifyHidden(named.name, chunk, scan),
    })
    chunks.push(chunk)
  }
  return { entries, chunks }
}

const ZERO_OID = /^0+$/

// A metadata-only stand-in for a file that has not been parsed yet. Carries
// enough (name, oids, type) for the file tree and viewed tracking.
export function entryStub(entry: PatchEntry): FileDiffMetadata {
  const type = entry.prevName
    ? 'rename-changed'
    : entry.prevObjectId && ZERO_OID.test(entry.prevObjectId)
      ? 'new'
      : entry.newObjectId && ZERO_OID.test(entry.newObjectId)
        ? 'deleted'
        : 'change'
  return {
    name: entry.name,
    prevName: entry.prevName,
    prevObjectId: entry.prevObjectId,
    newObjectId: entry.newObjectId,
    type,
    hunks: [],
    splitLineCount: 0,
    unifiedLineCount: 0,
    isPartial: true,
    deletionLines: [],
    additionLines: [],
    ...EMPTY_CHARACTER_COUNTS,
  }
}
