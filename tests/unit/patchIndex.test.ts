import { describe, expect, it } from 'vitest'
import { indexPatch, isGeneratedPath, LONG_LINE_LENGTH } from '../../src/ui/patchIndex.js'

function chunk(name: string, lines: string[], oids = ['1111111', '2222222']): string {
  return [
    `diff --git a/${name} b/${name}`,
    `index ${oids[0]}..${oids[1]} 100644`,
    `--- a/${name}`,
    `+++ b/${name}`,
    `@@ -1,1 +1,${lines.length} @@`,
    '-old',
    ...lines.map((l) => `+${l}`),
    '',
  ].join('\n')
}

describe('indexPatch', () => {
  it('lists files with names, oids and +/- counts', () => {
    const { entries } = indexPatch(chunk('src/a.ts', ['one', 'two']) + chunk('b.ts', ['x']))
    expect(entries.map((e) => e.name)).toEqual(['src/a.ts', 'b.ts'])
    expect(entries[0]).toMatchObject({ prevObjectId: '1111111', newObjectId: '2222222', additions: 2, deletions: 1 })
    expect(entries.every((e) => e.hidden === undefined)).toBe(true)
  })

  it('keeps duplicate files as separate entries with distinct ids', () => {
    const { entries } = indexPatch(chunk('a.ts', ['x']) + chunk('a.ts', ['y']))
    expect(entries.map((e) => e.id)).toEqual(['0', '1'])
  })

  it('names deleted files from the --- header', () => {
    const patch = 'diff --git a/gone.ts b/gone.ts\ndeleted file mode 100644\nindex 1234567..0000000\n--- a/gone.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n'
    expect(indexPatch(patch).entries[0].name).toBe('gone.ts')
  })

  it('hides lockfiles as generated', () => {
    const { entries } = indexPatch(chunk('package-lock.json', ['{}']) + chunk('pkg/pnpm-lock.yaml', ['a']))
    expect(entries.map((e) => e.hidden)).toEqual(['generated', 'generated'])
  })

  it('hides files carrying a generated marker', () => {
    const patch = chunk('parser.ts', ['x']).replace('@@ -1,1', '@@ -1,1')
    const marked = patch.replace('-old', '-// @generated\n-old')
    expect(indexPatch(marked).entries[0].hidden).toBe('generated')
  })

  it('hides a single very long line', () => {
    const { entries } = indexPatch(chunk('grammar.js', ['x'.repeat(LONG_LINE_LENGTH + 1)]))
    expect(entries[0].hidden).toBe('long-lines')
  })

  it('hides very large diffs', () => {
    const lines = Array.from({ length: 2_500 }, (_, i) => `line ${i}`)
    expect(indexPatch(chunk('big.ts', lines)).entries[0].hidden).toBe('large')
  })
})

describe('isGeneratedPath', () => {
  it('recognizes common generated paths', () => {
    for (const p of ['yarn.lock', 'a/Cargo.lock', 'x.min.js', 'dist/a.js', 'a/b.pb.go', 'go.sum']) {
      expect(isGeneratedPath(p)).toBe(true)
    }
    expect(isGeneratedPath('src/lock.ts')).toBe(false)
  })
})
