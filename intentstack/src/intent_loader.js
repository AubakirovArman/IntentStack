import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { parseIntentFile } from './parse.js'

export function findIntent(projectDir, cfgIntent) {
  const candidates = [cfgIntent, 'intent/app.intent.yaml', 'intent/app.intent.yml', 'intent/app.intent.json', 'app.intent.yaml'].filter(Boolean)
  for (const c of candidates) {
    const p = resolve(projectDir, c)
    if (existsSync(p)) return p
  }
  return null
}

export async function loadIntentProject(projectDir, cfg = {}, opts = {}) {
  const intentPath = opts.intentPath || (opts.intentArg ? resolve(opts.intentArg) : findIntent(projectDir, cfg.intent))
  if (!intentPath || !existsSync(intentPath)) {
    throw new Error(`No intent file found in ${projectDir}/intent/. Pass --intent <path>.`)
  }
  const root = await parseIntentFile(intentPath)
  const ast = await assembleIntent(root || {}, intentPath)
  if (opts.targetOverride) ast.project = { ...(ast.project || {}), target: opts.targetOverride }
  return { intentPath, ast }
}

export async function assembleIntent(root, rootPath) {
  const rootDir = dirname(rootPath)
  const includes = Array.isArray(root.includes) ? root.includes : []
  if (includes.length === 0) {
    attachMetadata(root, {
      modular: false,
      rootPath,
      sourceFiles: [rootPath],
      owners: {},
      pathFiles: { version: rootPath, project: rootPath, theme: rootPath, navigation: rootPath, auth: rootPath },
    })
    return root
  }

  const state = {
    ast: emptyAst(root),
    sectionDefs: new Map(),
    pendingSections: [],
    owners: {
      pages: {},
      sections: {},
      entities: {},
      actions: {},
      workflows: {},
      integrations: {},
    },
    sourceFiles: [rootPath],
  }
  mergeDoc(state, stripIncludes(root), rootPath)

  const files = includes.flatMap((pattern) => expandInclude(rootDir, pattern)).sort()
  for (const file of files) {
    const doc = await parseIntentFile(file)
    state.sourceFiles.push(file)
    mergeDoc(state, doc || {}, file)
  }
  resolveSectionRefs(state)
  const ast = state.ast
  const pathFiles = buildPathFiles(ast, state.owners, rootPath)
  attachMetadata(ast, {
    modular: true,
    rootPath,
    includes,
    sourceFiles: [...new Set(state.sourceFiles)],
    owners: state.owners,
    pathFiles,
  })
  return ast
}

function emptyAst(root) {
  return {
    version: root.version,
    project: {},
    pages: [],
    entities: [],
    actions: [],
    workflows: [],
    integrations: [],
  }
}

function stripIncludes(doc) {
  const next = clone(doc)
  delete next.includes
  return next
}

function mergeDoc(state, doc, file) {
  if (doc.version != null) state.ast.version = doc.version
  for (const key of ['project', 'theme', 'navigation', 'auth']) {
    if (doc[key] != null) {
      state.ast[key] = isPlainObject(doc[key]) && isPlainObject(state.ast[key])
        ? { ...state.ast[key], ...clone(doc[key]) }
        : clone(doc[key])
      state.owners[key] = file
    }
  }
  addMany(state, 'entities', doc.entities, file)
  addOne(state, 'entities', doc.entity, file)
  addMany(state, 'actions', doc.actions, file)
  addOne(state, 'actions', doc.action, file)
  addMany(state, 'workflows', doc.workflows, file)
  addOne(state, 'workflows', doc.workflow, file)
  addMany(state, 'integrations', doc.integrations, file)
  addOne(state, 'integrations', doc.integration, file)
  if (Array.isArray(doc.pages)) {
    for (const page of doc.pages) addPage(state, page, file)
  }
  if (isPlainObject(doc.page)) addPage(state, doc.page, file)
  if (Array.isArray(doc.sections)) {
    for (const section of doc.sections) addSectionDef(state, section, file, section.page || section.page_id)
  }
  if (isPlainObject(doc.section)) {
    const pageId = doc.page_id || (typeof doc.page === 'string' ? doc.page : doc.section.page || doc.section.page_id)
    addSectionDef(state, doc.section, file, pageId)
  }
}

function addMany(state, collection, values, file) {
  if (!Array.isArray(values)) return
  for (const value of values) addOne(state, collection, value, file)
}

function addOne(state, collection, value, file) {
  if (!isPlainObject(value)) return
  const item = clone(value)
  state.ast[collection] = state.ast[collection] || []
  state.ast[collection].push(item)
  const id = item.id
  if (id) state.owners[collection][id] = { file, kind: singular(collection) }
}

function addPage(state, page, file) {
  const item = clone(page)
  state.ast.pages.push(item)
  if (item.id) {
    state.owners.pages[item.id] = {
      file,
      kind: 'page',
      sectionRefs: (item.sections || []).map((section) => section?.ref || null),
    }
  }
}

function addSectionDef(state, section, file, pageId) {
  const item = clone(section)
  const id = item.id
  delete item.page
  delete item.page_id
  if (!id) return
  state.sectionDefs.set(id, item)
  state.owners.sections[id] = { file, kind: 'section', page: pageId || null }
  if (pageId) state.pendingSections.push({ pageId, sectionId: id })
}

function resolveSectionRefs(state) {
  const used = new Set()
  for (const page of state.ast.pages || []) {
    const next = []
    for (const section of page.sections || []) {
      if (section?.ref) {
        const resolved = state.sectionDefs.get(section.ref)
        next.push(resolved ? clone(resolved) : { id: section.ref, type: '__missing_ref' })
        used.add(section.ref)
      } else {
        next.push(section)
        if (section?.id) used.add(section.id)
      }
    }
    page.sections = next
  }
  for (const { pageId, sectionId } of state.pendingSections) {
    if (used.has(sectionId)) continue
    const page = state.ast.pages.find((item) => item.id === pageId)
    const section = state.sectionDefs.get(sectionId)
    if (page && section) {
      page.sections = page.sections || []
      page.sections.push(clone(section))
      used.add(sectionId)
    }
  }
}

function buildPathFiles(ast, owners, rootPath) {
  const map = { version: rootPath }
  for (const key of ['project', 'theme', 'navigation', 'auth']) {
    if (owners[key]) map[key] = owners[key]
  }
  for (const [i, page] of (ast.pages || []).entries()) {
    const pageOwner = owners.pages[page.id]?.file || rootPath
    map[`pages[${i}]`] = pageOwner
    for (const [j, section] of (page.sections || []).entries()) {
      map[`pages[${i}].sections[${j}]`] = owners.sections[section.id]?.file || pageOwner
    }
  }
  for (const [i, entity] of (ast.entities || []).entries()) map[`entities[${i}]`] = owners.entities[entity.id]?.file || rootPath
  for (const [i, action] of (ast.actions || []).entries()) map[`actions[${i}]`] = owners.actions[action.id]?.file || rootPath
  for (const [i, workflow] of (ast.workflows || []).entries()) map[`workflows[${i}]`] = owners.workflows[workflow.id]?.file || rootPath
  for (const [i, integration] of (ast.integrations || []).entries()) map[`integrations[${i}]`] = owners.integrations[integration.id]?.file || rootPath
  return map
}

function attachMetadata(ast, metadata) {
  Object.defineProperty(ast, '__intentstack', {
    value: metadata,
    enumerable: false,
    configurable: true,
    writable: true,
  })
}

function expandInclude(rootDir, pattern) {
  const absolutePattern = normalizePath(resolve(rootDir, pattern))
  if (!pattern.includes('*')) return existsSync(absolutePattern) ? [absolutePattern] : []
  const searchRoot = includeSearchRoot(rootDir, pattern)
  const files = walkFiles(searchRoot)
  const re = globRegex(absolutePattern)
  return files.filter((file) => re.test(normalizePath(file)))
}

function includeSearchRoot(rootDir, pattern) {
  const parts = normalizePath(pattern).split('/')
  const rootParts = []
  for (const part of parts) {
    if (part.includes('*')) break
    rootParts.push(part)
  }
  const p = resolve(rootDir, rootParts.join('/'))
  return existsSync(p) && statSync(p).isDirectory() ? p : dirname(p)
}

function walkFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const p = resolve(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(p))
    else if (entry.isFile()) out.push(p)
  }
  return out
}

function globRegex(pattern) {
  let out = '^'
  const chars = normalizePath(pattern)
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if (c === '*') {
      if (chars[i + 1] === '*') {
        out += '.*'
        i += 1
      } else {
        out += '[^/]*'
      }
    } else {
      out += escapeRegex(c)
    }
  }
  return new RegExp(out + '$')
}

function normalizePath(p) {
  return String(p).split(sep).join('/')
}

function escapeRegex(c) {
  return /[\\^$+?.()|[\]{}]/.test(c) ? `\\${c}` : c
}

function singular(collection) {
  return collection.replace(/s$/, '')
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
