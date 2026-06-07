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
  assert.equal(data.domain_modules.web_crud.status, 'active')
  assert.equal(data.domain_modules.auth_permissions.status, 'partial')
  assert.equal(data.domain_modules.visual_graph.status, 'partial')
  assert.ok(data.theme_packs.some((theme) => theme.id === 'enterprise'))
})

test('schema command exposes the DSL JSON Schema', () => {
  const res = run(['schema'])
  assert.equal(res.status, 0, res.stderr)
  const schema = JSON.parse(res.stdout)
  assert.equal(schema.title, 'IntentStack Intent DSL v0.1')
  assert.ok(schema.properties.navigation)
  assert.ok(schema.properties.tenancy)
  assert.ok(schema.properties.project.properties.database.properties.driver.enum.includes('sqlite'))
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

test('build reports normalize, format and verify phases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-build-pipeline-'))
  try {
    const created = run(['new', dir, '--name', 'Pipeline App'])
    assert.equal(created.status, 0, created.stderr)
    const built = run(['build', '--project', dir])
    assert.equal(built.status, 0, built.stderr)
    assert.match(built.stdout, /Normalize: ok/)
    assert.match(built.stdout, /format prettier:/)
    assert.match(built.stdout, /verify: skipped/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('build preserves migration history and adds schema evolution migration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-migration-evolution-'))
  try {
    const created = run(['new', dir, '--single-file', '--name', 'Migration App'])
    assert.equal(created.status, 0, created.stderr)
    const out = join(dir, 'app')
    const first = run(['build', '--project', dir, '--out', out, '--no-format', '--no-verify'])
    assert.equal(first.status, 0, first.stderr)
    const initPath = join(out, 'migrations/0000_init.sql')
    const initialSql = readFileSync(initPath, 'utf8')
    const firstManifest = JSON.parse(readFileSync(join(out, 'migrations/manifest.json'), 'utf8'))
    assert.equal(firstManifest.migrations.length, 1)
    assert.match(firstManifest.schema_checksum, /^[a-f0-9]{64}$/)

    const patch = join(dir, 'add-company.patch.yaml')
    writeFileSync(patch, `version: 0.1
patch:
  - op: entity.field.add
    entity: Lead
    field:
      id: company
      type: string
      required: false
`)
    const applied = run(['apply', patch, '--project', dir, '--write'])
    assert.equal(applied.status, 0, applied.stderr)
    const second = run(['build', '--project', dir, '--out', out, '--no-format', '--no-verify'])
    assert.equal(second.status, 0, second.stderr)

    assert.equal(readFileSync(initPath, 'utf8'), initialSql)
    const updateSql = readFileSync(join(out, 'migrations/0001_update.sql'), 'utf8')
    assert.match(updateSql, /ALTER TABLE leads ADD COLUMN company text;/)
    const manifest = JSON.parse(readFileSync(join(out, 'migrations/manifest.json'), 'utf8'))
    assert.equal(manifest.migrations.length, 2)
    assert.equal(manifest.migrations[0].id, '0000_init')
    assert.equal(manifest.migrations[1].id, '0001_update')
    assert.equal(manifest.migrations[1].previous_schema_checksum, firstManifest.schema_checksum)
    assert.notEqual(manifest.schema_checksum, firstManifest.schema_checksum)
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

test('openapi exports CRUD contract as JSON and YAML', () => {
  const res = run(['openapi', '--project', 'demo'])
  assert.equal(res.status, 0, res.stderr)
  const data = JSON.parse(res.stdout)
  assert.equal(data.openapi, '3.1.0')
  assert.equal(data.info.title, 'VoiceAgent')
  assert.equal(data.paths['/api/leads'].get.operationId, 'list_leads')
  assert.equal(data.paths['/api/leads'].post.operationId, 'create_lead')
  assert.equal(data.paths['/api/leads/{id}'].get.operationId, 'get_lead')
  assert.equal(data.paths['/api/leads/{id}'].put.operationId, 'update_lead')
  assert.equal(data.paths['/api/health'].get.operationId, 'health')
  assert.equal(data.paths['/api/metrics'].get.operationId, 'metrics')
  assert.equal(data.components.schemas.Lead.properties.status.enum[0], 'new')
  assert.deepEqual(data.components.schemas.LeadInput.required, ['name', 'phone'])

  const dir = mkdtempSync(join(tmpdir(), 'intentstack-openapi-'))
  try {
    const out = join(dir, 'openapi.yaml')
    const written = run(['openapi', '--project', 'demo', '--out', out])
    assert.equal(written.status, 0, written.stderr)
    assert.match(written.stdout, /ok OpenAPI yaml written/)
    assert.match(readFileSync(out, 'utf8'), /openapi:\s+3\.1\.0/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('openapi documents auth roles and CSRF only for protected unsafe methods', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-openapi-auth-'))
  try {
    mkdirSync(join(dir, 'intent'), { recursive: true })
    writeFileSync(join(dir, 'intent/app.intent.yaml'), `version: 0.1
project:
  id: openapi_auth
  name: OpenAPI Auth
  target: web_ts_minimal
auth:
  roles: [admin]
  users:
    - id: admin
      role: admin
      password: env:ADMIN_PASSWORD
tenancy:
  enabled: true
  header: X-Org-Id
entities:
  - id: Lead
    fields:
      - id: name
        type: string
        required: true
actions:
  - id: list_leads
    type: list_records
    entity: Lead
    auth: admin
  - id: create_lead
    type: create_record
    entity: Lead
    auth: admin
  - id: subscribe_leads
    type: subscribe_records
    entity: Lead
    auth: admin
pages:
  - id: home
    path: /
    sections:
      - id: hero
        type: hero
        title: Home
`)
    const res = run(['openapi', '--project', dir])
    assert.equal(res.status, 0, res.stderr)
    const data = JSON.parse(res.stdout)
    assert.deepEqual(data.paths['/api/lead'].get.security, [{ intentstackSession: [] }])
    assert.deepEqual(data.paths['/api/lead'].get['x-intentstack-roles'], ['admin'])
    assert.equal(data.components.schemas.Lead.properties.tenantId.type, 'string')
    assert.ok(data.paths['/api/lead'].get.parameters.some((item) => item.name === 'X-Org-Id'))
    assert.ok(!data.paths['/api/lead'].get.parameters.some((item) => item.name === 'X-CSRF-Token'))
    assert.ok(data.paths['/api/lead'].post.parameters.some((item) => item.name === 'X-Org-Id'))
    assert.ok(data.paths['/api/lead'].post.parameters.some((item) => item.name === 'X-CSRF-Token'))
    assert.equal(data.paths['/api/lead/stream'].get.operationId, 'subscribe_leads')
    assert.ok(data.paths['/api/lead/stream'].get.parameters.some((item) => item.name === 'X-Org-Id'))
    assert.equal(data.paths['/api/lead/stream'].get.responses[200].content['text/event-stream'].schema.type, 'string')
    assert.ok(data.paths['/api/auth/login'].post)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('testgen writes generated API contract tests', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-testgen-'))
  try {
    const out = join(dir, 'generated-tests')
    const res = run(['testgen', '--project', 'demo', '--out', out])
    assert.equal(res.status, 0, res.stderr)
    assert.match(res.stdout, /ok generated tests written/)
    const testFile = readFileSync(join(out, 'api-contract.test.mjs'), 'utf8')
    const e2eFile = readFileSync(join(out, 'e2e-flow.spec.mjs'), 'utf8')
    const configFile = readFileSync(join(out, 'playwright.config.mjs'), 'utf8')
    const readme = readFileSync(join(out, 'README.md'), 'utf8')
    assert.match(testFile, /"path": "\/api\/health"/)
    assert.match(testFile, /"method": "GET"[\s\S]*"path": "\/api\/leads"/)
    assert.match(testFile, /INTENTSTACK_RUN_MUTATION_TESTS/)
    assert.match(testFile, /INTENTSTACK_TEST_LEAD_ID/)
    assert.match(e2eFile, /@playwright\/test/)
    assert.match(e2eFile, /form submits: /)
    assert.match(e2eFile, /table renders: /)
    assert.match(configFile, /INTENTSTACK_E2E_BASE_URL/)
    assert.match(readme, /Operations generated: 6/)
    assert.match(readme, /E2E flows: /)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('testgen documents multi-tenant contract requirements', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-testgen-tenant-'))
  try {
    mkdirSync(join(dir, 'intent'), { recursive: true })
    writeFileSync(join(dir, 'intent/app.intent.yaml'), `version: 0.1
project:
  id: tenant_contract
  target: web_ts_minimal
tenancy:
  enabled: true
  header: X-Org-Id
entities:
  - id: Lead
    fields:
      - id: name
        type: string
actions:
  - id: list_leads
    type: list_records
    entity: Lead
  - id: subscribe_leads
    type: subscribe_records
    entity: Lead
pages:
  - id: home
    path: /
    sections:
      - id: hero
        type: hero
        title: Home
`)
    const out = join(dir, 'generated-tests')
    const res = run(['testgen', '--project', dir, '--out', out])
    assert.equal(res.status, 0, res.stderr)
    const testFile = readFileSync(join(out, 'api-contract.test.mjs'), 'utf8')
    const readme = readFileSync(join(out, 'README.md'), 'utf8')
    assert.match(testFile, /INTENTSTACK_TEST_TENANT_ID/)
    assert.match(testFile, /"tenantHeader": "X-Org-Id"/)
    assert.match(testFile, /url\.searchParams\.set\('tenant_id', TENANT_ID\)/)
    assert.match(readme, /Multi-tenant endpoints require `INTENTSTACK_TEST_TENANT_ID`/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('deploy prepares provider configuration without remote side effects', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-deploy-'))
  try {
    const dryOut = join(dir, 'dry-app')
    const dry = run(['deploy', '--project', 'demo', '--platform', 'vercel', '--out', dryOut, '--dry-run'])
    assert.equal(dry.status, 0, dry.stderr)
    assert.match(dry.stdout, /Platform: vercel/)
    assert.match(dry.stdout, /vercel\.json/)
    assert.equal(existsSync(join(dryOut, 'vercel.json')), false)

    const out = join(dir, 'render-app')
    const written = run(['deploy', '--project', 'demo', '--platform', 'render', '--out', out, '--no-build'])
    assert.equal(written.status, 0, written.stderr)
    assert.match(written.stdout, /ok deployment files written/)
    assert.match(readFileSync(join(out, 'render.yaml'), 'utf8'), /startCommand: npm run start/)

    const execOut = join(dir, 'exec-app')
    const markerCommand = `"${process.execPath}" -e "require('fs').writeFileSync('deploy-executed.txt','ok')"`
    const executed = run(['deploy', '--project', 'demo', '--platform', 'vercel', '--out', execOut, '--no-build', '--execute', '--command', markerCommand])
    assert.equal(executed.status, 0, executed.stderr)
    assert.match(executed.stdout, /Executing deployment command/)
    assert.match(executed.stdout, /deployment command exit code: 0/)
    assert.equal(readFileSync(join(execOut, 'deploy-executed.txt'), 'utf8'), 'ok')

    const bad = run(['deploy', '--project', 'demo', '--platform', 'unknown', '--dry-run'])
    assert.equal(bad.status, 2)
    assert.match(bad.stderr, /Unknown deploy platform/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
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

test('collab maps git changes to modular intent owners', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-collab-'))
  try {
    const created = run(['new', dir, '--name', 'Collab App'])
    assert.equal(created.status, 0, created.stderr)
    assert.equal(spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' }).status, 0)
    assert.equal(spawnSync('git', ['config', 'user.email', 'agent@example.com'], { cwd: dir, encoding: 'utf8' }).status, 0)
    assert.equal(spawnSync('git', ['config', 'user.name', 'IntentStack Agent'], { cwd: dir, encoding: 'utf8' }).status, 0)
    assert.equal(spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' }).status, 0)
    assert.equal(spawnSync('git', ['commit', '-m', 'init'], { cwd: dir, encoding: 'utf8' }).status, 0)

    const navigation = join(dir, 'intent/shared/navigation.yaml')
    writeFileSync(navigation, readFileSync(navigation, 'utf8').replace('Home', 'Start'))
    mkdirSync(join(dir, 'intent/frontend/unused'), { recursive: true })
    writeFileSync(join(dir, 'intent/frontend/unused/orphan.yaml'), 'page:\n  id: orphan\n  path: /orphan\n')

    const res = run(['collab', '--project', dir, '--json'])
    assert.equal(res.status, 0, res.stderr)
    const data = JSON.parse(res.stdout)
    assert.equal(data.status, 'warn')
    assert.ok(data.git.changed_files.some((file) => /intent\/shared\/navigation\.yaml$/.test(file)))
    assert.ok(data.owners_changed.some((owner) => owner.kind === 'navigation' && owner.id === 'navigation'))
    assert.ok(data.findings.some((finding) => finding.code === 'COLLAB_UNKNOWN_INTENT_FILE'))

    const text = run(['collab', '--project', dir])
    assert.equal(text.status, 0, text.stderr)
    assert.match(text.stdout, /Changed owners:/)

    const strict = run(['collab', '--project', dir, '--strict'])
    assert.equal(strict.status, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('collab detects semantic owner conflicts against an incoming ref', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-collab-conflict-'))
  try {
    const created = run(['new', dir, '--name', 'Conflict App'])
    assert.equal(created.status, 0, created.stderr)
    assert.equal(spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' }).status, 0)
    assert.equal(spawnSync('git', ['config', 'user.email', 'agent@example.com'], { cwd: dir, encoding: 'utf8' }).status, 0)
    assert.equal(spawnSync('git', ['config', 'user.name', 'IntentStack Agent'], { cwd: dir, encoding: 'utf8' }).status, 0)
    assert.equal(spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' }).status, 0)
    assert.equal(spawnSync('git', ['commit', '-m', 'init'], { cwd: dir, encoding: 'utf8' }).status, 0)
    const currentBranch = spawnSync('git', ['branch', '--show-current'], { cwd: dir, encoding: 'utf8' }).stdout.trim() || 'master'
    const navigation = join(dir, 'intent/shared/navigation.yaml')

    assert.equal(spawnSync('git', ['checkout', '-b', 'incoming-nav'], { cwd: dir, encoding: 'utf8' }).status, 0)
    writeFileSync(navigation, readFileSync(navigation, 'utf8').replace('Home', 'Docs'))
    assert.equal(spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' }).status, 0)
    assert.equal(spawnSync('git', ['commit', '-m', 'incoming nav'], { cwd: dir, encoding: 'utf8' }).status, 0)

    assert.equal(spawnSync('git', ['checkout', currentBranch], { cwd: dir, encoding: 'utf8' }).status, 0)
    writeFileSync(navigation, readFileSync(navigation, 'utf8').replace('Home', 'Start'))

    const res = run(['collab', '--project', dir, '--incoming', 'incoming-nav', '--json'])
    assert.equal(res.status, 0, res.stderr)
    const data = JSON.parse(res.stdout)
    assert.equal(data.status, 'error')
    assert.equal(data.incoming.ref, 'incoming-nav')
    assert.ok(data.conflicts.some((conflict) => conflict.owner === 'navigation:navigation'))
    assert.ok(data.findings.some((finding) => finding.code === 'COLLAB_OWNER_CONFLICT'))

    const text = run(['collab', '--project', dir, '--incoming', 'incoming-nav'])
    assert.equal(text.status, 0, text.stderr)
    assert.match(text.stdout, /Semantic conflicts:/)

    const strict = run(['collab', '--project', dir, '--incoming', 'incoming-nav', '--strict'])
    assert.equal(strict.status, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('editor command exports the visual patch editor', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-editor-'))
  try {
    const out = join(dir, 'editor.html')
    const res = run(['editor', '--project', 'demo', '--out', out])
    assert.equal(res.status, 0, res.stderr)
    assert.match(res.stdout, /visual editor written/)
    const html = readFileSync(out, 'utf8')
    assert.match(html, /Patch Builder/)
    assert.match(html, /Suggestions/)
    assert.match(html, /voice_agent_site/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('suggest command emits semantic patch templates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-suggest-'))
  try {
    mkdirSync(join(dir, 'intent'), { recursive: true })
    writeFileSync(join(dir, 'intent/app.intent.yaml'), `version: 0.1
project:
  id: suggest_app
  name: Suggest App
  target: web_ts_minimal
entities:
  - id: Lead
    fields:
      - id: name
        type: string
actions:
  - id: create_lead
    type: create_record
    entity: Lead
pages:
  - id: home
    path: /
    sections:
      - id: hero
        type: hero
        title: Home
`)
    const res = run(['suggest', '--project', dir, '--json'])
    assert.equal(res.status, 0, res.stderr)
    const data = JSON.parse(res.stdout)
    assert.ok(data.suggestions.some((item) => item.id === 'add_navigation'))
    assert.ok(data.suggestions.some((item) => item.id === 'list_Lead'))
    assert.ok(data.suggestions.some((item) => /action\.create/.test(item.yaml)))

    const text = run(['suggest', '--project', dir, '--limit', '1'])
    assert.equal(text.status, 0, text.stderr)
    assert.match(text.stdout, /IntentStack suggestions/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('voice command converts text intents to valid patch YAML', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-voice-'))
  try {
    mkdirSync(join(dir, 'intent'), { recursive: true })
    writeFileSync(join(dir, 'intent/app.intent.yaml'), `version: 0.1
project:
  id: voice_app
  name: Voice App
  target: web_ts_minimal
entities:
  - id: Lead
    fields:
      - id: name
        type: string
actions:
  - id: list_leads
    type: list_records
    entity: Lead
pages:
  - id: home
    path: /
    sections:
      - id: hero
        type: hero
        title: Home
`)
    const pricing = run(['voice', 'add pricing section', '--project', dir, '--json'])
    assert.equal(pricing.status, 0, pricing.stderr)
    const pricingData = JSON.parse(pricing.stdout)
    assert.equal(pricingData.patch[0].op, 'section.add')
    assert.equal(pricingData.patch[0].section.type, 'pricing_cards')
    const patch = join(dir, 'voice.patch.yaml')
    writeFileSync(patch, pricingData.yaml)
    const applied = run(['apply', patch, '--project', dir])
    assert.equal(applied.status, 0, applied.stderr)

    const field = run(['voice', '--project', dir, '--text', 'add email to Lead', '--json'])
    assert.equal(field.status, 0, field.stderr)
    const fieldData = JSON.parse(field.stdout)
    assert.equal(fieldData.patch[0].op, 'entity.field.add')
    assert.equal(fieldData.patch[0].field.id, 'email')

    const unknown = run(['voice', '--project', dir, '--text', 'sing a song'])
    assert.equal(unknown.status, 1)
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
    - ref: docs_cards
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
    writeFileSync(join(dir, 'intent/frontend/sections/docs/cards.yaml'), `section:
  id: docs_cards
  type: card_grid
  embed_only: true
  items:
    - title: One card
      text: Embedded preview.
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
  - op: content.example.add
    section: docs_content
    id: cards_example
    title: Cards
    preview_section: docs_cards
    code: |
      version: 0.1
      patch: []
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
    assert.match(section, /type: example/)
    assert.match(section, /section: docs_cards/)

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
