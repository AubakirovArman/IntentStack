import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { validate } from '../src/validate.js'
import { parseIntentFile } from '../src/parse.js'

const demoIntent = fileURLToPath(new URL('../../demo/intent/app.intent.yaml', import.meta.url))

test('rejects unsupported DSL versions', () => {
  const d = validate({
    version: '0.3',
    project: { id: 'bad_version', target: 'web_ts_minimal' },
    entities: [],
    actions: [],
    pages: [],
  })
  assert.equal(d.hasErrors(), true)
  assert.equal(d.errors[0].code, 'E0002')
})

test('demo intent validates with only the public dashboard warning', async () => {
  const ast = await parseIntentFile(demoIntent)
  const d = validate(ast)
  assert.equal(d.hasErrors(), false)
  assert.deepEqual(d.warnings.map((w) => w.code), ['W2001'])
})

test('table row edit action requires update_record capability in intent', () => {
  const d = validate({
    version: '0.1',
    project: { id: 'bad_table_actions', target: 'web_ts_minimal' },
    entities: [{ id: 'Lead', fields: [{ id: 'name', type: 'string' }] }],
    actions: [{ id: 'list_leads', type: 'list_records', entity: 'Lead' }],
    pages: [
      {
        id: 'dashboard',
        path: '/dashboard',
        layout: 'dashboard',
        auth: 'reserved',
        sections: [
          { id: 'leads', type: 'table', entity: 'Lead', source: { action: 'list_leads' }, columns: ['name'], row_actions: [{ type: 'edit' }] },
        ],
      },
    ],
  })
  assert.equal(d.hasErrors(), true)
  assert.ok(d.errors.some((e) => e.code === 'E3009'))
})

test('table row detail action requires a matching record_detail page', () => {
  const d = validate({
    version: '0.1',
    project: { id: 'missing_detail_page', target: 'web_ts_minimal' },
    entities: [{ id: 'Lead', fields: [{ id: 'name', type: 'string' }] }],
    actions: [{ id: 'list_leads', type: 'list_records', entity: 'Lead' }],
    pages: [
      {
        id: 'dashboard',
        path: '/dashboard/leads',
        layout: 'dashboard',
        auth: 'reserved',
        sections: [
          { id: 'leads', type: 'table', entity: 'Lead', source: { action: 'list_leads' }, columns: ['name'], row_actions: [{ type: 'detail' }] },
        ],
      },
    ],
  })
  assert.equal(d.hasErrors(), true)
  assert.ok(d.errors.some((e) => e.code === 'E3010'))
})

test('validates top-level navigation and content blocks', () => {
  const d = validate({
    version: '0.1',
    project: { id: 'docs_app', target: 'web_ts_minimal' },
    navigation: {
      logo: 'Docs App',
      items: [{ label: 'Docs', href: '/docs' }],
    },
    pages: [
      {
        id: 'docs',
        path: '/docs',
        layout: 'docs',
        sections: [
          {
            id: 'docs_content',
            type: 'content',
            title: 'Documentation',
            blocks: [
              { id: 'overview', type: 'heading', level: 2, text: 'Overview' },
              { id: 'intro', type: 'paragraph', text: 'Generated docs content.' },
              { id: 'steps', type: 'list', items: ['Patch', 'Check', 'Build'] },
              { id: 'tip', type: 'callout', title: 'Tip', text: 'Use small patches.' },
              { id: 'link', type: 'link', text: 'Docs', href: '/docs' },
              { id: 'matrix', type: 'table', columns: ['Step', 'Command'], rows: [['Check', 'intentstack check']] },
              { id: 'example', type: 'example', title: 'Cards', section: 'preview_cards', language: 'yaml', code: 'patch: []' },
              { id: 'command', type: 'code', language: 'bash', code: 'intentstack check' },
            ],
          },
          {
            id: 'preview_cards',
            type: 'card_grid',
            embed_only: true,
            items: [{ title: 'Preview', text: 'Embedded inside docs.' }],
          },
        ],
      },
    ],
  })
  assert.equal(d.hasErrors(), false, d.format())
})

test('rejects malformed navigation and content blocks', () => {
  const d = validate({
    version: '0.1',
    project: { id: 'bad_docs_app', target: 'web_ts_minimal' },
    navigation: {
      items: [{ label: 'Missing href' }],
    },
    pages: [
      {
        id: 'docs',
        path: '/docs',
        layout: 'docs',
        sections: [
          {
            id: 'docs_content',
            type: 'content',
            blocks: [
              { id: 'bad_heading', type: 'heading', level: 9, text: 'Too deep' },
              { id: 'bad_list', type: 'list', items: [] },
              { id: 'bad_code', type: 'code' },
              { id: 'bad_link', type: 'link', text: 'Missing href' },
              { id: 'bad_callout', type: 'callout' },
              { id: 'bad_table', type: 'table', columns: [], rows: [] },
              { id: 'bad_example_missing_section', type: 'example', code: 'patch: []' },
              { id: 'bad_example_missing_code', type: 'example', section: 'preview_cards' },
              { id: 'bad_example_unknown_ref', type: 'example', section: 'missing_cards', code: 'patch: []' },
              { id: 'bad_example_self_ref', type: 'example', section: 'docs_content', code: 'patch: []' },
            ],
          },
          {
            id: 'preview_cards',
            type: 'card_grid',
            embed_only: true,
            items: [{ title: 'Preview', text: 'Embedded inside docs.' }],
          },
        ],
      },
    ],
  })
  assert.equal(d.hasErrors(), true)
  assert.ok(d.errors.some((e) => e.code === 'E2105'))
  assert.ok(d.errors.some((e) => e.code === 'E2235'))
  assert.ok(d.errors.some((e) => e.code === 'E2237'))
  assert.ok(d.errors.some((e) => e.code === 'E2239'))
  assert.ok(d.errors.some((e) => e.code === 'E2241'))
  assert.ok(d.errors.some((e) => e.code === 'E2242'))
  assert.ok(d.errors.some((e) => e.code === 'E2243'))
  assert.ok(d.errors.some((e) => e.code === 'E2244'))
  assert.ok(d.errors.some((e) => e.code === 'E2245'))
  assert.ok(d.errors.some((e) => e.code === 'E2246'))
  assert.ok(d.errors.some((e) => e.code === 'E2247'))
  assert.ok(d.errors.some((e) => e.code === 'E2248'))
})
