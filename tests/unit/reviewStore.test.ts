import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openReviewStore, reviewIdentityId } from '../../src/reviewStore.js'
import type { ReviewComment, ReviewIdentity } from '../../src/types.js'

let reviewsDir: string

const identity: ReviewIdentity = {
  repoRoot: '/repo',
  args: ['HEAD~1..HEAD'],
  revisions: ['a'.repeat(40), 'b'.repeat(40)],
}

function makeComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: 'c1',
    filePath: 'greet.ts',
    side: 'additions',
    lineNumber: 2,
    lineContent: "  return 'Hi'",
    body: 'a comment',
    status: 'open',
    createdAt: Date.now(),
    replies: [],
    ...overrides,
  }
}

beforeEach(() => {
  reviewsDir = mkdtempSync(join(tmpdir(), 'diffx-review-store-'))
})

afterEach(() => {
  rmSync(reviewsDir, { recursive: true, force: true })
})

describe('FileCommentStore / openReviewStore', () => {
  it('round-trips a comment through a new file', async () => {
    const opened = openReviewStore(reviewsDir, identity)
    await opened.store.add(makeComment())

    const reloaded = openReviewStore(reviewsDir, identity)

    expect(reloaded.restoredCount).toBe(1)
    const comments = await reloaded.store.getAll()
    expect(comments).toHaveLength(1)
    expect(comments[0].body).toBe('a comment')
  })

  it('yields restoredCount 0 and creates no file when nothing has been stored', () => {
    const opened = openReviewStore(reviewsDir, identity)

    expect(opened.restoredCount).toBe(0)
    expect(existsSync(opened.file)).toBe(false)
  })

  it('creates no file after a comment is added and then removed', async () => {
    const opened = openReviewStore(reviewsDir, identity)
    const added = await opened.store.add(makeComment())
    expect(existsSync(opened.file)).toBe(true)

    await opened.store.remove(added.id)

    expect(existsSync(opened.file)).toBe(false)
  })

  it('persists the identity and comments as valid JSON on disk', async () => {
    const opened = openReviewStore(reviewsDir, identity)
    await opened.store.add(makeComment())

    const raw = JSON.parse(readFileSync(opened.file, 'utf-8'))
    expect(raw.version).toBe(1)
    expect(raw.identity).toEqual(identity)
    expect(raw.comments).toHaveLength(1)
  })

  it('hashes two identities that differ only by resolved SHA to different ids', () => {
    const movedIdentity: ReviewIdentity = { ...identity, revisions: ['c'.repeat(40), 'd'.repeat(40)] }

    expect(reviewIdentityId(identity)).not.toBe(reviewIdentityId(movedIdentity))

    // A moved branch opens a new, empty review rather than reusing the old file.
    const opened = openReviewStore(reviewsDir, movedIdentity)
    expect(opened.restoredCount).toBe(0)
  })
})
