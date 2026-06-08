import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../src/index.js', import.meta.url))
const root = fileURLToPath(new URL('../../', import.meta.url))

function run(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    ...options,
  })
}

test('verify checks examples across both supported targets', () => {
  const res = run(['verify', '--examples', 'intentstack/examples', '--targets', 'web_ts_minimal,next_shadcn'])
  assert.equal(res.status, 0, res.stderr)
  assert.match(res.stdout, /ok verify passed/)
  assert.match(res.stdout, /landing -> web_ts_minimal/)
  assert.match(res.stdout, /dashboard_crud -> next_shadcn/)
})


test('docs command generates a static documentation site', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-docs-'))
  try {
    const out = join(dir, 'site')
    const res = run(['docs', '--project', 'intentstack', '--out', out])
    assert.equal(res.status, 0, res.stderr)
    assert.equal(existsSync(join(out, 'index.html')), true)
    assert.equal(existsSync(join(out, 'ai-agent.html')), true)
    assert.match(readFileSync(join(out, 'index.html'), 'utf8'), /IntentStack Docs/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})


test('graph exports a Core IR summary as JSON', () => {
  const res = run(['graph', '--project', 'demo', '--json'])
  assert.equal(res.status, 0, res.stderr)
  const data = JSON.parse(res.stdout)
  assert.equal(data.project.id, 'voice_agent_site')
  assert.ok(data.entities.some((e) => e.id === 'Lead'))
  assert.ok(data.pages.some((p) => p.id === 'home'))
  assert.equal(data.modules.modular, false)

  const normalized = run(['graph', '--project', 'demo', '--json', '--normalized'])
  assert.equal(normalized.status, 0, normalized.stderr)
  const normalizedData = JSON.parse(normalized.stdout)
  assert.ok(normalizedData.normalized.pages[0].sections[0].id)
  assert.ok(normalizedData.normalized.pages.some((page) =>
    (page.sections || []).some((section) => Array.isArray(section.fields) && section.fields.some((field) => field.ref)),
  ))
})


test('graph exports module metadata for modular projects', () => {
  const res = run(['graph', '--project', 'intentstack/examples/modular_site', '--json'])
  assert.equal(res.status, 0, res.stderr)
  const data = JSON.parse(res.stdout)
  assert.equal(data.project.id, 'modular_site_example')
  assert.equal(data.modules.modular, true)
  assert.ok(data.modules.source_files.some((file) => /shared[\\/]navigation\.yaml$/.test(file)))
  assert.match(data.modules.owners.entities.Lead.file, /backend[\\/]entities[\\/]lead\.entity\.yaml$/)
})


test('graph exports an HTML visual graph', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-graph-'))
  try {
    const out = join(dir, 'graph.html')
    const res = run(['graph', '--project', 'demo', '--html', out])
    assert.equal(res.status, 0, res.stderr)
    assert.equal(existsSync(out), true)
    const html = readFileSync(out, 'utf8')
    assert.match(html, /Pages and Sections/)
    assert.match(html, /Patch Builder/)
    assert.match(html, /function updatePatch/)
    assert.match(html, /voice_agent_site/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})


test('graph HTML renders module graph for modular projects', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-module-graph-'))
  try {
    const out = join(dir, 'graph.html')
    const res = run(['graph', '--project', 'intentstack/examples/modular_site', '--html', out])
    assert.equal(res.status, 0, res.stderr)
    const html = readFileSync(out, 'utf8')
    assert.match(html, /Modules/)
    assert.match(html, /shared[\\/]navigation\.yaml/)
    assert.match(html, /backend[\\/]entities[\\/]lead\.entity\.yaml/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
