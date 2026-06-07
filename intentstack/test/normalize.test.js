import test from 'node:test'
import assert from 'node:assert/strict'
import { normalize } from '../src/normalize.js'
import { buildGraph } from '../src/graph.js'

function intent() {
  return {
    version: '0.1',
    project: { id: 'normalize_app', target: 'web_ts_minimal' },
    entities: [
      {
        id: 'Lead',
        table: 'leads',
        fields: [
          { id: 'name', type: 'string' },
          { id: 'email', type: 'string' },
        ],
      },
    ],
    actions: [
      { id: 'create_lead', type: 'create_record', entity: 'Lead' },
      { id: 'list_leads', type: 'list_records', entity: 'Lead' },
      { id: 'get_lead', type: 'get_record', entity: 'Lead' },
    ],
    pages: [
      {
        id: 'home',
        path: '/',
        sections: [
          { id: 'lead_form', type: 'form', entity: 'Lead', fields: ['name'], submit: { action: 'create_lead', success_message: 'Saved' } },
          { id: 'leads_table', type: 'table', entity: 'Lead', source: { action: 'list_leads' }, columns: ['email'] },
          { id: 'lead_detail', type: 'record_detail', entity: 'Lead', source: { action: 'get_lead' }, fields: [{ name: 'email' }] },
        ],
      },
    ],
  }
}

test('normalize expands compact field refs without mutating source intent', () => {
  const raw = intent()
  const normalized = normalize(raw)

  assert.equal(raw.pages[0].sections[0].fields[0], 'name')
  assert.deepEqual(normalized.pages[0].sections[0].fields[0], {
    id: 'name',
    ref: 'Entity.Lead.field.name',
  })
  assert.deepEqual(normalized.pages[0].sections[1].columns[0], {
    id: 'email',
    ref: 'Entity.Lead.field.email',
  })
  assert.deepEqual(normalized.pages[0].sections[2].fields[0], {
    name: 'email',
    id: 'email',
    ref: 'Entity.Lead.field.email',
  })
})

test('buildGraph consumes normalized Core IR', () => {
  const graph = buildGraph(intent())
  assert.deepEqual(graph.pages[0].sections[0].fields[0], {
    id: 'name',
    ref: 'Entity.Lead.field.name',
  })
})
