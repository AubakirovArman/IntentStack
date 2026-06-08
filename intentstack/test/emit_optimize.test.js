import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildGraph } from '../src/graph.js'
import { emit } from '../src/emit/index.js'
import { optimizeGeneratedFiles } from '../src/emit/optimize.js'

test('generated import optimization removes duplicate import lines only', () => {
  const files = optimizeGeneratedFiles({
    'z-last.ts': 'export const z = 1\n',
    'src/demo.tsx': [
      "import { A } from './a'",
      "import { A } from './a'",
      "import './side-effect'",
      "import './side-effect'",
      'export const value = 1',
      '',
    ].join('\n'),
    'README.md': "import { A } from './a'\nimport { A } from './a'\n",
  })
  assert.equal(files['src/demo.tsx'].match(/import \{ A \}/g).length, 1)
  assert.equal(files['src/demo.tsx'].match(/side-effect/g).length, 1)
  assert.equal(files['README.md'].match(/import \{ A \}/g).length, 2)
  assert.deepEqual(Object.keys(files), ['README.md', 'src/demo.tsx', 'z-last.ts'])
})

test('emit supports cached partial output for preview workflows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-emit-cache-'))
  try {
    const graph = buildGraph({
      version: '0.1',
      project: { id: 'partial_emit', name: 'Partial Emit', target: 'web_ts_minimal' },
      pages: [{ id: 'home', path: '/', sections: [{ id: 'hero', type: 'hero', title: 'Partial' }] }],
    })
    const written = emit(graph, dir, { only: 'src/generated/components/Hero.tsx', clean: false, cache: true })
    assert.deepEqual(written, ['src/generated/components/Hero.tsx'])
    assert.equal(existsSync(join(dir, 'src/generated/components/Hero.tsx')), true)
    assert.equal(existsSync(join(dir, 'package.json')), false)
    const cacheDir = join(dir, '.intentstack/emit-cache')
    assert.ok(readdirSync(cacheDir).some((file) => file.endsWith('.json')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
