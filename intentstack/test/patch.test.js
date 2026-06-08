import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { parseIntentFile } from '../src/parse.js'
import {
  applyPatch,
  formatPatchConflicts,
  patchCatalog,
  patchOps,
  patchSchema,
  precheckPatch,
  semanticPatchDiff,
} from '../src/patch.js'
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
    'section.module.add',
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
    'content.example.add',
    'content.block.move',
    'content.block.update',
    'content.block.remove',
  ]) {
    assert.ok(ops.includes(op), `${op} should be implemented`)
  }
  const catalog = patchCatalog()
  assert.deepEqual(Object.keys(catalog), ops)
  assert.equal(catalog['section.module.add'].category, 'section')
  assert.ok(catalog['content.example.add'].schema.required.includes('code'))
  const schema = patchSchema()
  assert.ok(schema.properties.patch.items.oneOf.some((item) => item.properties.op.const === 'content.example.add'))
})

test('applyPatch is atomic when a later operation fails', () => {
  const ast = {
    version: 0.1,
    project: { id: 'atomic_patch', target: 'web_ts_minimal' },
    entities: [],
    actions: [],
    pages: [
      {
        id: 'home',
        path: '/',
        sections: [{ id: 'hero', type: 'hero', title: 'Original' }],
      },
    ],
  }
  const before = JSON.stringify(ast)

  const { changes, errors } = applyPatch(ast, {
    patch: [
      { op: 'text.set', target: 'page.home.section.hero.title', value: 'Should not apply' },
      { op: 'text.set', target: 'page.home.section.missing.title', value: 'Missing' },
    ],
  })

  assert.equal(changes.length, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /cannot resolve target/)
  assert.equal(JSON.stringify(ast), before)
})

test('patch precheck rejects race-prone id mutations', () => {
  const ast = {
    version: 0.1,
    project: { id: 'id_race_patch', target: 'web_ts_minimal' },
    pages: [{ id: 'home', path: '/', sections: [{ id: 'hero', type: 'hero', title: 'Original' }] }],
  }
  const result = applyPatch(ast, { patch: [{ op: 'text.set', target: 'page.home.section.hero.id', value: 'renamed' }] })
  assert.match(result.errors[0], /id mutations require a dedicated rename operation/)
  assert.equal(ast.pages[0].sections[0].id, 'hero')
})

test('patch precheck rejects unsupported target capabilities before mutation', () => {
  const ast = {
    version: 0.1,
    project: { id: 'capability_patch', target: 'web_ts_minimal' },
    pages: [{ id: 'home', path: '/', sections: [] }],
  }
  const patch = { patch: [{ op: 'section.add', page: 'home', section: { id: 'timeline', type: 'timeline' } }] }
  const errors = precheckPatch(ast, patch.patch)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /does not support component "timeline"/)
  const result = applyPatch(ast, patch)
  assert.deepEqual(result.errors, errors)
  assert.deepEqual(result.changes, [])
  assert.equal(result.ast, ast)
  assert.equal(result.conflicts[0].fix_hint.kind, 'target_capability')
  assert.deepEqual(ast.pages[0].sections, [])
})

test('patch conflicts expose owner location and fix hints', () => {
  const ast = {
    version: 0.1,
    project: { id: 'conflict_patch', target: 'web_ts_minimal' },
    pages: [{ id: 'home', path: '/', sections: [{ id: 'hero', type: 'hero', title: 'Original' }] }],
  }
  Object.defineProperty(ast, '__intentstack', {
    enumerable: false,
    value: {
      rootPath: '/project/intent/app.intent.yaml',
      owners: {
        sections: { hero: { file: '/project/intent/frontend/sections/home/hero.section.yaml' } },
      },
    },
  })
  const result = applyPatch(ast, {
    patch: [{ op: 'text.set', target: 'section.hero.missing.title', value: 'Nope' }],
  })
  assert.equal(result.errors.length, 1)
  assert.equal(result.conflicts[0].file, '/project/intent/frontend/sections/home/hero.section.yaml')
  assert.equal(result.conflicts[0].fix_hint.kind, 'missing_reference')
  assert.match(formatPatchConflicts(result.conflicts), /Conflict explanations:/)
})

test('semanticPatchDiff emits minimal semantic operations that replay cleanly', () => {
  const before = {
    version: '0.1',
    project: { id: 'semantic_diff', name: 'Before', target: 'web_ts_minimal' },
    navigation: { logo: 'Before', items: [{ label: 'Home', href: '/' }] },
    entities: [{ id: 'Lead', fields: [{ id: 'name', type: 'string' }] }],
    actions: [],
    pages: [{ id: 'home', path: '/', sections: [{ id: 'hero', type: 'hero', title: 'Before' }] }],
  }
  const after = {
    ...before,
    project: { ...before.project, name: 'After' },
    navigation: { logo: 'After', items: [{ label: 'Home', href: '/' }, { label: 'Docs', href: '/docs' }] },
    entities: [{ id: 'Lead', fields: [{ id: 'name', type: 'string', label: 'Full name' }] }],
    pages: [{ id: 'home', path: '/start', sections: [{ id: 'hero', type: 'hero', title: 'After' }] }],
  }
  const patch = semanticPatchDiff(before, after)
  assert.deepEqual(patch.patch.map((op) => op.op), [
    'project.set_name',
    'navigation.set',
    'entity.field.update',
    'page.update',
    'section.update',
  ])
  const replay = JSON.parse(JSON.stringify(before))
  assert.deepEqual(applyPatch(replay, patch).errors, [])
  assert.equal(replay.project.name, 'After')
  assert.equal(replay.navigation.logo, 'After')
  assert.equal(replay.entities[0].fields[0].label, 'Full name')
  assert.equal(replay.pages[0].path, '/start')
  assert.equal(replay.pages[0].sections[0].title, 'After')
})
