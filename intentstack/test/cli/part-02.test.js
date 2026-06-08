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

test('migrate rewrites legacy 0.0 intent to 0.1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-migrate-legacy-'))
  try {
    mkdirSync(join(dir, 'intent'), { recursive: true })
    writeFileSync(join(dir, 'intent/app.intent.yaml'), `version: 0.0
app:
  id: legacy_app
  name: Legacy App
sections:
  - id: hero
    type: hero
    title: Legacy
`)
    const migrated = run(['migrate', '--project', dir, '--from', '0.0', '--to', '0.1', '--write'])
    assert.equal(migrated.status, 0, migrated.stderr)
    assert.match(migrated.stdout, /renamed app to project/)
    const intent = readFileSync(join(dir, 'intent/app.intent.yaml'), 'utf8')
    assert.match(intent, /version: '0\.1'/)
    assert.match(intent, /project:/)
    assert.match(intent, /pages:/)
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
    const rollbackSql = readFileSync(join(out, 'migrations/0001_update.down.sql'), 'utf8')
    assert.match(rollbackSql, /ALTER TABLE leads DROP COLUMN company;/)
    const manifest = JSON.parse(readFileSync(join(out, 'migrations/manifest.json'), 'utf8'))
    assert.equal(manifest.migrations.length, 2)
    assert.equal(manifest.migrations[0].id, '0000_init')
    assert.equal(manifest.migrations[1].id, '0001_update')
    assert.equal(manifest.migrations[1].rollback_file, '0001_update.down.sql')
    assert.match(manifest.migrations[1].rollback_checksum, /^[a-f0-9]{64}$/)
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
