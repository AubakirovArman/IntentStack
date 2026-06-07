import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startEditorServer } from '../src/editor_server.js'

test('editor server serves graph UI and applies patches through intent writeback', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-editor-server-'))
  mkdirSync(join(dir, 'intent'), { recursive: true })
  const intentPath = join(dir, 'intent/app.intent.yaml')
  writeFileSync(intentPath, `version: 0.1
project:
  id: editor_app
  name: Editor App
  target: web_ts_minimal
pages:
  - id: home
    path: /
    sections:
      - id: hero
        type: hero
        title: Home
      - id: features
        type: card_grid
        title: Features
        items:
          - title: One
            text: First feature
`)

  const { server, port } = await startEditorServer({ projectDir: dir, port: 0 })
  try {
    const base = `http://127.0.0.1:${port}`
    const html = await fetch(base).then((res) => res.text())
    assert.match(html, /Apply patch/)
    assert.match(html, /Patch YAML/)
    assert.match(html, /Drag sections within a page/)
    assert.match(html, /data-section-move="true"/)
    assert.match(html, /data-section-id="hero"/)

    const state = await fetch(`${base}/api/state`).then((res) => res.json())
    assert.equal(state.ok, true)
    assert.equal(state.graph.project.id, 'editor_app')

    const applied = await fetch(`${base}/api/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patch: `version: 0.1
patch:
  - op: project.set_name
    name: Edited App
`,
      }),
    }).then((res) => res.json())
    assert.equal(applied.ok, true)
    assert.match(readFileSync(intentPath, 'utf8'), /Edited App/)

    const moved = await fetch(`${base}/api/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patch: `version: 0.1
patch:
  - op: section.move
    page: home
    section: hero
    after: features
`,
      }),
    }).then((res) => res.json())
    assert.equal(moved.ok, true)

    const next = await fetch(`${base}/api/state`).then((res) => res.json())
    assert.equal(next.graph.project.name, 'Edited App')
    assert.deepEqual(next.graph.pages[0].sections.map((section) => section.id), ['features', 'hero'])
    assert.equal(next.history.at(-1).patch, 'editor')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})
