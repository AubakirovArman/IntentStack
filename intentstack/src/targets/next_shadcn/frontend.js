import { posix } from 'node:path'
import { pascal, jsStr, t } from '../../emit/util.js'
import { componentClasses } from '../../registry.js'
import { hasPageAuth, isActivePolicy, reactAuthTs, roleLiteral } from '../../emit/shared/modules.js'
import { createSectionRenderer } from '../../emit/shared/sections.js'
import { BANNER, pad } from './constants.js'

// ---- frontend (pages + section components) --------------------------------
export function frontend(graph) {
  const files = {}
  files['app/layout.tsx'] = layoutTsx(graph.project?.name || 'IntentStack App')
  if (hasPageAuth(graph)) files['components/generated/ProtectedPage.tsx'] = reactAuthTs(graph, BANNER)
  const globalNavName = hasGlobalNavigation(graph) ? 'AppNav' : null
  if (globalNavName) {
    files[`components/generated/${globalNavName}.tsx`] = buildNav(globalNavName, {
      id: 'app_nav',
      logo: graph.navigation.logo || graph.project?.name,
      items: graph.navigation.items || [],
    })
  }
  const sectionNames = assignSectionNames(graph, globalNavName ? [globalNavName] : [])
  for (const p of graph.pages) {
    const refs = []
    for (const s of p.sections || []) {
      const cname = sectionNames.get(sectionKey(p.id, s.id))
      const content = renderSection(graph, cname, s, p, sectionNames)
      if (!content) continue
      files[`components/generated/${cname}.tsx`] = content
      if (s.embed_only !== true) refs.push(cname)
    }
    files[pageFile(p)] = pageTsx(p, refs, pageUsesGlobalNav(graph, p) ? globalNavName : null)
  }
  return files
}

function assignSectionNames(graph, reserved = []) {
  const used = new Set(reserved)
  const names = new Map()
  for (const p of graph.pages) {
    for (const s of p.sections || []) {
      let name = pascal(s.id)
      if (used.has(name)) name = pascal(p.id) + name
      used.add(name)
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

const pageFile = (p) => 'app' + (p.path && p.path !== '/' ? nextRoutePath(p.path) : '') + '/page.tsx'

function nextRoutePath(path) {
  return String(path).split('/').map((part) => part.startsWith(':') ? `[${part.slice(1)}]` : part).join('/')
}

function layoutTsx(name) {
  return BANNER + `import type { ReactNode } from 'react'
import './globals.css'

export const metadata = { title: ${jsStr(name)} }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`
}

function pageTsx(p, refs, navName) {
  const imports = [
    navName ? `import { ${navName} } from '@/components/generated/${navName}'` : null,
    ...refs.map((n) => `import { ${n} } from '@/components/generated/${n}'`),
  ].filter(Boolean).join('\n')
  const nav = navName ? `      <${navName} />\n` : ''
  const body = refs.map((n) => `      <${n} />`).join('\n')
  const authImport = isActivePolicy(p.auth) ? `import { ProtectedPage } from '@/components/generated/ProtectedPage'\n` : ''
  const open = isActivePolicy(p.auth) ? `    <ProtectedPage roles={${roleLiteral(p.auth)}}>\n` : ''
  const close = isActivePolicy(p.auth) ? `    </ProtectedPage>\n` : ''
  if (p.layout === 'dashboard') {
    return BANNER + `${imports}
${authImport}

export default function Page() {
  return (
${open}    <main className="min-h-screen bg-muted/20">
${nav}
      <header className="mx-auto max-w-6xl px-4 pt-10"><h1 className="text-2xl font-semibold">${t(p.title || pascal(p.id))}</h1></header>
${body}
    </main>
${close}  )
}
`
  }
  return BANNER + `${imports}
${authImport}

export default function Page() {
  return (
${open}    <main className="min-h-screen bg-background">
${nav}${body}
    </main>
${close}  )
}
`
}

function hasGlobalNavigation(graph) {
  return Boolean(graph.navigation && graph.navigation.enabled !== false)
}

function pageUsesGlobalNav(graph, page) {
  return hasGlobalNavigation(graph) && page.navigation !== false
}

function renderSection(graph, name, s, page, sectionNames) {
  return renderNextSection({ graph, name, section: s, page, sectionNames })
}

const renderNextSection = createSectionRenderer({
  navbar: ({ name, section }) => buildNav(name, section),
  hero: ({ name, section, graph }) => buildHero(name, section, graph.theme),
  card_grid: ({ name, section, graph }) => buildFeatures(name, section, graph.theme),
  pricing_cards: ({ name, section, graph }) => buildPricingCards(name, section, graph.theme),
  stats: ({ name, section, graph }) => buildStats(name, section, graph.theme),
  content: ({ name, section, graph, page, sectionNames }) => buildContent(name, section, graph.theme, page, sectionNames),
  custom_component: ({ name, section }) => buildCustomComponent(name, section, 'components/generated'),
  form: ({ name, graph, section }) => buildForm(name, graph, section, graph.theme),
  table: ({ name, graph, section, page }) => buildTable(name, graph, section, page),
  record_detail: ({ name, graph, section, page }) => buildRecordDetail(name, graph, section, page, graph.theme),
  footer: ({ name, section }) => buildFooter(name, section),
})

function buildNav(name, s) {
  const items = (s.items || [])
    .map((it) => `          <a href=${jsStr(it.href || '#')} className="transition-colors hover:text-foreground">${t(it.label)}</a>`)
    .join('\n')
  return BANNER + `export function ${name}() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <span className="text-lg font-semibold">${t(s.logo || 'App')}</span>
        <nav className="flex gap-6 text-sm text-muted-foreground">
${items}
        </nav>
      </div>
    </header>
  )
}
`
}

function buildHero(name, s, theme) {
  const cls = componentClasses('hero', 'next_shadcn')
  const actions = (s.actions || []).map((a) => {
    const variant = a.kind === 'secondary' ? 'secondary' : a.kind === 'outline' ? 'outline' : 'default'
    const href = a.target || a.href || '#'
    return `          <a href=${jsStr(href)} className={cn(buttonVariants({ variant: '${variant}', size: 'lg' }))}>${t(a.label)}</a>`
  }).join('\n')
  return BANNER + `import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ${name}() {
  return (
    <section className="${pad(theme)} ${cls.section || 'text-center'}">
      <div className="${cls.inner || 'mx-auto max-w-3xl px-4'}">
        <h1 className="${cls.title || 'text-5xl font-bold tracking-tight'}">${t(s.title)}</h1>
        <p className="${cls.subtitle || 'mt-6 text-lg text-muted-foreground'}">${t(s.subtitle)}</p>
        <div className="${cls.actions || 'mt-8 flex flex-wrap justify-center gap-3'}">
${actions}
        </div>
      </div>
    </section>
  )
}
`
}

function buildFeatures(name, s, theme) {
  const cls = componentClasses('card_grid', 'next_shadcn')
  const cols = Math.min(Math.max(Number(s.columns) || 3, 1), 4)
  const colClass = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }[cols]
  const cards = (s.items || []).map((it) =>
`          <Card>
            <CardHeader><CardTitle>${t(it.title)}</CardTitle></CardHeader>
            <CardContent className="${cls.text || 'text-muted-foreground'}">${t(it.text)}</CardContent>
          </Card>`).join('\n')
  const heading = s.title ? `        <h2 className="${cls.heading || 'mb-10 text-center text-3xl font-semibold'}">${t(s.title)}</h2>\n` : ''
  return BANNER + `import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${pad(theme)} ${cls.section || 'bg-muted/30'}">
      <div className="${cls.container || 'mx-auto max-w-6xl px-4'}">
${heading}        <div className="grid grid-cols-1 ${colClass} gap-6">
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
  return BANNER + `import { ${s.component} } from ${jsStr(importPath(fromDir, s.source))}

${props}export function ${name}() {
  return <${s.component}${spread} />
}
`
}

function buildStats(name, s, theme) {
  const items = (s.items || s.stats || []).map((it) =>
`          <Card>
            <CardHeader><CardTitle>${t(it.value)}</CardTitle></CardHeader>
            <CardContent className="text-muted-foreground">${t(it.label || it.title || it.text)}</CardContent>
          </Card>`).join('\n')
  const heading = s.title ? `        <h2 className="mb-10 text-center text-3xl font-semibold">${t(s.title)}</h2>\n` : ''
  return BANNER + `import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${pad(theme)}">
      <div className="mx-auto max-w-6xl px-4">
${heading}        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
${items}
        </div>
      </div>
    </section>
  )
}
`
}

function buildPricingCards(name, s, theme) {
  const cols = Math.min(Math.max(Number(s.columns) || 3, 1), 4)
  const colClass = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }[cols]
  const cards = (s.plans || s.items || []).map((it) => {
    const features = (it.features || []).map((f) => `              <li>${t(f)}</li>`).join('\n')
    return `          <Card>
            <CardHeader>
              <CardTitle>${t(it.title || it.name)}</CardTitle>
              <p className="text-3xl font-bold">${t(it.price || it.value || '')}</p>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              ${it.text ? `<p>${t(it.text)}</p>` : ''}
              <ul className="list-disc pl-5 text-sm">
${features}
              </ul>
            </CardContent>
          </Card>`
  }).join('\n')
  const heading = s.title ? `        <h2 className="mb-10 text-center text-3xl font-semibold">${t(s.title)}</h2>\n` : ''
  return BANNER + `import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${pad(theme)} bg-muted/30">
      <div className="mx-auto max-w-6xl px-4">
${heading}        <div className="grid grid-cols-1 ${colClass} gap-6">
${cards}
        </div>
      </div>
    </section>
  )
}
`
}

function buildContent(name, s, theme, page, sectionNames) {
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
  const blocks = (s.blocks || []).map((block) => renderContentBlock(block, page, sectionNames)).join('\n')
  const title = s.title ? `          <h1 className="text-4xl font-bold tracking-tight">${t(s.title)}</h1>\n` : ''
  const toc = showToc ? `        <aside className="hidden lg:block">
          <nav className="sticky top-24 rounded-lg border bg-card p-4 text-sm">
            <p className="mb-3 font-medium text-muted-foreground">On this page</p>
${headings.map((h) => `            <a className="${h.level > 2 ? 'ml-3 ' : ''}block py-1 text-muted-foreground transition-colors hover:text-foreground" href="#${slug(h.id)}">${t(h.text)}</a>`).join('\n')}
          </nav>
        </aside>
` : ''
  const grid = showToc ? 'grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]' : 'grid'
  const max = page?.layout === 'docs' ? 'max-w-6xl' : 'max-w-4xl'
  return BANNER + `${imports ? `${imports}\n\n` : ''}export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${pad(theme)}">
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

function renderContentBlock(block, page, sectionNames) {
  if (block.type === 'heading') {
    const level = Math.min(Math.max(Number(block.level) || 2, 2), 4)
    const id = slug(block.id || block.text || '')
    const cls = level === 2 ? 'pt-4 text-2xl font-semibold tracking-tight' : level === 3 ? 'pt-3 text-xl font-semibold' : 'pt-2 text-lg font-semibold'
    const Tag = `h${level}`
    return `          <${Tag} id=${jsStr(id)} className="${cls}">${t(block.text)}</${Tag}>`
  }
  if (block.type === 'list') {
    const items = (block.items || []).map((item) => `            <li>${t(item)}</li>`).join('\n')
    return `          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
${items}
          </ul>`
  }
  if (block.type === 'code') {
    const label = block.language ? `          <div className="text-xs uppercase tracking-wide text-muted-foreground">${t(block.language)}</div>\n` : ''
    return `${label}          <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-sm"><code>${t(block.code)}</code></pre>`
  }
  if (block.type === 'example') {
    const component = block.section ? sectionNameFor(sectionNames, page, block.section) : null
    const id = slug(block.id || block.title || block.section || 'example')
    const title = block.title ? `            <h3 className="text-xl font-semibold">${t(block.title)}</h3>\n` : ''
    const text = block.text ? `            <p className="text-base leading-7 text-muted-foreground">${t(block.text)}</p>\n` : ''
    const label = block.language ? `              <div className="text-xs uppercase tracking-wide text-muted-foreground">${t(block.language)}</div>\n` : ''
    const preview = component
      ? `              <${component} />`
      : `              <p className="p-4 text-sm text-muted-foreground">Missing example section: ${t(block.section)}</p>`
    return `          <div id=${jsStr(id)} className="overflow-hidden rounded-lg border bg-card shadow-sm">
            <div className="space-y-2 border-b p-4">
${title}${text}            </div>
            <div className="bg-muted/30 [&_section]:py-8 [&_section_.max-w-6xl]:max-w-none">
${preview}
            </div>
            <div className="border-t bg-muted p-4">
${label}              <pre className="overflow-x-auto text-sm"><code>${t(block.code)}</code></pre>
            </div>
          </div>`
  }
  if (block.type === 'link') {
    return `          <p><a href=${jsStr(block.href)} className="font-medium text-primary underline-offset-4 hover:underline">${t(block.text)}</a></p>`
  }
  if (block.type === 'callout') {
    const title = block.title ? `            <p className="font-semibold">${t(block.title)}</p>\n` : ''
    return `          <div className="rounded-lg border bg-muted/50 p-4">
${title}            <p className="leading-7 text-muted-foreground">${t(block.text)}</p>
          </div>`
  }
  if (block.type === 'table') {
    const columns = block.columns || []
    const head = columns.map((column) => `              <th className="px-4 py-3 text-left font-medium">${t(column)}</th>`).join('\n')
    const rows = (block.rows || []).map((row) => `            <tr className="border-t">
${columns.map((column, index) => `              <td className="px-4 py-3">${t(tableCell(row, column, index))}</td>`).join('\n')}
            </tr>`).join('\n')
    return `          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
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
  return `          <p className="text-base leading-7 text-muted-foreground">${t(block.text)}</p>`
}

function tableCell(row, column, index) {
  if (Array.isArray(row)) return row[index]
  if (row && typeof row === 'object') return row[column] ?? row[slug(column)] ?? ''
  return ''
}

function buildForm(name, graph, s, theme) {
  const entity = graph.getEntity(s.entity)
  const P = pascal(s.entity)
  const fieldRefs = (s.fields && s.fields.length) ? s.fields : (entity?.fields || []).map((f) => f.id)
  const inputs = fieldRefs.map((ref) => {
    const fid = typeof ref === 'string' ? ref : (ref.name || ref.id)
    const f = (entity?.fields || []).find((x) => x.id === fid) || { id: fid, type: 'string' }
    const label = f.label || pascal(fid)
    const req = f.required ? ' required' : ''
    if (f.type === 'text') return `          <Textarea name=${jsStr(fid)}${req} placeholder=${jsStr(label)} />`
    if (f.type === 'enum') {
      const opts = (f.values || []).map((v) => `            <option value=${jsStr(v)}>${t(v)}</option>`).join('\n')
      return `          <select name=${jsStr(fid)}${req} defaultValue="" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="" disabled>${t(label)}</option>
${opts}
          </select>`
    }
    if (f.type === 'boolean') return `          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name=${jsStr(fid)} className="h-4 w-4" /><span>${t(label)}</span></label>`
    const inputType = f.type === 'number' ? 'number' : 'text'
    return `          <Input type="${inputType}" name=${jsStr(fid)}${req} placeholder=${jsStr(label)} />`
  }).join('\n')
  const success = s.submit?.success_message || 'Thank you. We will be in touch.'
  return BANNER + `'use client'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { create${P} } from '@/lib/api/client'

export function ${name}() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setStatus('loading')
    const payload = Object.fromEntries(new FormData(form).entries())
    const res = await create${P}(payload)
    setStatus(res.ok ? 'ok' : 'error')
    if (res.ok) form.reset()
  }
  return (
    <section id=${jsStr(s.id)} className="${pad(theme)}">
      <div className="mx-auto max-w-xl px-4">
        <h2 className="mb-8 text-center text-3xl font-semibold">${t(s.title || 'Contact')}</h2>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border bg-card p-6 shadow-sm">
${inputs}
          <Button type="submit" disabled={status === 'loading'}>{status === 'loading' ? 'Sending\u2026' : 'Submit'}</Button>
          {status === 'ok' && <p className="text-center text-sm text-green-600">${t(success)}</p>}
          {status === 'error' && <p className="text-center text-sm text-destructive">Something went wrong. Please try again.</p>}
        </form>
      </div>
    </section>
  )
}
`
}

function buildTable(name, graph, s, page) {
  const entity = graph.getEntity(s.entity)
  const P = pascal(s.entity)
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
    return `                <TableHead>${t(f?.label || pascal(c))}</TableHead>`
  }).join('\n')
  const tds = cols.map((c) => hasEdit
    ? `                  <TableCell>{editingId === Number(row.id) ? <input className="h-8 w-full rounded-md border px-2 text-sm" value={String(draft[${jsStr(c)}] ?? '')} onChange={(e) => setDraftValue(${jsStr(c)}, e.currentTarget.value)} /> : String(row[${jsStr(c)}] ?? '')}</TableCell>`
    : `                  <TableCell>{String(row[${jsStr(c)}] ?? '')}</TableCell>`).join('\n')
  const actionsTh = hasActions ? `                <TableHead className="w-40">Actions</TableHead>\n` : ''
  const detailTarget = (typeof detailAction === 'object' && detailAction.target) || defaultDetailPath(page?.path)
  const detailButton = hasDetail ? `<a className="text-sm text-muted-foreground" href={detailHref(${jsStr(detailTarget)}, row.id)}>Open</a>` : ''
  const editButtons = hasEdit ? `{editingId === Number(row.id) ? (
                      <>
                        <button type="button" className="text-sm font-medium" onClick={saveEdit}>Save</button>
                        <button type="button" className="text-sm text-muted-foreground" onClick={cancelEdit}>Cancel</button>
                      </>
                    ) : (
                      <button type="button" className="text-sm text-muted-foreground" onClick={() => startEdit(row)}>Edit</button>
                    )}` : ''
  const deleteButton = hasDelete ? `<button type="button" className="text-sm text-destructive" onClick={() => onDelete(Number(row.id))}>Delete</button>` : ''
  const actionsTd = hasActions ? `
                  <TableCell>
                    <div className="flex flex-wrap gap-3">
                      ${detailButton}
                      ${editButtons}
                      ${deleteButton}
                    </div>
                  </TableCell>` : ''
  const importNames = [`list${P}`, hasEdit ? `update${P}` : null, hasDelete ? `delete${P}` : null].filter(Boolean).join(', ')
  const colSpan = cols.length + (hasActions ? 1 : 0)
  return BANNER + `'use client'
import { useEffect, useState } from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { ${importNames} } from '@/lib/api/client'

export function ${name}() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  ${hasEdit ? `const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})` : ''}
  async function loadRows() {
    setLoading(true)
    const nextRows = await list${P}()
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
    const res = await update${P}(editingId, draft)
    if (res.ok) {
      cancelEdit()
      await loadRows()
    }
  }` : ''}
  ${hasDelete ? `async function onDelete(id: number) {
    if (!Number.isFinite(id)) return
    const res = await delete${P}(id)
    if (res.ok) await loadRows()
  }` : ''}
  ${hasDetail ? `function detailHref(pattern: string, id: unknown) {
    return pattern.replace(':id', encodeURIComponent(String(id)))
  }` : ''}
  useEffect(() => { void loadRows() }, [])
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
${ths}
${actionsTh}            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={${colSpan}} className="text-center text-muted-foreground">Loading\u2026</TableCell></TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={${colSpan}} className="text-center text-muted-foreground">No records yet</TableCell></TableRow>
            )}
            {!loading && rows.map((row, i) => (
              <TableRow key={i}>
${tds}
${actionsTd}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
`
}

function buildRecordDetail(name, graph, s, page, theme) {
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
    return hasUpdate ? `          <label className="grid gap-2">
            <span className="text-sm font-medium">${t(label)}</span>
            <Input value={String(draft[${jsStr(fid)}] ?? '')} onChange={(e) => setDraftValue(${jsStr(fid)}, e.currentTarget.value)} />
          </label>` : `          <div>
            <div className="text-sm text-muted-foreground">${t(label)}</div>
            <div className="font-medium">{String(record?.[${jsStr(fid)}] ?? '')}</div>
          </div>`
  }).join('\n')
  const imports = hasUpdate ? `get${P}, update${P}` : `get${P}`
  const uiImports = hasUpdate
    ? `import { Input } from '@/components/ui/input'\nimport { Button } from '@/components/ui/button'\n`
    : ''
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
  const button = hasUpdate ? `          <Button type="button" onClick={saveRecord} disabled={status === 'loading'}>{status === 'loading' ? 'Saving...' : 'Save changes'}</Button>
          {status === 'ok' && <p className="text-sm text-green-600">Saved.</p>}
          {status === 'error' && <p className="text-sm text-destructive">Could not save changes.</p>}` : ''
  return BANNER + `'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
${uiImports}import { ${imports} } from '@/lib/api/client'

export function ${name}() {
  const params = useParams()
  const rawId = params[${jsStr(param)}]
  const recordId = Number(Array.isArray(rawId) ? rawId[0] : rawId)
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
  useEffect(() => { void loadRecord() }, [rawId])
  return (
    <section className="${pad(theme)}">
      <div className="mx-auto max-w-2xl px-4">
        <Card>
          <CardHeader><CardTitle>${t(s.title || entity?.id || 'Record')}</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            {status === 'loading' && !record && <p className="text-sm text-muted-foreground">Loading...</p>}
${fields}
${button}
          </CardContent>
        </Card>
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
  const text = s.text || `(c) ${new Date().getFullYear()}`
  return BANNER + `export function ${name}() {
  return (
    <footer className="border-t bg-muted/30 py-8 text-center text-sm text-muted-foreground">
      <p>${t(text)}</p>
    </footer>
  )
}
`
}
