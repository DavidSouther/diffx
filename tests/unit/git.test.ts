import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveReviewIdentity } from '../../src/git.js'

const SHA_REGEX = /^[0-9a-f]{40}$/

let repoDir: string
let originalCwd: string

function git(...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd: repoDir,
    stdio: 'pipe',
  })
}

describe('resolveReviewIdentity', () => {
  beforeAll(() => {
    originalCwd = process.cwd()
    repoDir = mkdtempSync(join(tmpdir(), 'diffx-git-test-'))
    git('init', '-q', '-b', 'main')
    writeFileSync(join(repoDir, 'a.txt'), 'one\n')
    git('add', '.')
    git('commit', '-q', '-m', 'base')
    writeFileSync(join(repoDir, 'a.txt'), 'two\n')
    git('add', '.')
    git('commit', '-q', '-m', 'head')
    process.chdir(repoDir)
  })

  afterAll(() => {
    process.chdir(originalCwd)
    rmSync(repoDir, { recursive: true, force: true })
  })

  it('resolves a two-revision range to its commit SHAs, with no head', () => {
    const identity = resolveReviewIdentity(['HEAD~1..HEAD'])

    expect(identity.revisions).toHaveLength(2)
    for (const rev of identity.revisions) {
      expect(rev).toMatch(SHA_REGEX)
    }
    expect(identity.head).toBeUndefined()
  })

  it('carries head for a no-argument (working-tree) identity', () => {
    const identity = resolveReviewIdentity(undefined)

    expect(identity.revisions).toHaveLength(0)
    expect(identity.head).toMatch(SHA_REGEX)
  })

  it('carries head for a single-revision identity', () => {
    const identity = resolveReviewIdentity(['HEAD~1'])

    expect(identity.revisions).toHaveLength(1)
    expect(identity.revisions[0]).toMatch(SHA_REGEX)
    expect(identity.head).toMatch(SHA_REGEX)
  })

  it('resolves the same named revision to a different SHA after the branch moves', () => {
    const before = resolveReviewIdentity(['main'])
    writeFileSync(join(repoDir, 'a.txt'), 'three\n')
    git('add', '.')
    git('commit', '-q', '-m', 'moved')
    const after = resolveReviewIdentity(['main'])

    expect(before.revisions[0]).not.toEqual(after.revisions[0])
  })
})
