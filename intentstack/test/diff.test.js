import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { diffPlannedFileSets, diffPlannedFiles, formatDiff } from '../src/diff.js'

test('diffPlannedFiles compares planned output with managed files on disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-diff-'))
  try {
    mkdirSync(join(dir, 'src/generated'), { recursive: true })
    writeFileSync(join(dir, 'src/generated/a.ts'), 'same\n')
    writeFileSync(join(dir, 'src/generated/b.ts'), 'old\n')
    writeFileSync(join(dir, 'src/generated/old.ts'), 'stale\n')

    const diff = diffPlannedFiles({
      'src/generated/a.ts': 'same\n',
      'src/generated/b.ts': 'new\n',
      'root.txt': 'root\n',
    }, dir, ['src/generated'])

    assert.equal(diff.hasChanges, true)
    assert.deepEqual(diff.counts, { add: 1, change: 1, remove: 1, same: 1 })
    assert.ok(diff.entries.some((e) => e.kind === 'add' && e.path === 'root.txt'))
    assert.ok(diff.entries.some((e) => e.kind === 'change' && e.path === 'src/generated/b.ts' && e.line === 1))
    assert.ok(diff.entries.some((e) => e.kind === 'remove' && e.path === 'src/generated/old.ts'))
    assert.match(formatDiff(diff), /Summary: 1 add, 1 change, 1 remove, 1 unchanged/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('diffPlannedFileSets compares before and after planned output', () => {
  const diff = diffPlannedFileSets(
    { 'a.ts': 'same\n', 'b.ts': 'old\n', 'old.ts': 'stale\n' },
    { 'a.ts': 'same\n', 'b.ts': 'new\n', 'new.ts': 'added\n' },
  )
  assert.deepEqual(diff.counts, { add: 1, change: 1, remove: 1, same: 1 })
  assert.match(formatDiff(diff), /~ b\.ts/)
})
