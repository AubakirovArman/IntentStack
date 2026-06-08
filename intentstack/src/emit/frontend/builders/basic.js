import { posix } from 'node:path'
import { BANNER_TS, jsStr, t } from '../../util.js'
import { componentClasses } from '../../../registry.js'

export function hasGlobalNavigation(graph) {
  return Boolean(graph.navigation && graph.navigation.enabled !== false)
}

export function pageUsesGlobalNav(graph, page) {
  return hasGlobalNavigation(graph) && page.navigation !== false
}

export function buildNavbar(name, s) {
  const items = (s.items || [])
    .map((it) => `        <li><a className="focus:outline-none focus-visible:ring focus-visible:ring-primary" href=${jsStr(it.href || '#')}>${t(it.label)}</a></li>`)
    .join('\n')
  return BANNER_TS + `export function ${name}() {
  return (
    <div className="navbar bg-base-100 border-b border-base-200 sticky top-0 z-20">
      <div className="flex-1 px-2"><span className="text-xl font-semibold">${t(s.logo || 'App')}</span></div>
      <div className="flex-none">
        <ul className="menu menu-horizontal px-1" aria-label="Primary navigation">
${items}
        </ul>
      </div>
    </div>
  )
}
`
}

export function buildHero(name, s, RAD, DEN) {
  const cls = componentClasses('hero', 'web_ts_minimal')
  const actions = (s.actions || []).map((a) => {
    const variant = a.kind === 'secondary' ? 'btn-secondary' : a.kind === 'outline' ? 'btn-outline' : 'btn-primary'
    const href = a.target || a.href || '#'
    return `          <a href=${jsStr(href)} className="btn ${variant} btn-lg ${RAD}">${t(a.label)}</a>`
  }).join('\n')
  return BANNER_TS + `export function ${name}() {
  return (
    <section className="hero ${DEN.section} ${cls.section || 'bg-base-100'}">
      <div className="hero-content text-center">
        <div className="max-w-3xl">
          <h1 className="${cls.title || 'text-5xl font-bold tracking-tight'}">${t(s.title)}</h1>
          <p className="${cls.subtitle || 'py-6 text-lg opacity-70'}">${t(s.subtitle)}</p>
          <div className="${cls.actions || 'flex gap-3 justify-center flex-wrap'}">
${actions}
          </div>
        </div>
      </div>
    </section>
  )
}
`
}

export function buildCardGrid(name, s, RAD, DEN) {
  const cls = componentClasses('card_grid', 'web_ts_minimal')
  const cols = Math.min(Math.max(Number(s.columns) || 3, 1), 4)
  const colClass = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }[cols]
  const cards = (s.items || []).map((it) =>
`        <div className="${cls.card || 'card bg-base-100 border border-base-200 shadow-sm'} ${RAD}">
          <div className="card-body">
            <h3 className="card-title">${t(it.title)}</h3>
            <p className="${cls.text || 'opacity-70'}">${t(it.text)}</p>
          </div>
        </div>`).join('\n')
  const heading = s.title ? `        <h2 className="${cls.heading || 'text-3xl font-semibold text-center mb-10'}">${t(s.title)}</h2>\n` : ''
  return BANNER_TS + `export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${DEN.section} ${cls.section || 'bg-base-200'}">
      <div className="${cls.container || 'max-w-6xl mx-auto px-4'}">
${heading}        <div className="grid grid-cols-1 ${colClass} ${DEN.gap}">
${cards}
        </div>
      </div>
    </section>
  )
}
`
}

export function importPath(fromDir, source) {
  const noExt = String(source).replace(/\.(tsx|ts|jsx|js)$/, '')
  let rel = posix.relative(fromDir, noExt)
  if (!rel.startsWith('.')) rel = './' + rel
  return rel
}

export function buildCustomComponent(name, s, fromDir) {
  const props = s.props ? `const props = ${JSON.stringify(s.props, null, 2)} as const\n\n` : ''
  const spread = s.props ? ' {...props}' : ''
  return BANNER_TS + `import { ${s.component} } from ${jsStr(importPath(fromDir, s.source))}

${props}export function ${name}() {
  return <${s.component}${spread} />
}
`
}

export function buildStats(name, s, RAD, DEN) {
  const items = (s.items || s.stats || []).map((it) =>
`          <div className="stat">
            <div className="stat-title">${t(it.label || it.title)}</div>
            <div className="stat-value">${t(it.value)}</div>
            ${it.text ? `<div className="stat-desc">${t(it.text)}</div>` : ''}
          </div>`).join('\n')
  const heading = s.title ? `        <h2 className="text-3xl font-semibold text-center mb-10">${t(s.title)}</h2>\n` : ''
  return BANNER_TS + `export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${DEN.section} bg-base-100">
      <div className="max-w-6xl mx-auto px-4">
${heading}        <div className="stats stats-vertical md:stats-horizontal shadow w-full ${RAD}">
${items}
        </div>
      </div>
    </section>
  )
}
`
}

export function buildPricingCards(name, s, RAD, DEN) {
  const plans = (s.plans || s.items || []).map((it) => {
    const features = (it.features || []).map((f) => `              <li>${t(f)}</li>`).join('\n')
    const price = it.price || it.value || ''
    return `        <div className="card bg-base-100 ${RAD} border border-base-200 shadow-sm">
          <div className="card-body">
            <h3 className="card-title">${t(it.title || it.name)}</h3>
            <p className="text-3xl font-bold">${t(price)}</p>
            ${it.text ? `<p className="opacity-70">${t(it.text)}</p>` : ''}
            <ul className="list-disc pl-5 text-sm opacity-80">
${features}
            </ul>
          </div>
        </div>`
  }).join('\n')
  const cols = Math.min(Math.max(Number(s.columns) || 3, 1), 4)
  const colClass = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }[cols]
  const heading = s.title ? `        <h2 className="text-3xl font-semibold text-center mb-10">${t(s.title)}</h2>\n` : ''
  return BANNER_TS + `export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${DEN.section} bg-base-200">
      <div className="max-w-6xl mx-auto px-4">
${heading}        <div className="grid grid-cols-1 ${colClass} ${DEN.gap}">
${plans}
        </div>
      </div>
    </section>
  )
}
`
}

export function buildChart(name, s, RAD, DEN) {
  const cls = componentClasses('chart', 'web_ts_minimal')
  const items = s.data || s.items || []
  const max = Math.max(1, ...items.map((it) => Number(it.value) || 0))
  const rows = items.map((it) => {
    const value = Number(it.value) || 0
    const width = Math.max(2, Math.round((value / max) * 100))
    return `          <div className="grid grid-cols-[8rem_1fr_4rem] items-center gap-3">
            <span className="truncate text-sm font-medium">${t(it.label || it.title)}</span>
            <div className="h-3 overflow-hidden rounded-full bg-base-200"><div className="h-full bg-primary" style={{ width: '${width}%' }} /></div>
            <span className="text-right text-sm tabular-nums">${t(value)}</span>
          </div>`
  }).join('\n')
  const heading = s.title ? `        <h2 className="text-3xl font-semibold mb-8">${t(s.title)}</h2>\n` : ''
  return BANNER_TS + `export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${DEN.section} ${cls.section || 'bg-base-100'}">
      <div className="max-w-6xl mx-auto px-4">
${heading}        <div className="card bg-base-100 border border-base-200 shadow-sm ${RAD}" role="img" aria-label=${jsStr(s.title || 'Chart')}>
          <div className="card-body gap-4">
${rows}
          </div>
        </div>
      </div>
    </section>
  )
}
`
}
