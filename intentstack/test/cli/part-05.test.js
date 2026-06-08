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

    const autocomplete = run(['autocomplete', '--project', dir, '--prefix', 'list', '--json'])
    assert.equal(autocomplete.status, 0, autocomplete.stderr)
    const completeData = JSON.parse(autocomplete.stdout)
    assert.ok(completeData.completions.some((item) => item.kind === 'action_type' && item.label === 'list_records'))
    assert.ok(completeData.completions.some((item) => item.kind === 'patch_suggestion' && item.label === 'list_Lead'))

    const entityComplete = run(['autocomplete', '--project', dir, '--prefix', 'Le', '--json'])
    assert.equal(entityComplete.status, 0, entityComplete.stderr)
    assert.ok(JSON.parse(entityComplete.stdout).completions.some((item) => item.kind === 'entity' && item.label === 'Lead'))

    const completeText = run(['autocomplete', '--project', dir, '--prefix', 'hero', '--limit', '1'])
    assert.equal(completeText.status, 0, completeText.stderr)
    assert.match(completeText.stdout, /IntentStack autocomplete/)
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
