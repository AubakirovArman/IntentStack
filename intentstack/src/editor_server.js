import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import YAML from 'js-yaml'
import { loadIntentProject, writeIntentProject } from './intent_loader.js'
import { normalize } from './normalize.js'
import { validate } from './validate.js'
import { buildGraph } from './graph.js'
import { applyPatch } from './patch.js'
import { renderGraphHtml, renderPreviewHtml } from './visual_graph.js'

export function createEditorServer({ projectDir, cfg = {}, outDir = null, targetOverride = null } = {}) {
  const root = resolve(projectDir || '.')
  const outputDir = resolve(root, outDir || cfg.out || 'app')

  async function loadState() {
    const { intentPath, ast } = await loadIntentProject(root, cfg, { targetOverride })
    return stateFromAst({ intentPath, ast, projectDir: root, outDir: outputDir })
  }

  async function loadPreviewState() {
    const { ast } = await loadIntentProject(root, cfg, { targetOverride })
    const coreAst = normalize(ast)
    const diagnostics = validate(coreAst, { projectDir: root, outDir: outputDir })
    return {
      diagnostics,
      graph: diagnostics.hasErrors() ? null : buildGraph(coreAst),
    }
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://intentstack.local')
      if (req.method === 'GET' && url.pathname === '/') {
        const state = await loadState()
        if (state.diagnostics.errors.length > 0) return sendHtml(res, diagnosticsHtml(state))
        return sendHtml(res, renderGraphHtml(state.graph, state.history, { editorApi: true }))
      }
      if (req.method === 'GET' && url.pathname === '/api/state') {
        return sendJson(res, await loadState())
      }
      if (req.method === 'GET' && url.pathname === '/api/preview') {
        const state = await loadPreviewState()
        if (state.diagnostics.hasErrors()) return sendHtml(res, diagnosticsHtml({
          diagnostics: {
            errors: state.diagnostics.errors,
          },
        }), 400)
        return sendHtml(res, renderPreviewHtml(state.graph, { page: url.searchParams.get('page') }))
      }
      if (req.method === 'POST' && url.pathname === '/api/apply') {
        const body = await readBody(req)
        const patchText = parsePatchText(body)
        if (!patchText.trim()) return sendJson(res, { ok: false, errors: ['patch is required'] }, 400)
        const current = await loadIntentProject(root, cfg, { targetOverride })
        const patchDoc = YAML.load(patchText) || {}
        const { changes, errors } = applyPatch(current.ast, patchDoc)
        if (errors.length > 0) return sendJson(res, { ok: false, errors }, 400)
        const coreAst = normalize(current.ast)
        const diagnostics = validate(coreAst, { projectDir: root, outDir: outputDir })
        if (diagnostics.hasErrors()) {
          return sendJson(res, { ok: false, diagnostics: diagnostics.toJSON(), errors: diagnostics.errors.map((item) => item.message) }, 400)
        }
        const written = await writeIntentProject(current.ast, current.intentPath)
        appendPatchHistory(current.intentPath, 'editor', changes)
        const state = await loadState()
        return sendJson(res, { ok: true, changes, written, state })
      }
      sendJson(res, { ok: false, error: 'not_found' }, 404)
    } catch (err) {
      sendJson(res, {
        ok: false,
        error: err.message || String(err),
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
      }, 500)
    }
  })
  return server
}

export function startEditorServer(opts = {}) {
  const host = opts.host || '127.0.0.1'
  const port = Number(opts.port ?? 4321)
  const server = createEditorServer(opts)
  return new Promise((resolveStart) => {
    server.listen(port, host, () => {
      const addr = server.address()
      resolveStart({
        server,
        host,
        port: typeof addr === 'object' && addr ? addr.port : port,
      })
    })
  })
}

async function stateFromAst({ intentPath, ast, projectDir, outDir }) {
  const coreAst = normalize(ast)
  const diagnostics = validate(coreAst, { projectDir, outDir })
  const graph = diagnostics.hasErrors() ? null : buildGraph(coreAst)
  return {
    ok: !diagnostics.hasErrors(),
    intentPath,
    diagnostics: {
      items: diagnostics.toJSON(),
      errors: diagnostics.errors,
      warnings: diagnostics.warnings,
    },
    graph: graph ? graphSummary(graph) : null,
    history: readPatchHistory(intentPath),
  }
}

function parsePatchText(body) {
  try {
    const json = JSON.parse(body)
    return typeof json.patch === 'string' ? json.patch : ''
  } catch {
    return body
  }
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data, null, 2))
}

function sendHtml(res, html, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1024 * 1024) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolveBody(body))
    req.on('error', reject)
  })
}

function diagnosticsHtml(state) {
  const errors = state.diagnostics.errors.map((item) => `<li><strong>${escapeHtml(item.code)}</strong> ${escapeHtml(item.message)}</li>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>IntentStack editor diagnostics</title></head><body><h1>Intent diagnostics</h1><ul>${errors}</ul></body></html>`
}

function patchHistoryPath(intentPath) {
  return join(dirname(intentPath), '.intentstack', 'patch-history.ndjson')
}

function appendPatchHistory(intentPath, patchArg, changes) {
  const p = patchHistoryPath(intentPath)
  mkdirSync(dirname(p), { recursive: true })
  appendFileSync(p, JSON.stringify({
    timestamp: new Date().toISOString(),
    patch: patchArg,
    changes,
  }) + '\n')
}

function readPatchHistory(intentPath) {
  const p = patchHistoryPath(intentPath)
  if (!existsSync(p)) return []
  return readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line) } catch { return null }
    })
    .filter(Boolean)
}

function graphSummary(graph) {
  return {
    version: graph.version,
    project: graph.project,
    theme: graph.theme,
    auth: graph.auth,
    tenancy: graph.tenancy,
    navigation: graph.navigation,
    entities: graph.entities.map((e) => ({
      id: e.id,
      table: e.table || e.id.toLowerCase(),
      fields: (e.fields || []).map((f) => f.id),
    })),
    actions: graph.actions.map((a) => ({ id: a.id, type: a.type, entity: a.entity })),
    pages: graph.pages.map((p) => ({
      id: p.id,
      path: p.path,
      layout: p.layout,
      sections: (p.sections || []).map((s) => ({ id: s.id, type: s.type, entity: s.entity })),
    })),
    workflows: graph.workflows.map((w) => ({ id: w.id, trigger: w.trigger })),
    integrations: graph.integrations.map((i) => ({ id: i.id, type: i.type })),
    ir: {
      symbol_count: graph.symbolTable.length,
      binding_count: graph.bindings.length,
      symbols: graph.symbolTable,
      bindings: graph.bindings,
      types: graph.types,
    },
    modules: graph.modules?.modular ? {
      modular: true,
      root_path: graph.modules.rootPath,
      includes: graph.modules.includes || [],
      source_files: graph.modules.sourceFiles || [],
      owners: graph.modules.owners || {},
    } : { modular: false, source_files: [] },
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
