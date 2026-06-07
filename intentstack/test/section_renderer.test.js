import test from 'node:test'
import assert from 'node:assert/strict'
import { createSectionRenderer } from '../src/emit/shared/sections.js'

test('createSectionRenderer dispatches by section type', () => {
  const render = createSectionRenderer({
    hero: ({ section }) => `hero:${section.id}`,
  })

  assert.equal(render({ section: { id: 'intro', type: 'hero' } }), 'hero:intro')
  assert.equal(render({ section: { id: 'unknown', type: 'missing' } }), null)
})
