import test from 'node:test'
import assert from 'node:assert/strict'
import { applyPatch } from '../src/patch.js'
import { validate } from '../src/validate.js'

test('patch add operations reject duplicate side effects', () => {
  const ast = {
    version: 0.1,
    project: { id: 'idempotent_patch', target: 'web_ts_minimal' },
    navigation: { items: [{ label: 'Docs', href: '/docs' }] },
    pages: [{ id: 'home', path: '/', sections: [{ id: 'nav', type: 'navbar', items: [{ label: 'Home', href: '/' }] }] }],
  }
  const nav = applyPatch(ast, { patch: [{ op: 'navigation.item.add', item: { label: 'Docs', href: '/docs' } }] })
  assert.equal(nav.errors.length, 1)
  assert.equal(ast.navigation.items.length, 1)
  const local = applyPatch(ast, { patch: [{ op: 'navbar.item.add', navbar: 'nav', item: { label: 'Home', href: '/' } }] })
  assert.equal(local.errors.length, 1)
  assert.equal(ast.pages[0].sections[0].items.length, 1)
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
      { op: 'section.add', page: 'home', section: { id: 'docs_preview', type: 'card_grid', embed_only: true, items: [{ title: 'Preview', text: 'Embedded.' }] } },
      { op: 'content.block.add', section: 'docs_content', block: { id: 'install', type: 'code', language: 'bash', code: 'npm run build' } },
      {
        op: 'content.example.add',
        section: 'docs_content',
        id: 'preview_example',
        title: 'Preview example',
        text: 'Live preview and patch code in one block.',
        preview_section: 'docs_preview',
        code: 'patch:\n  - op: section.module.add',
        after: 'install',
      },
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

test('content.example.add creates an embedded docs example block', () => {
  const ast = {
    version: '0.1',
    project: { id: 'docs_examples', target: 'web_ts_minimal' },
    pages: [
      {
        id: 'docs',
        path: '/docs',
        layout: 'docs',
        sections: [
          {
            id: 'docs_content',
            type: 'content',
            blocks: [{ id: 'intro', type: 'paragraph', text: 'Intro' }],
          },
          {
            id: 'docs_cards',
            type: 'card_grid',
            embed_only: true,
            items: [{ title: 'Card', text: 'Preview' }],
          },
        ],
      },
    ],
  }

  const { errors, changes } = applyPatch(ast, {
    patch: [
      {
        op: 'content.example.add',
        section: 'docs_content',
        id: 'cards_example',
        title: 'Cards',
        text: 'Preview and code stay together.',
        preview_section: 'docs_cards',
        code: 'version: 0.1\npatch: []',
        after: 'intro',
      },
    ],
  })

  assert.deepEqual(errors, [])
  assert.match(changes[0].summary, /add content example cards_example/)
  assert.deepEqual(ast.pages[0].sections[0].blocks[1], {
    id: 'cards_example',
    type: 'example',
    title: 'Cards',
    text: 'Preview and code stay together.',
    section: 'docs_cards',
    language: 'yaml',
    code: 'version: 0.1\npatch: []',
  })
  assert.equal(validate(ast).hasErrors(), false)
})
