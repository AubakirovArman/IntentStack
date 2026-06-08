import test from 'node:test'
import assert from 'node:assert/strict'
import { createSectionRenderer, sectionRendererContract, withSectionTelemetry } from '../src/emit/shared/sections.js'
import { webSectionContract } from '../src/emit/frontend/sections.js'
import { nextSectionContract } from '../src/targets/next_shadcn/frontend/sections.js'

test('createSectionRenderer dispatches by section type', () => {
  const render = createSectionRenderer({
    hero: ({ section }) => `hero:${section.id}`,
  })

  assert.equal(render({ section: { id: 'intro', type: 'hero' } }), 'hero:intro')
  assert.equal(render({ section: { id: 'unknown', type: 'missing' } }), null)
})

test('section renderer adds telemetry attributes and exposes adapter contracts', () => {
  const render = createSectionRenderer({
    hero: () => 'export function Hero() { return <section className="hero" /> }',
  })
  const source = render({ section: { id: 'intro', type: 'hero' } })
  assert.match(source, /data-intent-section-id="intro"/)
  assert.match(source, /data-intent-section-type="hero"/)
  assert.equal(withSectionTelemetry(source, { id: 'intro', type: 'hero' }), source)
  assert.deepEqual(sectionRendererContract({ hero: () => '' }), [{ type: 'hero', render: true }])
  assert.ok(webSectionContract.some((item) => item.type === 'form' && item.render))
  assert.ok(nextSectionContract.some((item) => item.type === 'table' && item.render))
})
