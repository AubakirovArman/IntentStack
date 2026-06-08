import { parseIntentFile } from '../parse.js'
import { stripMetadata, stripIncludes } from './utils.js'
import { collectIncludePlan } from './include_graph.js'

export function emptyAst(root) {
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

export function attachMetadata(ast, metadata) {
  Object.defineProperty(ast, '__intentstack', {
    value: metadata,
    enumerable: false,
    configurable: true,
    writable: true,
  })
}

export async function assembleIntent(root, rootPath) {
  const includes = Array.isArray(root.includes) ? root.includes : []
  if (includes.length === 0) {
    attachMetadata(root, {
      modular: false,
      rootPath,
      sourceFiles: [rootPath],
      owners: {},
      pathFiles: {
        version: rootPath,
        project: rootPath,
        theme: rootPath,
        navigation: rootPath,
        auth: rootPath,
      },
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

  const includePlan = await collectIncludePlan(root, rootPath)
  if (includePlan.errors.length) throw new Error(includePlan.errors.join('\n'))

  for (const file of includePlan.files) {
    const doc = await parseIntentFile(file)
    state.sourceFiles.push(file)
    mergeDoc(state, doc, file)
  }
  resolveSectionRefs(state)
  const ast = state.ast
  const pathFiles = buildPathFiles(ast, state.owners, rootPath)

  attachMetadata(ast, {
    modular: true,
    rootPath,
    includes,
    unresolvedIncludes: includePlan.unresolvedIncludes,
    includeGraph: { nodes: [...new Set([rootPath, ...includePlan.files])], edges: includePlan.edges },
    includeCycles: includePlan.includeCycles,
    sourceFiles: [...new Set(state.sourceFiles)],
    owners: state.owners,
    pathFiles,
  })

  return ast
}

export function mergeDoc(state, doc, file) {
  if (doc.version != null) state.ast.version = doc.version
  for (const key of ['project', 'theme', 'navigation', 'auth']) {
    if (doc[key] != null) {
      state.ast[key] = isPlainObject(doc[key]) && isPlainObject(state.ast[key])
        ? { ...state.ast[key], ...stripMetadata(doc[key]) }
        : stripMetadata(doc[key])
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

  if (Array.isArray(doc.pages)) for (const page of doc.pages) addPage(state, page, file)
  if (isPlainObject(doc.page)) addPage(state, doc.page, file)

  if (Array.isArray(doc.sections)) {
    for (const section of doc.sections) {
      const pageId = section.page || section.page_id
      addSectionDef(state, section, file, pageId)
    }
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
  const item = stripMetadata(value)
  state.ast[collection] = state.ast[collection] || []
  state.ast[collection].push(item)
  const id = item.id
  if (id) state.owners[collection][id] = { file, kind: singular(collection) }
}

function addPage(state, page, file) {
  const item = stripMetadata(page)
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
  const item = stripMetadata(section)
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
        next.push(resolved ? stripMetadata(resolved) : { id: section.ref, type: '__missing_ref' })
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
      page.sections.push(stripMetadata(section))
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

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
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
