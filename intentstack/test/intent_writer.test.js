import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { attachMetadata } from '../src/intent_loader.js'
import { writeIntentProject } from '../src/intent_loader.js'

test('modular intent writer returns deterministic sorted paths', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-writer-order-'))
  try {
    const root = join(dir, 'intent/app.intent.yaml')
    const ast = {
      version: '0.1',
      project: { id: 'writer_order', target: 'web_ts_minimal' },
      pages: [{ id: 'home', path: '/', sections: [] }],
      entities: [{ id: 'Zed', fields: [] }, { id: 'Alpha', fields: [] }],
      actions: [],
      workflows: [],
      integrations: [],
    }
    attachMetadata(ast, {
      modular: true,
      rootPath: root,
      includes: ['backend/entities/*.yaml', 'frontend/pages/*.yaml'],
      owners: {
        entities: {
          Zed: { file: join(dir, 'intent/backend/entities/zed.yaml') },
          Alpha: { file: join(dir, 'intent/backend/entities/alpha.yaml') },
        },
        pages: { home: { file: join(dir, 'intent/frontend/pages/home.yaml') } },
        sections: {},
      },
    })
    const written = await writeIntentProject(ast, root)
    assert.deepEqual(written, [...written].sort())
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('modular intent writer rolls back multi-file writes on failure', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-writer-rollback-'))
  try {
    const root = join(dir, 'intent/app.intent.yaml')
    const entityFile = join(dir, 'intent/backend/entities/a.yaml')
    const badPageFile = join(dir, 'intent/frontend/pages/z.yaml')
    mkdirSync(join(dir, 'intent/backend/entities'), { recursive: true })
    mkdirSync(badPageFile, { recursive: true })
    writeFileSync(entityFile, 'entity:\n  id: Old\n')
    writeFileSync(root, 'version: 0.1\n')
    const ast = {
      version: '0.1',
      project: { id: 'writer_rollback', target: 'web_ts_minimal' },
      pages: [{ id: 'home', path: '/', sections: [] }],
      entities: [{ id: 'Alpha', fields: [] }],
      actions: [],
    }
    attachMetadata(ast, {
      modular: true,
      rootPath: root,
      includes: ['backend/entities/*.yaml', 'frontend/pages/*.yaml'],
      owners: {
        entities: { Alpha: { file: entityFile } },
        pages: { home: { file: badPageFile } },
        sections: {},
      },
    })

    await assert.rejects(() => writeIntentProject(ast, root))
    assert.equal(readFileSync(entityFile, 'utf8'), 'entity:\n  id: Old\n')
    assert.equal(readFileSync(root, 'utf8'), 'version: 0.1\n')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
