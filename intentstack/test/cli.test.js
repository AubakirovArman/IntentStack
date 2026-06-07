import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

test('list_capabilities exposes target capabilities and patch ops as JSON', () => {
  const res = run(['list_capabilities', '--target', 'web_ts_minimal', '--json'])
  assert.equal(res.status, 0, res.stderr)
  const data = JSON.parse(res.stdout)
  assert.ok(data.targets.web_ts_minimal.supported_components.includes('stats'))
  assert.ok(data.targets.web_ts_minimal.supported_components.includes('pricing_cards'))
  assert.ok(data.targets.web_ts_minimal.supported_components.includes('content'))
  assert.ok(data.patch_ops.includes('navigation.set'))
  assert.ok(data.patch_ops.includes('content.block.add'))
  assert.ok(data.patch_ops.includes('page.delete'))
  assert.equal(data.domain_modules.web_crud.status, 'active')
  assert.equal(data.domain_modules.auth_permissions.status, 'partial')
  assert.equal(data.domain_modules.visual_graph.status, 'partial')
})

test('schema command exposes the DSL JSON Schema', () => {
  const res = run(['schema'])
  assert.equal(res.status, 0, res.stderr)
  const schema = JSON.parse(res.stdout)
  assert.equal(schema.title, 'IntentStack Intent DSL v0.1')
  assert.ok(schema.properties.navigation)
  assert.ok(schema.properties.actions.items.properties.type.enum.includes('update_record'))
  assert.ok(schema.properties.pages.items.properties.sections.items.properties.type.enum.includes('content'))
  assert.ok(schema.properties.pages.items.properties.sections.items.properties.type.enum.includes('custom_component'))
})

test('new creates a checkable project and migrate handles v0.1 no-op', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-new-'))
  try {
    const created = run(['new', dir, '--name', 'New App'])
    assert.equal(created.status, 0, created.stderr)
    const checked = run(['check', '--project', dir])
    assert.equal(checked.status, 0, checked.stderr)
    const migrated = run(['migrate', '--project', dir])
    assert.equal(migrated.status, 0, migrated.stderr)
    assert.match(migrated.stdout, /No migration needed/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('doctor validates demo project and reports planned files', () => {
  const res = run(['doctor', '--project', 'demo'])
  assert.equal(res.status, 0, res.stderr)
  assert.match(res.stdout, /ok doctor passed/)
  assert.match(res.stdout, /Plan: \d+ files/)
})

test('stats reports project metrics as JSON', () => {
  const res = run(['stats', '--project', 'demo', '--json'])
  assert.equal(res.status, 0, res.stderr)
  const data = JSON.parse(res.stdout)
  assert.equal(data.project.id, 'voice_agent_site')
  assert.equal(data.counts.entities, 1)
  assert.ok(data.counts.planned_files > 0)
  assert.equal(data.quality.public_dashboard_pages, 1)
  assert.ok(data.diagnostics.codes.includes('W2001'))
})

test('security reports dashboard and mutation findings as JSON', () => {
  const res = run(['security', '--project', 'demo', '--json'])
  assert.equal(res.status, 0, res.stderr)
  const data = JSON.parse(res.stdout)
  assert.equal(data.project.id, 'voice_agent_site')
  assert.equal(data.status, 'warn')
  assert.ok(data.findings.some((item) => item.code === 'SEC_PUBLIC_DASHBOARD'))
  assert.ok(data.findings.some((item) => item.code === 'SEC_PUBLIC_MUTATION'))
})

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

test('apply --write records patch history used by graph HTML', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-history-'))
  try {
    const created = run(['new', dir, '--name', 'History App'])
    assert.equal(created.status, 0, created.stderr)
    const patch = join(dir, 'rename.patch.yaml')
    writeFileSync(patch, 'patch:\n  - op: project.set_name\n    name: Patched History App\n')
    const applied = run(['apply', patch, '--project', dir, '--write'])
    assert.equal(applied.status, 0, applied.stderr)

    const history = join(dir, 'intent', '.intentstack', 'patch-history.ndjson')
    assert.equal(existsSync(history), true)
    assert.match(readFileSync(history, 'utf8'), /project\.set_name/)

    const out = join(dir, 'graph.html')
    const graphed = run(['graph', '--project', dir, '--html', out])
    assert.equal(graphed.status, 0, graphed.stderr)
    assert.match(readFileSync(out, 'utf8'), /Patch History/)
    assert.match(readFileSync(out, 'utf8'), /project\.set_name/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
