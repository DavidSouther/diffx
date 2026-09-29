import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/server.js'

function fixtureClientDir(): string {
  return mkdtempSync(join(tmpdir(), 'diffx-server-import-'))
}

describe('POST /api/comments/import', () => {
  it('imports comments from a pasted export', async () => {
    const app = createApp({ clientDir: fixtureClientDir() })
    const text = [
      '<code-review-comments>',
      '<file path="greet.ts">',
      '<comment line="2">',
      '<code>+ line</code>',
      'a comment',
      '</comment>',
      '</file>',
      '</code-review-comments>',
    ].join('\n')

    const res = await app.request('/api/comments/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result).toMatchObject({ imported: 1, duplicates: 0, unreadable: 0 })
    expect(result.comments).toHaveLength(1)
  })

  it('rejects text over 1MB with 413 before parsing', async () => {
    const app = createApp({ clientDir: fixtureClientDir() })
    const oversized = 'x'.repeat(1_000_001)

    const res = await app.request('/api/comments/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: oversized }),
    })

    expect(res.status).toBe(413)
  })
})
