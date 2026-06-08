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
    assert.ok(data.paths['/api/auth/refresh'].post)
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
