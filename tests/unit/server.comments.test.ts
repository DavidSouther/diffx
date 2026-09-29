import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/server.js'

function fixtureClientDir(): string {
  return mkdtempSync(join(tmpdir(), 'diffx-server-comments-'))
}

async function createComment(app: ReturnType<typeof createApp>) {
  const res = await app.request('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filePath: 'greet.ts',
      side: 'additions',
      lineNumber: 2,
      lineContent: '+ line',
      body: 'original text',
    }),
  })
  return res.json()
}

describe('PUT /api/comments/:id', () => {
  it("editing a comment's body sets editedAt and keeps id, anchor, status, replies", async () => {
    const app = createApp({ clientDir: fixtureClientDir() })
    const created = await createComment(app)

    const res = await app.request(`/api/comments/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'new text' }),
    })

    expect(res.status).toBe(200)
    const updated = await res.json()
    expect(updated.body).toBe('new text')
    expect(typeof updated.editedAt).toBe('number')
    expect(updated.id).toBe(created.id)
    expect(updated.status).toBe(created.status)
    expect(updated.filePath).toBe(created.filePath)
    expect(updated.side).toBe(created.side)
    expect(updated.lineNumber).toBe(created.lineNumber)
    expect(updated.replies).toEqual(created.replies)
  })

  it('rejects an empty body with 400 and does not change the stored comment', async () => {
    const app = createApp({ clientDir: fixtureClientDir() })
    const created = await createComment(app)

    const res = await app.request(`/api/comments/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '' }),
    })

    expect(res.status).toBe(400)
    const all = await (await app.request('/api/comments')).json()
    expect(all[0].body).toBe(created.body)
    expect(all[0].editedAt).toBeUndefined()
  })

  it('rejects a non-string body with 400 and does not change the stored comment', async () => {
    const app = createApp({ clientDir: fixtureClientDir() })
    const created = await createComment(app)

    const res = await app.request(`/api/comments/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 42 }),
    })

    expect(res.status).toBe(400)
    const all = await (await app.request('/api/comments')).json()
    expect(all[0].body).toBe(created.body)
  })

  it('does not set or advance editedAt when the body is unchanged', async () => {
    const app = createApp({ clientDir: fixtureClientDir() })
    const created = await createComment(app)

    const res = await app.request(`/api/comments/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: created.body }),
    })

    expect(res.status).toBe(200)
    const updated = await res.json()
    expect(updated.editedAt).toBeUndefined()
  })

  it('still updates status when body is not provided', async () => {
    const app = createApp({ clientDir: fixtureClientDir() })
    const created = await createComment(app)

    const res = await app.request(`/api/comments/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    })

    expect(res.status).toBe(200)
    const updated = await res.json()
    expect(updated.status).toBe('resolved')
    expect(updated.editedAt).toBeUndefined()
  })
})
