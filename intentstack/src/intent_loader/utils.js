export function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export function normalizePath(p) {
  return String(p).replace(/[\\/]+/g, '/')
}

export function kebab(value) {
  return String(value).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'module'
}

export function samePath(a, b) {
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase()
}

export function stripMetadata(value) {
  return clone(value)
}

export function stripIncludes(doc) {
  const next = clone(doc)
  delete next.includes
  return next
}

export function defaultModulePath(rootPath, collection, id) {
  const rootDir = resolveDir(rootPath)
  const name = kebab(id)
  if (collection === 'entities') return `${rootDir}/backend/entities/${name}.entity.yaml`
  if (collection === 'actions') return `${rootDir}/backend/actions/${name}.action.yaml`
  if (collection === 'workflows') return `${rootDir}/backend/workflows/${name}.workflow.yaml`
  if (collection === 'integrations') return `${rootDir}/backend/integrations/${name}.integration.yaml`
  if (collection === 'pages') return `${rootDir}/frontend/pages/${name}.page.yaml`
  return `${rootDir}/${collection}/${name}.yaml`
}

export function singular(collection) {
  return {
    entities: 'entity',
    actions: 'action',
    workflows: 'workflow',
    integrations: 'integration',
    pages: 'page',
    sections: 'section',
  }[collection] || collection.replace(/s$/, '')
}

function resolveDir(p) {
  const parts = String(p).split('\\')
  return parts.slice(0, -1).join('/')
}
