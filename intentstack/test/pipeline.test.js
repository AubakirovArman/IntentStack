import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { verifyGeneratedApp } from '../src/pipeline.js'

test('generated app verification runs npm build when dependencies are available', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-verify-app-'))
  try {
    mkdirSync(join(dir, 'node_modules'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      scripts: { build: 'node build-check.js' },
    }))
    writeFileSync(join(dir, 'build-check.js'), "require('fs').writeFileSync('built.txt', 'ok')\n")
    const result = verifyGeneratedApp(dir)
    assert.deepEqual(result, { status: 'ok', command: 'npm run build' })
    assert.equal(existsSync(join(dir, 'built.txt')), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
