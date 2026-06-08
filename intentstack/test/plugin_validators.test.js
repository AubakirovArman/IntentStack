import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../src/index.js', import.meta.url))
const root = fileURLToPath(new URL('../', import.meta.url))

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' })
}

test('configured validator plugins can add compiler diagnostics', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-validator-plugin-'))
  try {
    mkdirSync(join(dir, 'intent'), { recursive: true })
    mkdirSync(join(dir, 'plugins'), { recursive: true })
    writeFileSync(join(dir, 'intentstack.config.yaml'), `intent: intent/app.intent.yaml
plugins:
  validators:
    - id: naming_policy
      module: plugins/naming-policy.mjs
`)
    writeFileSync(join(dir, 'plugins/naming-policy.mjs'), `export function validateIntent(ast, ctx) {
  if (!String(ast.project?.id || '').startsWith('acme_')) {
    ctx.error('E9001', 'project.id must use the acme_ prefix.', { path: 'project.id' })
  }
}
`)
    writeFileSync(join(dir, 'intent/app.intent.yaml'), `version: 0.1
project:
  id: plugin_validator
  target: web_ts_minimal
pages:
  - id: home
    path: /
    sections:
      - id: hero
        type: hero
        title: Home
`)
    const checked = run(['check', '--project', dir])
    assert.equal(checked.status, 1)
    assert.match(checked.stdout, /E9001/)
    assert.match(checked.stdout, /project\.id must use the acme_ prefix/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
