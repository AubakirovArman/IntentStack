import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import YAML from 'js-yaml'
import { parseIntentFile } from '../src/parse.js'
import { validate } from '../src/validate.js'
import { buildGraph } from '../src/graph.js'
import { planFiles } from '../src/emit/index.js'
import { TARGETS } from '../src/registry.js'
import { DOMAIN_MODULES } from '../src/modules.js'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const registryDir = fileURLToPath(new URL('../registry', import.meta.url))
const examplesDir = fileURLToPath(new URL('../examples', import.meta.url))

test('registry target files match in-code target capabilities', () => {
  for (const id of Object.keys(TARGETS)) {
    const doc = YAML.load(readFileSync(join(registryDir, 'targets', `${id}.yaml`), 'utf8'))
    assert.equal(doc.id, id)
    assert.deepEqual(doc.components, TARGETS[id].supported_components)
    assert.deepEqual(doc.actions, TARGETS[id].supported_actions)
    assert.deepEqual(doc.field_types, TARGETS[id].supported_field_types)
  }
})

test('component registry covers every supported component', () => {
  const components = new Set(
    readdirSync(join(registryDir, 'components'))
      .filter((f) => f.endsWith('.yaml'))
      .map((f) => YAML.load(readFileSync(join(registryDir, 'components', f), 'utf8')).id),
  )
  for (const t of Object.values(TARGETS)) {
    for (const c of t.supported_components) assert.ok(components.has(c), `${c} should have a registry file`)
  }
})

test('module registry file matches in-code domain module metadata', () => {
  const doc = YAML.load(readFileSync(join(registryDir, 'modules.yaml'), 'utf8'))
  assert.deepEqual(doc, DOMAIN_MODULES)
})

test('golden examples validate and produce planned files', async () => {
  for (const name of readdirSync(examplesDir)) {
    const intent = join(examplesDir, name, 'intent/app.intent.yaml')
    const ast = await parseIntentFile(intent)
    const d = validate(ast)
    assert.equal(d.hasErrors(), false, `${name}: ${d.format()}`)
    const files = planFiles(buildGraph(ast))
    assert.ok(Object.keys(files).length > 0, `${name} should plan files`)
    assert.ok(files['package.json'], `${name} should generate package.json`)
  }
})
