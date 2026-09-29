import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CommentBubble } from '../../src/ui/components/CommentBubble'
import type { ReviewComment } from '../../src/types'

function makeComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: 'c1',
    filePath: 'greet.ts',
    side: 'additions',
    lineNumber: 2,
    lineContent: 'line',
    body: 'a comment',
    status: 'open',
    createdAt: Date.now(),
    replies: [],
    ...overrides,
  }
}

function render(comment: ReviewComment): string {
  return renderToStaticMarkup(
    createElement(CommentBubble, { comment, onDelete: () => {}, onEdit: () => {} }),
  )
}

describe('CommentBubble', () => {
  it('renders an Edit comment button for an open comment', () => {
    expect(render(makeComment())).toContain('Edit comment')
  })

  it('renders no Edit comment button for a resolved comment', () => {
    expect(render(makeComment({ status: 'resolved' }))).not.toContain('Edit comment')
  })

  it('shows an edited label when editedAt is set', () => {
    expect(render(makeComment({ editedAt: Date.now() }))).toContain('edited')
  })

  it('shows no edited label when editedAt is absent', () => {
    expect(render(makeComment())).not.toContain('edited')
  })
})
