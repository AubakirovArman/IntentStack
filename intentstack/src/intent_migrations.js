const CURRENT_VERSION = '0.1'

export function migrateIntent(ast, { from = String(ast?.version ?? CURRENT_VERSION), to = CURRENT_VERSION } = {}) {
  const source = normalizeVersion(from)
  const target = normalizeVersion(to)
  if (source === target) return { ast: cloneIntent(ast), changes: [], from: source, to: target }
  const key = `${source}->${target}`
  const migrator = MIGRATORS[key]
  if (!migrator) throw new Error(`No migrator available from ${from} to ${to}. Current compiler supports DSL ${CURRENT_VERSION}.`)
  const next = cloneIntent(ast)
  const changes = migrator(next)
  return { ast: next, changes, from: source, to: target }
}

export function availableMigrations() {
  return Object.keys(MIGRATORS).sort()
}

function migrateLegacyTo01(ast) {
  const changes = []
  if (ast.version !== '0.1') {
    ast.version = '0.1'
    changes.push('set version to 0.1')
  }
  if (!ast.project && ast.app) {
    ast.project = {
      id: ast.app.id || kebab(ast.app.name || 'app').replace(/-/g, '_'),
      name: ast.app.name,
      target: ast.app.target || 'web_ts_minimal',
    }
    delete ast.app
    changes.push('renamed app to project')
  }
  if (Array.isArray(ast.sections) && !Array.isArray(ast.pages)) {
    ast.pages = [{ id: 'home', path: '/', layout: 'landing', sections: ast.sections }]
    delete ast.sections
    changes.push('moved top-level sections into pages[0].sections')
  }
  if (ast.project && !ast.project.target) {
    ast.project.target = 'web_ts_minimal'
    changes.push('defaulted project.target to web_ts_minimal')
  }
  return changes
}

const MIGRATORS = {
  '0.0->0.1': migrateLegacyTo01,
  'legacy->0.1': migrateLegacyTo01,
}

function normalizeVersion(version) {
  const v = String(version ?? CURRENT_VERSION)
  if (v === '0' || v === '0.0.0') return '0.0'
  return v
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function cloneIntent(ast) {
  const next = clone(ast)
  if (ast?.__intentstack) {
    Object.defineProperty(next, '__intentstack', {
      value: clone(ast.__intentstack),
      enumerable: false,
      configurable: true,
      writable: true,
    })
  }
  return next
}

function kebab(value) {
  return String(value).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app'
}
