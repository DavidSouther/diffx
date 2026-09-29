import { describe, expect, it } from 'vitest'
import { nextUnviewedFile } from '../../src/ui/components/DiffViewer.js'

const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts']

describe('nextUnviewedFile', () => {
  it('returns the following file when it is unviewed', () => {
    expect(nextUnviewedFile(files, 'a.ts', new Set(['a.ts']))).toBe('b.ts')
  })

  it('skips viewed files', () => {
    expect(nextUnviewedFile(files, 'a.ts', new Set(['a.ts', 'b.ts', 'c.ts']))).toBe('d.ts')
  })

  it('returns undefined after the last file', () => {
    expect(nextUnviewedFile(files, 'd.ts', new Set(['d.ts']))).toBeUndefined()
  })

  it('does not wrap to earlier unviewed files', () => {
    expect(nextUnviewedFile(files, 'd.ts', new Set(['d.ts']))).toBeUndefined()
    expect(nextUnviewedFile(files, 'c.ts', new Set(['c.ts', 'd.ts']))).toBeUndefined()
  })
})
