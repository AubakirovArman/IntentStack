export const ROOT_KEYS = new Set([
  'version',
  'project',
  'theme',
  'navigation',
  'includes',
  'auth',
  'tenancy',
  'entities',
  'actions',
  'pages',
  'workflows',
  'integrations',
])

export const WORKFLOW_STEP_TYPES = ['email', 'webhook', 'background_job', 'state_transition', 'approval']
export const INTEGRATION_TYPES = ['webhook', 'email', 'crm', 'telegram', 'whatsapp', 'payment', 'external_api']
export const CONTENT_BLOCK_TYPES = ['heading', 'paragraph', 'list', 'code', 'link', 'callout', 'table', 'example']
export const SECRET_KEY = /(secret|token|password|api[_-]?key|private[_-]?key)/i
export const JS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export function attachProvenance(d, ast) {
  const pathFiles = ast?.__intentstack?.pathFiles
  if (!pathFiles) return d
  const entries = Object.entries(pathFiles).sort((a, b) => b[0].length - a[0].length)
  for (const item of d.items) {
    if (item.file || !item.path) continue
    const match = entries.find(([path]) => item.path === path || item.path.startsWith(`${path}.`))
    if (match) item.file = match[1]
  }
  return d
}

export function asArray(d, value, path) {
  if (value == null) return []
  if (Array.isArray(value)) return value
  d.error('E2003', `"${path}" must be an array.`, { path })
  return []
}

export function validateNavigation(d, navigation) {
  if (navigation == null) return
  if (typeof navigation !== 'object' || Array.isArray(navigation)) {
    d.error('E2100', 'navigation must be an object.', { path: 'navigation' })
    return
  }
  if (navigation.enabled != null && typeof navigation.enabled !== 'boolean') {
    d.error('E2101', 'navigation.enabled must be boolean.', { path: 'navigation.enabled' })
  }
  if (navigation.logo != null && typeof navigation.logo !== 'string') {
    d.error('E2102', 'navigation.logo must be a string.', { path: 'navigation.logo' })
  }
  const items = asArray(d, navigation.items, 'navigation.items')
  const seen = new Set()
  for (const [i, item] of items.entries()) {
    const base = `navigation.items[${i}]`
    if (!isPlainObject(item)) {
      d.error('E2103', 'navigation item must be an object.', { path: base })
      continue
    }
    if (!item.label) d.error('E2104', 'navigation item label is required.', { path: `${base}.label` })
    if (!item.href) d.error('E2105', 'navigation item href is required.', { path: `${base}.href` })
    const key = item.label || item.href
    if (key && seen.has(key)) d.warn('W2101', `Duplicate navigation item "${key}".`, { path: base })
    if (key) seen.add(key)
  }
}

export function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export function isJsonValue(value) {
  if (value == null) return true
  if (['string', 'number', 'boolean'].includes(typeof value)) return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (isPlainObject(value)) return Object.values(value).every(isJsonValue)
  return false
}

export function matchesPropType(value, type) {
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return isPlainObject(value)
  return typeof value === type
}

export function escapeRegex(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

export function entityFieldIds(entities, id) {
  const e = entities.find((x) => x.id === id)
  return new Set((e?.fields || []).map((f) => f.id))
}

export function actionById(actions, id) {
  return (actions || []).find((a) => a.id === id)
}

export function defaultDetailPath(path) {
  const base = String(path || '').replace(/\/$/, '')
  return `${base || '/'}/:id`.replace('//:id', '/:id')
}
