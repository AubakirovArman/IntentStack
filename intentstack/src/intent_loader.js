import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
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

  const includeResults = includes.map((pattern) => expandInclude(rootDir, pattern))
  const includeErrors = includeResults.filter((result) => result.error)
  if (includeErrors.length) {
    throw new Error(includeErrors.map((result) => result.error).join('\n'))
  }
  const unresolvedIncludes = includeResults
    .filter((result) => result.files.length === 0 && !result.optional)
    .map((result) => ({ pattern: result.pattern, root: result.searchRoot }))
  const files = includeResults.flatMap((result) => result.files).sort()
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
    unresolvedIncludes,
    sourceFiles: [...new Set(state.sourceFiles)],
    owners: state.owners,
    pathFiles,
  })
  return ast
}

export async function writeIntentProject(ast, intentPath, opts = {}) {
  if (!ast?.__intentstack?.modular || opts.singleFile) {
    await writeIntentFile(intentPath, stripMetadata(ast))
    return [intentPath]
  }

  const metadata = ast.__intentstack
  const rootPath = metadata.rootPath || intentPath
  const rootDoc = await parseIntentFile(rootPath)
  const written = new Set()
  const rootNext = clone(rootDoc || {})
  rootNext.version = ast.version
  rootNext.includes = metadata.includes || rootNext.includes || []

  for (const key of ['project', 'theme', 'navigation', 'auth']) {
    const owner = metadata.owners?.[key]
    if (!owner || samePath(owner, rootPath)) {
      if (ast[key] != null) rootNext[key] = clone(ast[key])
    } else if (ast[key] != null) {
      await writeIntentFile(owner, { [key]: stripMetadata(ast[key]) })
      written.add(owner)
    }
  }

  for (const key of ['entities', 'actions', 'workflows', 'integrations']) {
    await writeCollectionModules(ast, metadata, key, rootPath, written)
  }
  await writePageModules(ast, metadata, rootPath, written)
  await writeSectionModules(ast, metadata, written)

  await writeIntentFile(rootPath, rootNext)
  written.add(rootPath)
  return [...written]
}

async function writeCollectionModules(ast, metadata, collection, rootPath, written) {
  const owners = metadata.owners?.[collection] || {}
  const groups = new Map()
  for (const item of ast[collection] || []) {
    if (!item?.id) continue
    const owner = owners[item.id]?.file || defaultModulePath(rootPath, collection, item.id)
    if (samePath(owner, rootPath)) continue
    if (!groups.has(owner)) groups.set(owner, [])
    groups.get(owner).push(item)
  }
  for (const [file, items] of groups.entries()) {
    const doc = items.length === 1
      ? { [singular(collection)]: stripMetadata(items[0]) }
      : { [collection]: items.map(stripMetadata) }
    await writeIntentFile(file, doc)
    written.add(file)
  }
}

async function writePageModules(ast, metadata, rootPath, written) {
  const owners = metadata.owners?.pages || {}
  const groups = new Map()
  for (const page of ast.pages || []) {
    if (!page?.id) continue
    const owner = owners[page.id]?.file || defaultModulePath(rootPath, 'pages', page.id)
    if (samePath(owner, rootPath)) continue
    if (!groups.has(owner)) groups.set(owner, [])
    groups.get(owner).push(pageForWrite(page, metadata, owner))
  }
  for (const [file, pages] of groups.entries()) {
    const doc = pages.length === 1 ? { page: pages[0] } : { pages }
    await writeIntentFile(file, doc)
    written.add(file)
  }
}

async function writeSectionModules(ast, metadata, written) {
  const groups = new Map()
  const owners = metadata.owners?.sections || {}
  for (const page of ast.pages || []) {
    for (const section of page.sections || []) {
      const owner = section?.id ? owners[section.id] : null
      if (!owner?.file) continue
      if (!groups.has(owner.file)) groups.set(owner.file, [])
      groups.get(owner.file).push({ section, owner })
    }
  }
  for (const [file, entries] of groups.entries()) {
    const doc = entries.length === 1
      ? sectionDoc(entries[0].section, entries[0].owner)
      : { sections: entries.map((entry) => stripMetadata(entry.section)) }
    await writeIntentFile(file, doc)
    written.add(file)
  }
}

function pageForWrite(page, metadata, pageOwner) {
  const next = stripMetadata(page)
  next.sections = (page.sections || []).map((section) => {
    const owner = section?.id ? metadata.owners?.sections?.[section.id] : null
    return owner?.file && !samePath(owner.file, pageOwner)
      ? { ref: section.id }
      : stripMetadata(section)
  })
  return next
}

function sectionDoc(section, owner) {
  const doc = { section: stripMetadata(section) }
  if (owner?.page) doc.page = owner.page
  return doc
}

async function writeIntentFile(file, doc) {
  const mod = await import('js-yaml')
  const YAML = mod.default ?? mod
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, YAML.dump(doc, { lineWidth: 100, noRefs: true }))
}

function stripMetadata(value) {
  return clone(value)
}

function defaultModulePath(rootPath, collection, id) {
  const rootDir = dirname(rootPath)
  const name = kebab(id)
  if (collection === 'entities') return resolve(rootDir, `backend/entities/${name}.entity.yaml`)
  if (collection === 'actions') return resolve(rootDir, `backend/actions/${name}.action.yaml`)
  if (collection === 'workflows') return resolve(rootDir, `backend/workflows/${name}.workflow.yaml`)
  if (collection === 'integrations') return resolve(rootDir, `backend/integrations/${name}.integration.yaml`)
  if (collection === 'pages') return resolve(rootDir, `frontend/pages/${name}.page.yaml`)
  return resolve(rootDir, `${collection}/${name}.yaml`)
}

function kebab(value) {
  return String(value).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'module'
}

function samePath(a, b) {
  return normalizePath(resolve(a)).toLowerCase() === normalizePath(resolve(b)).toLowerCase()
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
  if (!pattern.includes('*')) {
    return existsSync(absolutePattern)
      ? { pattern, files: [absolutePattern], searchRoot: absolutePattern, optional: false }
      : { pattern, files: [], searchRoot: absolutePattern, optional: false, error: `Include "${pattern}" does not exist.` }
  }
  const searchRoot = includeSearchRoot(rootDir, pattern)
  const files = walkFiles(searchRoot)
  const re = globRegex(absolutePattern)
  return {
    pattern,
    files: files.filter((file) => re.test(normalizePath(file))),
    searchRoot,
    optional: optionalEmptyInclude(pattern),
  }
}

function optionalEmptyInclude(pattern) {
  const p = normalizePath(pattern).replace(/^\.\//, '')
  return [
    'backend/workflows/*.yaml',
    'backend/workflows/*.yml',
    'backend/workflows/**/*.yaml',
    'backend/workflows/**/*.yml',
    'backend/integrations/*.yaml',
    'backend/integrations/*.yml',
    'backend/integrations/**/*.yaml',
    'backend/integrations/**/*.yml',
  ].includes(p)
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
  return {
    entities: 'entity',
    actions: 'action',
    workflows: 'workflow',
    integrations: 'integration',
    pages: 'page',
    sections: 'section',
  }[collection] || collection.replace(/s$/, '')
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
