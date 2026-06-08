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
  assert.ok(data.targets.web_ts_minimal.supported_actions.includes('subscribe_records'))
  assert.ok(data.patch_ops.includes('navigation.set'))
  assert.ok(data.patch_ops.includes('content.block.add'))
  assert.ok(data.patch_ops.includes('content.example.add'))
  assert.ok(data.patch_ops.includes('page.delete'))
  assert.equal(data.patch_catalog['content.example.add'].category, 'content')
  assert.ok(data.patch_schema.properties.patch.items.oneOf.some((item) => item.properties.op.const === 'content.example.add'))
  assert.equal(data.domain_modules.web_crud.status, 'active')
  assert.equal(data.domain_modules.auth_permissions.status, 'partial')
  assert.equal(data.domain_modules.visual_graph.status, 'partial')
  assert.ok(data.theme_packs.some((theme) => theme.id === 'enterprise'))
  assert.equal(data.warning_catalog.W2001.rule_id, 'page.dashboard.public')
})


test('schema command exposes the DSL JSON Schema', () => {
  const res = run(['schema'])
  assert.equal(res.status, 0, res.stderr)
  const schema = JSON.parse(res.stdout)
  assert.equal(schema.title, 'IntentStack Intent DSL v0.1')
  assert.ok(schema.properties.navigation)
  assert.ok(schema.properties.tenancy)
  assert.ok(schema.properties.project.properties.database.properties.driver.enum.includes('sqlite'))
  assert.ok(schema.properties.project.properties.database.properties.driver.enum.includes('postgres'))
  assert.ok(schema.properties.actions.items.properties.type.enum.includes('update_record'))
  assert.ok(schema.properties.actions.items.properties.type.enum.includes('subscribe_records'))
  assert.ok(schema.properties.pages.items.properties.sections.items.properties.type.enum.includes('content'))
  assert.ok(schema.properties.pages.items.properties.sections.items.properties.type.enum.includes('custom_component'))
  assert.equal(schema.properties.pages.items.properties.sections.items.properties.embed_only.type, 'boolean')
  assert.ok(schema.properties.pages.items.properties.sections.items.properties.blocks.items.properties.type.enum.includes('callout'))
  assert.ok(schema.properties.pages.items.properties.sections.items.properties.blocks.items.properties.type.enum.includes('table'))
  assert.ok(schema.properties.pages.items.properties.sections.items.properties.blocks.items.properties.type.enum.includes('example'))
  assert.equal(schema.properties.pages.items.properties.sections.items.properties.blocks.items.properties.section.type, 'string')
})


test('themes lists and applies theme packs through modular writeback', () => {
  const listed = run(['themes', '--json'])
  assert.equal(listed.status, 0, listed.stderr)
  const packs = JSON.parse(listed.stdout)
  assert.ok(packs.themes.some((theme) => theme.id === 'enterprise'))

  const dir = mkdtempSync(join(tmpdir(), 'intentstack-theme-'))
  try {
    const created = run(['new', dir, '--name', 'Theme App'])
    assert.equal(created.status, 0, created.stderr)
    const dry = run(['themes', 'enterprise', '--project', dir])
    assert.equal(dry.status, 0, dry.stderr)
    assert.match(dry.stdout, /dry run/)
    assert.doesNotMatch(readFileSync(join(dir, 'intent/shared/theme.yaml'), 'utf8'), /enterprise/)

    const applied = run(['themes', '--apply', 'enterprise', '--project', dir, '--write'])
    assert.equal(applied.status, 0, applied.stderr)
    assert.match(readFileSync(join(dir, 'intent/shared/theme.yaml'), 'utf8'), /preset: enterprise/)
    assert.match(readFileSync(join(dir, 'intent/shared/theme.yaml'), 'utf8'), /density: compact/)
    const checked = run(['check', '--project', dir])
    assert.equal(checked.status, 0, checked.stderr)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})


test('marketplace lists local targets, themes and domain modules', () => {
  const res = run(['marketplace', '--json'])
  assert.equal(res.status, 0, res.stderr)
  const data = JSON.parse(res.stdout)
  assert.ok(data.targets.some((target) => target.id === 'next_shadcn'))
  assert.ok(data.themes.some((theme) => theme.id === 'enterprise'))
  assert.ok(data.domain_modules.some((module) => module.id === 'visual_graph'))

  const themes = run(['marketplace', '--kind', 'themes', '--json'])
  assert.equal(themes.status, 0, themes.stderr)
  const filtered = JSON.parse(themes.stdout)
  assert.ok(filtered.themes)
  assert.equal(filtered.targets, undefined)
})


test('marketplace installs and pins local target plugin manifests', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-marketplace-install-'))
  try {
    const created = run(['new', dir, '--name', 'Marketplace App'])
    assert.equal(created.status, 0, created.stderr)
    mkdirSync(join(dir, 'plugin-src'), { recursive: true })
    writeFileSync(join(dir, 'plugin-src/static-target.mjs'), `export function planFiles(graph) {
  return { 'dist/index.html': '<h1>' + graph.project.name + '</h1>\\n' }
}
`)
    writeFileSync(join(dir, 'plugin-src/intentstack.plugin.yaml'), `id: static_html
type: target
version: 1.2.3
compatibility:
  intentstack: ">=0.1.0"
module: static-target.mjs
capabilities:
  framework: static
  ui: none
  frontend: true
  backend: false
  database: false
  supported_components: [hero]
  supported_actions: []
  supported_field_types: [string]
`)
    const manifest = join(dir, 'plugin-src/intentstack.plugin.yaml')
    const dry = run(['marketplace', 'install', manifest, '--project', dir, '--json'])
    assert.equal(dry.status, 0, dry.stderr)
    assert.equal(JSON.parse(dry.stdout).written, false)
    assert.equal(existsSync(join(dir, '.intentstack/marketplace-lock.json')), false)

    const installed = run(['marketplace', 'install', manifest, '--project', dir, '--write'])
    assert.equal(installed.status, 0, installed.stderr)
    assert.match(installed.stdout, /ok plugin installed/)
    assert.ok(existsSync(join(dir, '.intentstack/plugins/static_html/static-target.mjs')))
    assert.match(readFileSync(join(dir, 'intentstack.config.yaml'), 'utf8'), /version: 1\.2\.3/)
    const lock = JSON.parse(readFileSync(join(dir, '.intentstack/marketplace-lock.json'), 'utf8'))
    assert.equal(lock.plugins.static_html.version, '1.2.3')

    const market = run(['marketplace', '--project', dir, '--json'])
    assert.equal(market.status, 0, market.stderr)
    const target = JSON.parse(market.stdout).targets.find((item) => item.id === 'static_html')
    assert.equal(target.source, 'plugin')
    assert.equal(target.version, '1.2.3')

    writeFileSync(join(dir, 'plugin-src/incompatible.plugin.yaml'), `id: future_target
type: target
version: 9.0.0
compatibility:
  intentstack: ">=9.0.0"
module: static-target.mjs
`)
    const incompatible = run(['marketplace', 'install', join(dir, 'plugin-src/incompatible.plugin.yaml'), '--project', dir, '--write'])
    assert.equal(incompatible.status, 2)
    assert.match(incompatible.stderr, /requires IntentStack >=9\.0\.0/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})


test('configured plugin target adapters participate in validation, marketplace and build', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-plugin-target-'))
  try {
    mkdirSync(join(dir, 'intent'), { recursive: true })
    mkdirSync(join(dir, 'plugins'), { recursive: true })
    writeFileSync(join(dir, 'intentstack.config.yaml'), `intent: intent/app.intent.yaml
out: app
plugins:
  targets:
    - id: static_html
      module: plugins/static-target.mjs
`)
    writeFileSync(join(dir, 'plugins/static-target.mjs'), `export const capabilities = {
  id: 'static_html',
  framework: 'static',
  ui: 'none',
  frontend: true,
  backend: false,
  database: false,
  supported_components: ['hero'],
  supported_actions: [],
  supported_field_types: ['string'],
}

export const managedZones = ['dist']

export function planFiles(graph) {
  return {
    'dist/index.html': '<!doctype html><title>' + graph.project.name + '</title><h1>' + graph.project.name + '</h1>\\n',
  }
}
`)
    writeFileSync(join(dir, 'intent/app.intent.yaml'), `version: 0.1
project:
  id: plugin_site
  name: Plugin Site
  target: static_html
pages:
  - id: home
    path: /
    sections:
      - id: hero
        type: hero
        title: Plugin Site
`)

    const checked = run(['check', '--project', dir])
    assert.equal(checked.status, 0, checked.stderr)

    const capabilities = run(['list_capabilities', '--project', dir, '--target', 'static_html', '--json'])
    assert.equal(capabilities.status, 0, capabilities.stderr)
    assert.equal(JSON.parse(capabilities.stdout).targets.static_html.framework, 'static')

    const schema = run(['schema', '--project', dir])
    assert.equal(schema.status, 0, schema.stderr)
    assert.ok(JSON.parse(schema.stdout).properties.project.properties.target.enum.includes('static_html'))

    const market = run(['marketplace', '--project', dir, '--json'])
    assert.equal(market.status, 0, market.stderr)
    const target = JSON.parse(market.stdout).targets.find((item) => item.id === 'static_html')
    assert.equal(target.source, 'plugin')

    const built = run(['build', '--project', dir, '--no-format', '--no-verify'])
    assert.equal(built.status, 0, built.stderr)
    assert.match(readFileSync(join(dir, 'app/dist/index.html'), 'utf8'), /Plugin Site/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
