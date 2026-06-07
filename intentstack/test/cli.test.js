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
  assert.ok(schema.properties.pages.items.properties.sections.items.properties.blocks.items.properties.type.enum.includes('callout'))
  assert.ok(schema.properties.pages.items.properties.sections.items.properties.blocks.items.properties.type.enum.includes('table'))
})

test('new creates a checkable project and migrate handles v0.1 no-op', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-new-'))
  try {
    const created = run(['new', dir, '--name', 'New App'])
    assert.equal(created.status, 0, created.stderr)
    assert.match(readFileSync(join(dir, 'intent/app.intent.yaml'), 'utf8'), /includes:/)
    assert.equal(existsSync(join(dir, 'intent/shared/navigation.yaml')), true)
    assert.equal(existsSync(join(dir, 'intent/backend/entities/lead.entity.yaml')), true)
    assert.equal(existsSync(join(dir, 'intent/frontend/pages/home.page.yaml')), true)
    const checked = run(['check', '--project', dir])
    assert.equal(checked.status, 0, checked.stderr)
    const migrated = run(['migrate', '--project', dir])
    assert.equal(migrated.status, 0, migrated.stderr)
    assert.match(migrated.stdout, /No migration needed/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('split writes a monolith intent into modular files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-split-'))
  try {
    const created = run(['new', dir, '--name', 'Split App', '--single-file'])
    assert.equal(created.status, 0, created.stderr)
    const dryRun = run(['split', '--project', dir])
    assert.equal(dryRun.status, 0, dryRun.stderr)
    assert.match(dryRun.stdout, /frontend\/pages\/home\.page\.yaml/)
    assert.match(dryRun.stdout, /\(dry run/)

    const split = run(['split', '--project', dir, '--write'])
    assert.equal(split.status, 0, split.stderr)
    assert.equal(existsSync(join(dir, 'intent/shared/navigation.yaml')), true)
    assert.equal(existsSync(join(dir, 'intent/backend/entities/lead.entity.yaml')), true)
    assert.equal(existsSync(join(dir, 'intent/backend/actions/create-lead.action.yaml')), true)
    assert.equal(existsSync(join(dir, 'intent/frontend/pages/home.page.yaml')), true)
    assert.equal(existsSync(join(dir, 'intent/frontend/sections/home/hero.section.yaml')), true)
    assert.match(readFileSync(join(dir, 'intent/app.intent.yaml'), 'utf8'), /includes:/)

    const checked = run(['check', '--project', dir])
    assert.equal(checked.status, 0, checked.stderr)
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
  assert.equal(data.modules.modular, false)
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

test('apply --write preserves modular intent files and writes owners', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-modular-apply-'))
  try {
    mkdirSync(join(dir, 'intent/shared'), { recursive: true })
    mkdirSync(join(dir, 'intent/frontend/pages'), { recursive: true })
    mkdirSync(join(dir, 'intent/frontend/sections/docs'), { recursive: true })
    writeFileSync(join(dir, 'intent/app.intent.yaml'), `version: 0.1
project:
  id: modular_apply
  target: web_ts_minimal
includes:
  - shared/*.yaml
  - frontend/pages/*.yaml
  - frontend/sections/**/*.yaml
`)
    writeFileSync(join(dir, 'intent/shared/navigation.yaml'), `navigation:
  logo: Modular Apply
  items:
    - label: Home
      href: /
`)
    writeFileSync(join(dir, 'intent/frontend/pages/docs.yaml'), `page:
  id: docs
  path: /docs
  layout: docs
  sections:
    - ref: docs_content
`)
    writeFileSync(join(dir, 'intent/frontend/sections/docs/content.yaml'), `section:
  id: docs_content
  type: content
  title: Docs
  blocks:
    - id: intro
      type: paragraph
      text: Before
`)
    const patch = join(dir, 'update.patch.yaml')
    writeFileSync(patch, `patch:
  - op: navigation.item.add
    item:
      label: Docs
      href: /docs
  - op: content.block.update
    section: docs_content
    block: intro
    value:
      text: After
`)

    const applied = run(['apply', patch, '--project', dir, '--write'])
    assert.equal(applied.status, 0, applied.stderr)
    assert.match(applied.stdout, /modules updated:/)

    const rootIntent = readFileSync(join(dir, 'intent/app.intent.yaml'), 'utf8')
    const navigation = readFileSync(join(dir, 'intent/shared/navigation.yaml'), 'utf8')
    const section = readFileSync(join(dir, 'intent/frontend/sections/docs/content.yaml'), 'utf8')
    assert.match(rootIntent, /includes:/)
    assert.doesNotMatch(rootIntent, /^pages:/m)
    assert.match(navigation, /label: Docs/)
    assert.match(section, /text: After/)

    const checked = run(['check', '--project', dir])
    assert.equal(checked.status, 0, checked.stderr)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('section.module.add creates a section module and page ref', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-section-module-'))
  try {
    const created = run(['new', dir, '--name', 'Section Module App'])
    assert.equal(created.status, 0, created.stderr)
    const patch = join(dir, 'add-section.patch.yaml')
    writeFileSync(patch, `patch:
  - op: section.module.add
    page: home
    after: hero
    section:
      id: docs_teaser
      type: card_grid
      title: Docs teaser
      items:
        - title: Module file
          text: This section is written as its own file.
`)

    const applied = run(['apply', patch, '--project', dir, '--write'])
    assert.equal(applied.status, 0, applied.stderr)
    assert.match(applied.stdout, /section module docs_teaser/)

    const page = readFileSync(join(dir, 'intent/frontend/pages/home.page.yaml'), 'utf8')
    const sectionPath = join(dir, 'intent/frontend/sections/home/docs-teaser.section.yaml')
    const section = readFileSync(sectionPath, 'utf8')
    assert.match(page, /ref: docs_teaser/)
    assert.doesNotMatch(page, /type: card_grid/)
    assert.match(section, /id: docs_teaser/)
    assert.match(section, /type: card_grid/)

    const checked = run(['check', '--project', dir])
    assert.equal(checked.status, 0, checked.stderr)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
