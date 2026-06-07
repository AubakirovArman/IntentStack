import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { parseIntentFile } from '../src/parse.js'
import { applyPatch, patchOps } from '../src/patch.js'
import { validate } from '../src/validate.js'

const demoIntent = fileURLToPath(new URL('../../demo/intent/app.intent.yaml', import.meta.url))
const demoPatch = fileURLToPath(new URL('../../demo/patches/001-add-email-and-pricing.yaml', import.meta.url))

test('example patch applies as a semantic change and remains valid', async () => {
  const ast = await parseIntentFile(demoIntent)
  const patch = await parseIntentFile(demoPatch)

  const { changes, errors } = applyPatch(ast, patch)

  assert.deepEqual(errors, [])
  assert.equal(changes.length, 7)
  assert.equal(ast.pages[0].sections.find((s) => s.id === 'hero').title, 'AI voice agents that book your demos')
  assert.ok(ast.entities[0].fields.some((f) => f.id === 'email' && f.required))
  assert.ok(ast.pages[0].sections.some((s) => s.id === 'pricing' && s.type === 'card_grid'))
  assert.ok(ast.pages[0].sections.find((s) => s.id === 'lead_form').fields.includes('email'))
  assert.ok(ast.pages[1].sections.find((s) => s.id === 'leads_table').columns.includes('email'))
  assert.ok(ast.pages[2].sections.find((s) => s.id === 'lead_detail').fields.includes('email'))
  assert.equal(validate(ast).hasErrors(), false)
})

test('patchOps exposes the PRD command surface implemented by the compiler', () => {
  const ops = patchOps()
  for (const op of [
    'project.set_theme',
    'page.create',
    'page.update',
    'page.delete',
    'section.add',
    'section.update',
    'section.remove',
    'section.move',
    'text.set',
    'navigation.set',
    'navigation.item.add',
    'navigation.item.remove',
    'navigation.item.update',
    'navbar.add',
    'navbar.item.add',
    'navbar.item.remove',
    'entity.create',
    'entity.field.add',
    'entity.field.update',
    'entity.field.remove',
    'action.create',
    'action.delete',
    'form.add',
    'form.field.add',
    'form.field.remove',
    'form.bind_entity',
    'form.bind_submit',
    'table.add',
    'table.column.add',
    'table.column.remove',
    'table.bind_source',
    'api.route.create',
    'api.bind_action',
    'layout.set',
    'component.add',
    'component.update',
    'component.remove',
    'content.blocks.set',
    'content.block.add',
    'content.block.move',
    'content.block.update',
    'content.block.remove',
  ]) {
    assert.ok(ops.includes(op), `${op} should be implemented`)
  }
})

test('new patch operations mutate intent by semantic objects', () => {
  const ast = {
    version: 0.1,
    project: { id: 'x', target: 'web_ts_minimal' },
    entities: [],
    actions: [],
    pages: [{ id: 'home', path: '/', sections: [] }],
  }
  const { errors } = applyPatch(ast, {
    patch: [
      { op: 'project.set_theme', radius: 'lg' },
      { op: 'navigation.set', logo: 'X', items: [{ label: 'Home', href: '/' }] },
      { op: 'navigation.item.add', item: { label: 'Docs', href: '/docs' } },
      { op: 'navigation.item.update', label: 'Docs', item: { href: '/documentation' } },
      { op: 'navigation.item.remove', label: 'Home' },
      { op: 'entity.create', id: 'Lead', fields: [{ id: 'name', type: 'string' }] },
      { op: 'entity.field.update', entity: 'Lead', field: 'name', label: 'Full name' },
      { op: 'action.create', id: 'list_leads', type: 'list_records', entity: 'Lead' },
      { op: 'navbar.add', page: 'home', id: 'nav', logo: 'X' },
      { op: 'navbar.item.add', navbar: 'nav', item: { label: 'Home', href: '/' } },
      { op: 'navbar.item.update', navbar: 'nav', label: 'Home', item: { label: 'Start' } },
      { op: 'form.add', page: 'home', id: 'lead_form', entity: 'Lead', fields: ['name'], action: 'list_leads' },
      { op: 'form.bind_submit', form: 'lead_form', action: 'list_leads' },
      { op: 'table.add', page: 'home', id: 'leads_table', entity: 'Lead', columns: ['name'], action: 'list_leads' },
      { op: 'table.column.update', table: 'leads_table', column: 'name', value: { label: 'Lead name' } },
      { op: 'section.add', page: 'home', section: { id: 'docs_content', type: 'content', blocks: [{ id: 'intro', type: 'paragraph', text: 'Hello docs' }] } },
      { op: 'content.block.add', section: 'docs_content', block: { id: 'install', type: 'code', language: 'bash', code: 'npm run build' } },
      { op: 'content.block.move', section: 'docs_content', block: 'install', before: 'intro' },
      { op: 'content.block.update', section: 'docs_content', block: 'intro', value: { text: 'Updated docs' } },
      { op: 'content.block.remove', section: 'docs_content', block: 'install' },
      {
        op: 'content.blocks.set',
        section: 'docs_content',
        blocks: [
          { id: 'intro', type: 'paragraph', text: 'Reset docs' },
          { id: 'more', type: 'link', text: 'More', href: '/docs' },
        ],
      },
      { op: 'section.move', page: 'home', section: 'leads_table', before: 'lead_form' },
      { op: 'component.add', section: 'lead_form', component: { id: 'hint', type: 'text', text: 'Hello' } },
      { op: 'api.route.create', id: 'list_leads_api', method: 'GET', path: '/api/leads', action: 'list_leads' },
      { op: 'layout.set', page: 'home', value: { width: 'xl' } },
    ],
  })
  assert.deepEqual(errors, [])
  assert.equal(ast.theme.radius, 'lg')
  assert.equal(ast.navigation.items[0].label, 'Docs')
  assert.equal(ast.navigation.items[0].href, '/documentation')
  assert.equal(ast.entities[0].fields[0].label, 'Full name')
  assert.equal(ast.pages[0].sections[0].id, 'nav')
  assert.equal(ast.pages[0].sections[0].items[0].label, 'Start')
  assert.equal(ast.pages[0].sections[1].id, 'leads_table')
  assert.equal(ast.pages[0].sections[2].id, 'lead_form')
  assert.equal(ast.pages[0].sections[2].components[0].id, 'hint')
  assert.equal(ast.pages[0].sections[3].blocks[0].text, 'Reset docs')
  assert.equal(ast.pages[0].sections[3].blocks[1].type, 'link')
  assert.equal(ast.api.routes[0].action, 'list_leads')
  assert.equal(ast.pages[0].layout_config.width, 'xl')
})
