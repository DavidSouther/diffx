import { describe, expect, it } from 'vitest'
import { formatImportMessage } from '../../src/ui/components/ReviewStatusControl.js'

describe('formatImportMessage', () => {
  it('reports a plain import', () => {
    expect(formatImportMessage({ imported: 2, duplicates: 0, unreadable: 0, comments: [] })).toBe('Imported 2 comments.')
  })

  it('reports one imported comment in the singular', () => {
    expect(formatImportMessage({ imported: 1, duplicates: 0, unreadable: 0, comments: [] })).toBe('Imported 1 comment.')
  })

  it('reports a skipped duplicate', () => {
    expect(formatImportMessage({ imported: 1, duplicates: 1, unreadable: 0, comments: [] })).toBe(
      'Imported 1 comment. Skipped 1 duplicate.',
    )
  })

  it('reports an unreadable comment', () => {
    expect(formatImportMessage({ imported: 1, duplicates: 0, unreadable: 1, comments: [] })).toBe(
      'Imported 1 comment. 1 comment could not be read.',
    )
  })

  it('reports nothing found when the paste has no recognizable comments', () => {
    expect(formatImportMessage({ imported: 0, duplicates: 0, unreadable: 0, comments: [] })).toBe(
      'No comments found. Paste the full text from Copy comments.',
    )
  })
})
