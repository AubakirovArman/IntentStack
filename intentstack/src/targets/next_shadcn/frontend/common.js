import { jsStr, t } from '../../../emit/util.js'
import { componentClasses } from '../../../registry.js'
import { posix } from 'node:path'
import { BANNER } from '../constants.js'

export function buildNavbar(name, s) {
  const items = (s.items || [])
    .map((it) => `          <a href=${jsStr(it.href || '#')} className=\"transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring\">${t(it.label)}</a>`)
    .join('\n')
  return `${BANNER}export function ${name}() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <span className="text-lg font-semibold">${t(s.logo || 'App')}</span>
        <nav className="flex gap-6 text-sm text-muted-foreground" aria-label="Primary navigation">
${items}
        </nav>
      </div>
    </header>
  )
}
`
}

// compatibility alias for previous naming used across next_shadcn frontend modules
export const buildNav = buildNavbar

export function buildHero(name, s, theme) {
  const cls = componentClasses('hero', 'next_shadcn')
  const actions = (s.actions || []).map((a) => {
    const variant = a.kind === 'secondary' ? 'secondary' : a.kind === 'outline' ? 'outline' : 'default'
    const href = a.target || a.href || '#'
    return `          <a href=${jsStr(href)} className={cn(buttonVariants({ variant: '${variant}', size: 'lg' }))}>${t(a.label)}</a>`
  }).join('\n')
  return `${BANNER}import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ${name}() {
  return (
    <section className="${theme} ${cls.section || 'text-center'}">
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

export function buildCardGrid(name, s, theme) {
  const cls = componentClasses('card_grid', 'next_shadcn')
  const cols = Math.min(Math.max(Number(s.columns) || 3, 1), 4)
  const colClass = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }[cols]
  const cards = (s.items || []).map((it) =>
`          <Card>
            <CardHeader><CardTitle>${t(it.title)}</CardTitle></CardHeader>
            <CardContent className="${cls.text || 'text-muted-foreground'}">${t(it.text)}</CardContent>
          </Card>`).join('\n')
  const heading = s.title ? `        <h2 className="${cls.heading || 'mb-10 text-center text-3xl font-semibold'}">${t(s.title)}</h2>\n` : ''
  return `${BANNER}import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${theme} ${cls.section || 'bg-muted/30'}">
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

export function buildStats(name, s, theme) {
  const items = (s.items || s.stats || []).map((it) =>
`          <Card>
            <CardHeader><CardTitle>${t(it.value)}</CardTitle></CardHeader>
            <CardContent className="text-muted-foreground">${t(it.label || it.title || it.text)}</CardContent>
          </Card>`).join('\n')
  const heading = s.title ? `        <h2 className="mb-10 text-center text-3xl font-semibold">${t(s.title)}</h2>\n` : ''
  return `${BANNER}import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${theme}">
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

export function buildPricingCards(name, s, theme) {
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
  return `${BANNER}import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${theme} bg-muted/30">
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

export function buildChart(name, s, theme) {
  const cls = componentClasses('chart', 'next_shadcn')
  const items = s.data || s.items || []
  const max = Math.max(1, ...items.map((it) => Number(it.value) || 0))
  const rows = items.map((it) => {
    const value = Number(it.value) || 0
    const width = Math.max(2, Math.round((value / max) * 100))
    return `            <div className="grid grid-cols-[8rem_1fr_4rem] items-center gap-3">
              <span className="truncate text-sm font-medium">${t(it.label || it.title)}</span>
              <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: '${width}%' }} /></div>
              <span className="text-right text-sm tabular-nums">${t(value)}</span>
            </div>`
  }).join('\n')
  const heading = s.title ? `        <h2 className="mb-8 text-3xl font-semibold">${t(s.title)}</h2>\n` : ''
  return `${BANNER}import { Card, CardContent } from '@/components/ui/card'

export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${theme} ${cls.section || 'bg-background'}">
      <div className="mx-auto max-w-6xl px-4">
${heading}        <Card role="img" aria-label=${jsStr(s.title || 'Chart')}>
          <CardContent className="space-y-4 p-6">
${rows}
          </CardContent>
        </Card>
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
  return `${BANNER}import { ${s.component} } from ${jsStr(importPath(fromDir, s.source))}

${props}export function ${name}() {
  return <${s.component}${spread} />
}
`
}

export function buildFooter(name, s) {
  const text = s.text || `(c) ${new Date().getFullYear()}`
  return `${BANNER}export function ${name}() {
  return (
    <footer className="border-t bg-muted/30 py-8 text-center text-sm text-muted-foreground">
      <p>${t(text)}</p>
    </footer>
  )
}
`
}
