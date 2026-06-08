import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildGraph } from '../src/graph.js'
import { loadIntentProject } from '../src/intent_loader.js'
import { validate } from '../src/validate.js'

test('reference graph resolves entities, actions, sections, pages, and field refs', () => {
  const graph = buildGraph({
    version: '0.1',
    project: { id: 'refs', target: 'web_ts_minimal' },
    entities: [
      { id: 'Account', fields: [{ id: 'name', type: 'string' }] },
      { id: 'Lead', fields: [{ id: 'accountId', type: 'string', references: 'Account' }] },
    ],
    actions: [{ id: 'create_lead', type: 'create_record', entity: 'Lead' }],
    pages: [
      {
        id: 'home',
        path: '/',
        sections: [{ id: 'lead_form', type: 'form', entity: 'Lead', fields: ['accountId'], submit: { action: 'create_lead' } }],
      },
    ],
  })
  const edges = graph.referenceGraph.edges
  assert.ok(edges.some((edge) => edge.kind === 'action.entity' && edge.to === 'Entity.Lead' && edge.resolved))
  assert.ok(edges.some((edge) => edge.kind === 'page.section' && edge.from === 'Page.home'))
  assert.ok(edges.some((edge) => edge.kind === 'entity.field_reference' && edge.to === 'Entity.Account' && edge.resolved))
  assert.equal(graph.referenceGraph.unresolved.length, 0)
})

test('validator reports unknown and cyclic entity references', () => {
  const d = validate({
    version: '0.1',
    project: { id: 'entity_cycles', target: 'web_ts_minimal' },
    entities: [
      { id: 'A', fields: [{ id: 'bId', type: 'string', references: 'B' }] },
      { id: 'B', fields: [{ id: 'aId', type: 'string', references: 'A' }] },
      { id: 'C', fields: [{ id: 'missingId', type: 'string', references: 'Missing' }] },
    ],
    pages: [{ id: 'home', path: '/', sections: [{ id: 'hero', type: 'hero', title: 'Home' }] }],
  })
  assert.ok(d.errors.some((item) => item.code === 'E3005'))
  assert.ok(d.errors.some((item) => item.code === 'E3006'))
})

test('loader records include graph and validator reports include cycles', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-include-cycle-'))
  try {
    mkdirSync(join(dir, 'intent/shared'), { recursive: true })
    writeFileSync(join(dir, 'intent/app.intent.yaml'), `version: 0.1
project:
  id: include_cycle
  target: web_ts_minimal
includes:
  - shared/a.yaml
`)
    writeFileSync(join(dir, 'intent/shared/a.yaml'), `includes:
  - shared/b.yaml
navigation:
  logo: A
  items: []
`)
    writeFileSync(join(dir, 'intent/shared/b.yaml'), `includes:
  - shared/a.yaml
theme:
  preset: default
`)
    const { ast } = await loadIntentProject(dir, {})
    const graph = buildGraph(ast)
    assert.equal(graph.modules.includeCycles.length, 1)
    assert.ok(graph.referenceGraph.cycles.some((cycle) => cycle.kind === 'intent.include'))
    assert.ok(graph.referenceGraph.edges.some((edge) => edge.kind === 'intent.include' && edge.resolved))
    const d = validate(ast)
    assert.ok(d.errors.some((item) => item.code === 'E1101'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
