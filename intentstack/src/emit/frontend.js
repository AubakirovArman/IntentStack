// Frontend adapter: Pages/Sections -> React + daisyUI. One component module per section,
// composed by a page module; an API client derived from record actions.
import { posix } from 'node:path'
import { BANNER_TS, pascal, jsStr, t } from './util.js'
import { radiusClass, density } from '../registry.js'
import { hasPageAuth, isActivePolicy, reactAuthTs, roleLiteral } from './shared/modules.js'

export function emitFrontend(graph) {
  const files = {}
  const RAD = radiusClass(graph.theme)
  const DEN = density(graph.theme)

  files['src/generated/styles/theme.css'] = themeCss()
  files['src/generated/api/client.ts'] = clientTs(graph)
  files['src/generated/ErrorBoundary.tsx'] = errorBoundaryTsx()
  files['src/vite-env.d.ts'] = `/// <reference types="vite/client" />\n`
  if (hasPageAuth(graph)) files['src/generated/auth.tsx'] = reactAuthTs(graph, BANNER_TS)

  const routes = []
  const globalNavName = hasGlobalNavigation(graph) ? 'AppNav' : null
  if (globalNavName) {
    files[`src/generated/components/${globalNavName}.tsx`] = buildNavbar(globalNavName, {
      id: 'app_nav',
      logo: graph.navigation.logo || graph.project?.name,
      items: graph.navigation.items || [],
    })
  }
  const sectionNames = assignSectionNames(graph, globalNavName ? [globalNavName] : [])
  for (const p of graph.pages) {
    const pageComp = pascal(p.id) + 'Page'
    routes.push({ path: p.path, comp: pageComp })
    const refs = []
    for (const s of p.sections || []) {
      const name = sectionNames.get(sectionKey(p.id, s.id))
      const content = renderSection(graph, name, s, p, RAD, DEN, sectionNames)
      if (!content) continue
      files[`src/generated/components/${name}.tsx`] = content
      if (s.embed_only !== true) refs.push(name)
    }
    files[`src/generated/pages/${pageComp}.tsx`] = pageTsx(pageComp, p, refs, pageUsesGlobalNav(graph, p) ? globalNavName : null)
  }
  files['src/main.tsx'] = mainTsx()
  files['src/routes.tsx'] = routesTsx(routes)
  files['index.html'] = indexHtml(graph)
  return files
}

function assignSectionNames(graph, reserved = []) {
  const usedNames = new Set(reserved)
  const names = new Map()
  for (const p of graph.pages) {
    for (const s of p.sections || []) {
      let name = pascal(s.id)
      if (usedNames.has(name)) name = pascal(p.id) + name
      usedNames.add(name)
      names.set(sectionKey(p.id, s.id), name)
      if (!names.has(s.id)) names.set(s.id, name)
    }
  }
  return names
}

function sectionKey(pageId, sectionId) {
  return `${pageId}:${sectionId}`
}

function sectionNameFor(sectionNames, page, sectionId) {
  return sectionNames.get(sectionKey(page.id, sectionId)) || sectionNames.get(sectionId)
}

function renderSection(graph, name, s, page, RAD, DEN, sectionNames) {
  switch (s.type) {
    case 'navbar': return buildNavbar(name, s)
    case 'hero': return buildHero(name, s, RAD, DEN)
    case 'card_grid': return buildCardGrid(name, s, RAD, DEN)
    case 'pricing_cards': return buildPricingCards(name, s, RAD, DEN)
    case 'stats': return buildStats(name, s, RAD, DEN)
    case 'content': return buildContent(name, s, RAD, DEN, page, sectionNames)
    case 'custom_component': return buildCustomComponent(name, s, 'src/generated/components')
    case 'form': return buildForm(name, graph, s, RAD, DEN)
    case 'table': return buildTable(name, graph, s, page, RAD)
    case 'record_detail': return buildRecordDetail(name, graph, s, page, RAD, DEN)
    case 'footer': return buildFooter(name, s)
    default: return null
  }
}

function hasGlobalNavigation(graph) {
  return Boolean(graph.navigation && graph.navigation.enabled !== false)
}

function pageUsesGlobalNav(graph, page) {
  return hasGlobalNavigation(graph) && page.navigation !== false
}

function buildNavbar(name, s) {
  const items = (s.items || [])
    .map((it) => `        <li><a href=${jsStr(it.href || '#')}>${t(it.label)}</a></li>`)
    .join('\n')
  return BANNER_TS + `export function ${name}() {
  return (
    <div className="navbar bg-base-100 border-b border-base-200 sticky top-0 z-20">
      <div className="flex-1 px-2"><span className="text-xl font-semibold">${t(s.logo || 'App')}</span></div>
      <div className="flex-none">
        <ul className="menu menu-horizontal px-1">
${items}
        </ul>
      </div>
    </div>
  )
}
`
}

function buildHero(name, s, RAD, DEN) {
  const actions = (s.actions || []).map((a) => {
    const variant = a.kind === 'secondary' ? 'btn-secondary' : a.kind === 'outline' ? 'btn-outline' : 'btn-primary'
    const href = a.target || a.href || '#'
    return `          <a href=${jsStr(href)} className="btn ${variant} btn-lg ${RAD}">${t(a.label)}</a>`
  }).join('\n')
  return BANNER_TS + `export function ${name}() {
  return (
    <section className="hero ${DEN.section} bg-base-100">
      <div className="hero-content text-center">
        <div className="max-w-3xl">
          <h1 className="text-5xl font-bold tracking-tight">${t(s.title)}</h1>
          <p className="py-6 text-lg opacity-70">${t(s.subtitle)}</p>
          <div className="flex gap-3 justify-center flex-wrap">
${actions}
          </div>
        </div>
      </div>
    </section>
  )
}
`
}

function buildCardGrid(name, s, RAD, DEN) {
  const cols = Math.min(Math.max(Number(s.columns) || 3, 1), 4)
  const colClass = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }[cols]
  const cards = (s.items || []).map((it) =>
`        <div className="card bg-base-100 ${RAD} border border-base-200 shadow-sm">
          <div className="card-body">
            <h3 className="card-title">${t(it.title)}</h3>
            <p className="opacity-70">${t(it.text)}</p>
          </div>
        </div>`).join('\n')
  const heading = s.title ? `        <h2 className="text-3xl font-semibold text-center mb-10">${t(s.title)}</h2>\n` : ''
  return BANNER_TS + `export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${DEN.section} bg-base-200">
      <div className="max-w-6xl mx-auto px-4">
${heading}        <div className="grid grid-cols-1 ${colClass} ${DEN.gap}">
${cards}
        </div>
      </div>
    </section>
  )
}
`
}

function importPath(fromDir, source) {
  const noExt = String(source).replace(/\.(tsx|ts|jsx|js)$/, '')
  let rel = posix.relative(fromDir, noExt)
  if (!rel.startsWith('.')) rel = './' + rel
  return rel
}

function buildCustomComponent(name, s, fromDir) {
  const props = s.props ? `const props = ${JSON.stringify(s.props, null, 2)} as const\n\n` : ''
  const spread = s.props ? ' {...props}' : ''
  return BANNER_TS + `import { ${s.component} } from ${jsStr(importPath(fromDir, s.source))}

${props}export function ${name}() {
  return <${s.component}${spread} />
}
`
}

function buildStats(name, s, RAD, DEN) {
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

function buildPricingCards(name, s, RAD, DEN) {
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

function buildContent(name, s, RAD, DEN, page, sectionNames) {
  const headings = (s.blocks || [])
    .flatMap((block) => {
      if (block.type === 'heading' && block.text) return [{ id: block.id || slug(block.text), text: block.text, level: Number(block.level) || 2 }]
      if (block.type === 'example' && block.title) return [{ id: block.id || slug(block.title), text: block.title, level: Number(block.level) || 3 }]
      return []
    })
  const showToc = s.toc !== false && headings.length > 1
  const exampleComponents = [...new Set((s.blocks || [])
    .filter((block) => block.type === 'example' && block.section)
    .map((block) => sectionNameFor(sectionNames, page, block.section))
    .filter(Boolean))]
  const imports = exampleComponents.map((component) => `import { ${component} } from './${component}'`).join('\n')
  const blocks = (s.blocks || []).map((block) => renderContentBlock(block, RAD, page, sectionNames)).join('\n')
  const title = s.title ? `          <h1 className="text-4xl font-bold tracking-tight">${t(s.title)}</h1>\n` : ''
  const toc = showToc ? `        <aside className="hidden lg:block">
          <nav className="sticky top-24 rounded-lg border border-base-200 bg-base-100 p-4 text-sm">
            <p className="mb-3 font-medium opacity-70">On this page</p>
${headings.map((h) => `            <a className="${h.level > 2 ? 'ml-3 ' : ''}block py-1 opacity-70 hover:opacity-100" href="#${slug(h.id)}">${t(h.text)}</a>`).join('\n')}
          </nav>
        </aside>
` : ''
  const grid = showToc ? 'grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]' : 'grid'
  const max = page?.layout === 'docs' ? 'max-w-6xl' : 'max-w-4xl'
  return BANNER_TS + `${imports ? `${imports}\n\n` : ''}export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${DEN.section} bg-base-100">
      <div className="${max} mx-auto px-4 ${grid}">
${toc}        <article className="space-y-6">
${title}${blocks}
        </article>
      </div>
    </section>
  )
}
`
}

function renderContentBlock(block, RAD, page, sectionNames) {
  if (block.type === 'heading') {
    const level = Math.min(Math.max(Number(block.level) || 2, 2), 4)
    const id = slug(block.id || block.text || '')
    const cls = level === 2 ? 'text-2xl font-semibold tracking-tight pt-4' : level === 3 ? 'text-xl font-semibold pt-3' : 'text-lg font-semibold pt-2'
    const Tag = `h${level}`
    return `          <${Tag} id=${jsStr(id)} className="${cls}">${t(block.text)}</${Tag}>`
  }
  if (block.type === 'list') {
    const items = (block.items || []).map((item) => `            <li>${t(item)}</li>`).join('\n')
    return `          <ul className="list-disc space-y-2 pl-6 opacity-80">
${items}
          </ul>`
  }
  if (block.type === 'code') {
    const label = block.language ? `          <div className="text-xs uppercase tracking-wide opacity-60">${t(block.language)}</div>\n` : ''
    return `${label}          <pre className="${RAD} overflow-x-auto border border-base-200 bg-base-200 p-4 text-sm"><code>${t(block.code)}</code></pre>`
  }
  if (block.type === 'example') {
    const component = block.section ? sectionNameFor(sectionNames, page, block.section) : null
    const id = slug(block.id || block.title || block.section || 'example')
    const title = block.title ? `            <h3 className="text-xl font-semibold">${t(block.title)}</h3>\n` : ''
    const text = block.text ? `            <p className="text-base leading-7 opacity-80">${t(block.text)}</p>\n` : ''
    const label = block.language ? `              <div className="text-xs uppercase tracking-wide opacity-60">${t(block.language)}</div>\n` : ''
    const preview = component
      ? `              <${component} />`
      : `              <p className="p-4 text-sm opacity-70">Missing example section: ${t(block.section)}</p>`
    return `          <div id=${jsStr(id)} className="${RAD} overflow-hidden border border-base-200 bg-base-100 shadow-sm">
            <div className="space-y-2 border-b border-base-200 p-4">
${title}${text}            </div>
            <div className="bg-base-200/40 [&_section]:py-8 [&_section_.max-w-6xl]:max-w-none">
${preview}
            </div>
            <div className="border-t border-base-200 bg-base-200 p-4">
${label}              <pre className="overflow-x-auto text-sm"><code>${t(block.code)}</code></pre>
            </div>
          </div>`
  }
  if (block.type === 'link') {
    return `          <p><a href=${jsStr(block.href)} className="link link-primary font-medium">${t(block.text)}</a></p>`
  }
  if (block.type === 'callout') {
    const title = block.title ? `            <p className="font-semibold">${t(block.title)}</p>\n` : ''
    return `          <div className="${RAD} border border-info/30 bg-info/10 p-4">
${title}            <p className="leading-7 opacity-80">${t(block.text)}</p>
          </div>`
  }
  if (block.type === 'table') {
    const columns = block.columns || []
    const head = columns.map((column) => `              <th>${t(column)}</th>`).join('\n')
    const rows = (block.rows || []).map((row) => `            <tr>
${columns.map((column, index) => `              <td>${t(tableCell(row, column, index))}</td>`).join('\n')}
            </tr>`).join('\n')
    return `          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
${head}
                </tr>
              </thead>
              <tbody>
${rows}
              </tbody>
            </table>
          </div>`
  }
  return `          <p className="text-base leading-7 opacity-80">${t(block.text)}</p>`
}

function tableCell(row, column, index) {
  if (Array.isArray(row)) return row[index]
  if (row && typeof row === 'object') return row[column] ?? row[slug(column)] ?? ''
  return ''
}

function buildForm(name, graph, s, RAD, DEN) {
  const entity = graph.getEntity(s.entity)
  const fnName = 'create' + pascal(s.entity)
  const fieldRefs = (s.fields && s.fields.length) ? s.fields : (entity?.fields || []).map((f) => f.id)
  const inputs = fieldRefs.map((ref) => {
    const fid = typeof ref === 'string' ? ref : (ref.name || ref.id)
    const f = (entity?.fields || []).find((x) => x.id === fid) || { id: fid, type: 'string' }
    const label = f.label || pascal(fid)
    const req = f.required ? ' required' : ''
    if (f.type === 'text') {
      return `          <textarea name=${jsStr(fid)}${req} placeholder=${jsStr(label)} className="textarea textarea-bordered w-full" />`
    }
    if (f.type === 'enum') {
      const opts = (f.values || []).map((v) => `            <option value=${jsStr(v)}>${t(v)}</option>`).join('\n')
      return `          <select name=${jsStr(fid)}${req} className="select select-bordered w-full" defaultValue="">
            <option value="" disabled>${t(label)}</option>
${opts}
          </select>`
    }
    if (f.type === 'boolean') {
      return `          <label className="label cursor-pointer justify-start gap-3"><input type="checkbox" name=${jsStr(fid)} className="checkbox" /><span>${t(label)}</span></label>`
    }
    const inputType = f.type === 'number' ? 'number' : 'text'
    return `          <input type="${inputType}" name=${jsStr(fid)}${req} placeholder=${jsStr(label)} className="input input-bordered w-full" />`
  }).join('\n')
  const success = s.submit?.success_message || 'Thank you. We will be in touch.'
  return BANNER_TS + `import { useState } from 'react'
import type { FormEvent } from 'react'
import { ${fnName} } from '../api/client'

export function ${name}() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setStatus('loading')
    const payload = Object.fromEntries(new FormData(form).entries())
    const res = await ${fnName}(payload)
    setStatus(res.ok ? 'ok' : 'error')
    if (res.ok) form.reset()
  }
  return (
    <section id=${jsStr(s.id)} className="${DEN.section} bg-base-100">
      <div className="max-w-xl mx-auto px-4">
        <h2 className="text-3xl font-semibold text-center mb-8">${t(s.title || 'Contact')}</h2>
        <form onSubmit={onSubmit} className="card bg-base-100 ${RAD} border border-base-200 shadow-sm p-6 flex flex-col gap-3">
${inputs}
          <button type="submit" className="btn btn-primary w-full ${RAD}" disabled={status === 'loading'}>
            {status === 'loading' ? 'Sending…' : 'Submit'}
          </button>
          {status === 'ok' && <p className="text-success text-center">${t(success)}</p>}
          {status === 'error' && <p className="text-error text-center">Something went wrong. Please try again.</p>}
        </form>
      </div>
    </section>
  )
}
`
}

function buildTable(name, graph, s, page, RAD) {
  const entity = graph.getEntity(s.entity)
  const fnName = 'list' + pascal(s.entity)
  const updateFn = 'update' + pascal(s.entity)
  const deleteFn = 'delete' + pascal(s.entity)
  const detailAction = (s.row_actions || []).find((a) => (a.type || a) === 'detail')
  const hasDetail = Boolean(detailAction)
  const hasEdit = (s.row_actions || []).some((a) => a.type === 'edit') &&
    graph.actions.some((a) => a.entity === s.entity && a.type === 'update_record')
  const hasDelete = (s.row_actions || []).some((a) => a.type === 'delete') &&
    graph.actions.some((a) => a.entity === s.entity && a.type === 'delete_record')
  const hasActions = hasDetail || hasEdit || hasDelete
  const cols = (s.columns && s.columns.length ? s.columns : (entity?.fields || []).map((f) => f.id))
    .map((c) => (typeof c === 'string' ? c : c.id))
  const ths = cols.map((c) => {
    const f = (entity?.fields || []).find((x) => x.id === c)
    return `              <th>${t(f?.label || pascal(c))}</th>`
  }).join('\n')
  const tds = cols.map((c) => hasEdit
    ? `                <td>{editingId === Number(row.id) ? <input className="input input-bordered input-sm w-full" value={String(draft[${jsStr(c)}] ?? '')} onChange={(e) => setDraftValue(${jsStr(c)}, e.currentTarget.value)} /> : String(row[${jsStr(c)}] ?? '')}</td>`
    : `                <td>{String(row[${jsStr(c)}] ?? '')}</td>`).join('\n')
  const actionsTh = hasActions ? `              <th className="w-40">Actions</th>\n` : ''
  const detailTarget = (typeof detailAction === 'object' && detailAction.target) || defaultDetailPath(page?.path)
  const detailButton = hasDetail ? `<a className="btn btn-ghost btn-xs" href={detailHref(${jsStr(detailTarget)}, row.id)}>Open</a>` : ''
  const editButtons = hasEdit ? `{editingId === Number(row.id) ? (
                    <>
                      <button type="button" className="btn btn-primary btn-xs" onClick={saveEdit}>Save</button>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={cancelEdit}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => startEdit(row)}>Edit</button>
                  )}` : ''
  const deleteButton = hasDelete ? `<button type="button" className="btn btn-ghost btn-xs text-error" onClick={() => onDelete(Number(row.id))}>Delete</button>` : ''
  const actionsTd = hasActions ? `
                <td>
                  <div className="flex flex-wrap gap-2">
                    ${detailButton}
                    ${editButtons}
                    ${deleteButton}
                  </div>
                </td>` : ''
  const importNames = [fnName, hasEdit ? updateFn : null, hasDelete ? deleteFn : null].filter(Boolean).join(', ')
  const colSpan = cols.length + (hasActions ? 1 : 0)
  return BANNER_TS + `import { useEffect, useState } from 'react'
import { ${importNames} } from '../api/client'

export function ${name}() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  ${hasEdit ? `const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})` : ''}
  async function loadRows() {
    setLoading(true)
    const nextRows = await ${fnName}()
    setRows(nextRows)
    setLoading(false)
  }
  ${hasEdit ? `function startEdit(row: Record<string, unknown>) {
    setEditingId(Number(row.id))
    setDraft(row)
  }
  function cancelEdit() {
    setEditingId(null)
    setDraft({})
  }
  function setDraftValue(key: string, value: unknown) {
    setDraft((current) => ({ ...current, [key]: value }))
  }
  async function saveEdit() {
    if (editingId == null) return
    const res = await ${updateFn}(editingId, draft)
    if (res.ok) {
      cancelEdit()
      await loadRows()
    }
  }` : ''}
  ${hasDelete ? `async function onDelete(id: number) {
    if (!Number.isFinite(id)) return
    const res = await ${deleteFn}(id)
    if (res.ok) await loadRows()
  }` : ''}
  ${hasDetail ? `function detailHref(pattern: string, id: unknown) {
    return pattern.replace(':id', encodeURIComponent(String(id)))
  }` : ''}
  useEffect(() => { void loadRows() }, [])
  return (
    <section className="p-6">
      <div className="overflow-x-auto bg-base-100 ${RAD} border border-base-200">
        <table className="table">
          <thead>
            <tr>
${ths}
${actionsTh}            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={${colSpan}} className="text-center py-8"><span className="loading loading-spinner" /></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={${colSpan}} className="text-center opacity-60 py-8">No records yet</td></tr>
            )}
            {!loading && rows.map((row, i) => (
              <tr key={i}>
${tds}
${actionsTd}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
`
}

function buildRecordDetail(name, graph, s, page, RAD, DEN) {
  const entity = graph.getEntity(s.entity)
  const P = pascal(s.entity)
  const param = routeParam(page?.path)
  const hasUpdate = Boolean(s.update?.action) &&
    graph.actions.some((a) => a.entity === s.entity && a.type === 'update_record')
  const fieldRefs = (s.fields && s.fields.length) ? s.fields : (entity?.fields || []).map((f) => f.id)
  const fields = fieldRefs.map((ref) => {
    const fid = typeof ref === 'string' ? ref : (ref.name || ref.id)
    const f = (entity?.fields || []).find((x) => x.id === fid)
    const label = f?.label || pascal(fid)
    return hasUpdate ? `          <label className="form-control">
            <span className="label-text">${t(label)}</span>
            <input className="input input-bordered" value={String(draft[${jsStr(fid)}] ?? '')} onChange={(e) => setDraftValue(${jsStr(fid)}, e.currentTarget.value)} />
          </label>` : `          <div>
            <div className="text-sm opacity-60">${t(label)}</div>
            <div className="font-medium">{String(record?.[${jsStr(fid)}] ?? '')}</div>
          </div>`
  }).join('\n')
  const imports = hasUpdate ? `get${P}, update${P}` : `get${P}`
  const save = hasUpdate ? `
  function setDraftValue(key: string, value: unknown) {
    setDraft((current) => ({ ...current, [key]: value }))
  }
  async function saveRecord() {
    if (!Number.isFinite(recordId)) return
    setStatus('loading')
    const res = await update${P}(recordId, draft)
    setStatus(res.ok ? 'ok' : 'error')
    if (res.ok) {
      setRecord(res.data ?? draft)
      setDraft(res.data ?? draft)
    }
  }` : ''
  const button = hasUpdate ? `          <button type="button" className="btn btn-primary ${RAD}" onClick={saveRecord} disabled={status === 'loading'}>{status === 'loading' ? 'Saving...' : 'Save changes'}</button>
          {status === 'ok' && <p className="text-success text-sm">Saved.</p>}
          {status === 'error' && <p className="text-error text-sm">Could not save changes.</p>}` : ''
  return BANNER_TS + `import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ${imports} } from '../api/client'

export function ${name}() {
  const params = useParams()
  const recordId = Number(params[${jsStr(param)}])
  const [record, setRecord] = useState<Record<string, unknown> | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  async function loadRecord() {
    if (!Number.isFinite(recordId)) {
      setStatus('error')
      return
    }
    setStatus('loading')
    const res = await get${P}(recordId)
    setStatus(res.ok ? 'idle' : 'error')
    setRecord(res.data ?? null)
    setDraft(res.data ?? {})
  }
${save}
  useEffect(() => { void loadRecord() }, [params[${jsStr(param)}]])
  return (
    <section className="${DEN.section} bg-base-100">
      <div className="mx-auto max-w-2xl px-4">
        <div className="card bg-base-100 ${RAD} border border-base-200 shadow-sm">
          <div className="card-body gap-4">
            <h2 className="card-title">${t(s.title || entity?.id || 'Record')}</h2>
            {status === 'loading' && !record && <span className="loading loading-spinner" />}
${fields}
${button}
          </div>
        </div>
      </div>
    </section>
  )
}
`
}

function routeParam(path) {
  const part = String(path || '').split('/').find((x) => x.startsWith(':'))
  return part ? part.slice(1) : 'id'
}

function defaultDetailPath(path) {
  const base = String(path || '').replace(/\/$/, '')
  return `${base || '/'}/:id`.replace('//:id', '/:id')
}

function slug(value) {
  return String(value || 'section')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'section'
}

function buildFooter(name, s) {
  return BANNER_TS + `export function ${name}() {
  return (
    <footer className="footer footer-center bg-base-200 text-base-content p-8">
      <aside><p>${t(s.text || '© ' + new Date().getFullYear())}</p></aside>
    </footer>
  )
}
`
}

function pageTsx(pageComp, page, refs, navName) {
  const imports = [
    navName ? `import { ${navName} } from '../components/${navName}'` : null,
    ...refs.map((n) => `import { ${n} } from '../components/${n}'`),
  ].filter(Boolean).join('\n')
  const nav = navName ? `      <${navName} />\n` : ''
  const body = refs.map((n) => `      <${n} />`).join('\n')
  const wrapClass = page.layout === 'dashboard' ? 'min-h-screen bg-base-200' : 'min-h-screen bg-base-100'
  const heading = page.layout === 'dashboard'
    ? `      <header className="px-6 pt-8"><h1 className="text-2xl font-semibold">${t(page.title || pascal(page.id))}</h1></header>\n`
    : ''
  const authImport = isActivePolicy(page.auth) ? `import { ProtectedPage } from '../auth'\n` : ''
  const open = isActivePolicy(page.auth) ? `    <ProtectedPage roles={${roleLiteral(page.auth)}}>\n` : ''
  const close = isActivePolicy(page.auth) ? `    </ProtectedPage>\n` : ''
  return BANNER_TS + `${imports}
${authImport}

export function ${pageComp}() {
  return (
${open}    <main className="${wrapClass}">
${nav}${heading}${body}
    </main>
${close}  )
}
`
}

function clientTs(graph) {
  const byEntity = {}
  for (const a of graph.actions) {
    if (!a.entity) continue
    ;(byEntity[a.entity] ||= new Set()).add(a.type)
  }
  let out = BANNER_TS + `const BASE = import.meta.env.VITE_API_URL ?? ''

function csrfToken() {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.split('; ').find((part) => part.startsWith('intentstack_csrf='))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

function csrfHeaders(): Record<string, string> {
  const token = csrfToken()
  return token ? { 'X-CSRF-Token': token } : {}
}

`
  for (const [eid, types] of Object.entries(byEntity)) {
    const e = graph.getEntity(eid)
    const base = e?.table || eid.toLowerCase()
    const P = pascal(eid)
    if (types.has('create_record')) {
      out += `export async function create${P}(payload: Record<string, unknown>) {
  const res = await fetch(\`\${BASE}/api/${base}\`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, data: json.data, error: json.error }
}

`
    }
    if (types.has('list_records')) {
      out += `export async function list${P}(): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(\`\${BASE}/api/${base}\`, { credentials: 'include' })
  const json = await res.json().catch(() => ({ data: [] }))
  return (json.data ?? []) as Array<Record<string, unknown>>
}

`
    }
    if (types.has('get_record')) {
      out += `export async function get${P}(id: number): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: unknown }> {
  const res = await fetch(BASE + '/api/${base}/' + id, { credentials: 'include' })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, data: json.data, error: json.error }
}

`
    }
    if (types.has('update_record')) {
      out += `export async function update${P}(id: number, payload: Record<string, unknown>) {
  const res = await fetch(BASE + '/api/${base}/' + id, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, data: json.data, error: json.error }
}

`
    }
    if (types.has('delete_record')) {
      out += `export async function delete${P}(id: number) {
  const res = await fetch(BASE + '/api/${base}/' + id, { method: 'DELETE', credentials: 'include', headers: csrfHeaders() })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, data: json.data, error: json.error }
}

`
    }
  }
  return out
}

function mainTsx() {
  return BANNER_TS + `import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { ErrorBoundary } from './generated/ErrorBoundary'
import './generated/styles/theme.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
`
}

function errorBoundaryTsx() {
  return BANNER_TS + `import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(JSON.stringify({
      level: 'error',
      type: 'react_error_boundary',
      message: error.message,
      component_stack: errorInfo.componentStack,
    }))
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="min-h-screen bg-base-100 p-8 text-base-content">
        <div className="mx-auto max-w-xl rounded-lg border border-base-200 bg-base-100 p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 opacity-70">The page could not render. Check the console or server logs for the request id.</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </main>
    )
  }
}
`
}

function routesTsx(routes) {
  const imports = routes.map((r) => `import { ${r.comp} } from './generated/pages/${r.comp}'`).join('\n')
  const routeEls = routes.map((r) => `        <Route path=${jsStr(r.path)} element={<${r.comp} />} />`).join('\n')
  return BANNER_TS + `import { Routes, Route } from 'react-router-dom'
${imports}

export function AppRoutes() {
  return (
    <Routes>
${routeEls}
    </Routes>
  )
}
`
}

function themeCss() {
  return `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`
}

function indexHtml(graph) {
  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${graph.project?.name || 'IntentStack App'}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
}
