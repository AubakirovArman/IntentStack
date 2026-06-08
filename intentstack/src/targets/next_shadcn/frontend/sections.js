import { pascal } from '../../../emit/util.js'
import { createSectionRenderer, sectionRendererContract } from '../../../emit/shared/sections.js'
import { isActivePolicy, roleLiteral } from '../../../emit/shared/modules.js'
import { BANNER } from './constants.js'
import {
  buildCardGrid,
  buildChart,
  buildCustomComponent,
  buildFooter,
  buildHero,
  buildNav,
  buildPricingCards,
  buildStats,
} from './common.js'
import { buildContent, sectionNameFor } from './content.js'
import { buildForm, buildRecordDetail } from './forms.js'
import { buildTable } from './tables.js'

export function assignSectionNames(graph, reserved = []) {
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

export function renderSection(graph, name, s, page, sectionNames) {
  return renderNextSection({ graph, name, section: s, page, sectionNames })
}

const NEXT_SECTION_HANDLERS = {
  navbar: ({ name, section }) => buildNav(name, section),
  hero: ({ name, section, graph }) => buildHero(name, section, sectionClass(graph)),
  card_grid: ({ name, section, graph }) => buildCardGrid(name, section, sectionClass(graph)),
  chart: ({ name, section, graph }) => buildChart(name, section, sectionClass(graph)),
  pricing_cards: ({ name, section, graph }) => buildPricingCards(name, section, sectionClass(graph)),
  stats: ({ name, section, graph }) => buildStats(name, section, sectionClass(graph)),
  content: ({ name, section, graph, page, sectionNames }) =>
    buildContent(name, section, sectionClass(graph), page, sectionNames),
  custom_component: ({ name, section }) => buildCustomComponent(name, section, 'components/generated'),
  form: ({ name, graph, section }) => buildForm(name, graph, section, sectionClass(graph)),
  table: ({ name, graph, section, page }) => buildTable(name, graph, section, page, graph.theme),
  record_detail: ({ name, graph, section, page }) => buildRecordDetail(name, graph, section, page, sectionClass(graph)),
  footer: ({ name, section }) => buildFooter(name, section),
}

export const nextSectionContract = sectionRendererContract(NEXT_SECTION_HANDLERS)

const renderNextSection = createSectionRenderer(NEXT_SECTION_HANDLERS)

function sectionClass(graph) {
  const density = graph.theme?.density || 'comfortable'
  const py = density === 'compact' ? 'py-10' : density === 'spacious' ? 'py-24' : 'py-16'
  return `${py} bg-background`
}

function sectionKey(pageId, sectionId) {
  return `${pageId}:${sectionId}`
}

export function pageFile(p) {
  return 'app' + (p.path && p.path !== '/' ? nextRoutePath(p.path) : '') + '/page.tsx'
}

function nextRoutePath(path) {
  return String(path)
    .split('/')
    .map((part) => (part.startsWith(':') ? `[${part.slice(1)}]` : part))
    .join('/')
}

export function pageTsx(pageComp, page, refs, navName) {
  const imports = [
    navName ? `import { ${navName} } from '@/components/generated/${navName}'` : null,
    ...refs.map((n) => `import { ${n} } from '@/components/generated/${n}'`),
  ]
    .filter(Boolean)
    .join('\n')
  const nav = navName ? `      <${navName} />\n` : ''
  const body = refs.map((n) => `      <${n} />`).join('\n')
  const authImport = isActivePolicy(page.auth) ? `import { ProtectedPage } from '@/components/generated/ProtectedPage'\n` : ''
  const open = isActivePolicy(page.auth) ? `    <ProtectedPage roles={${roleLiteral(page.auth)}}>\n` : ''
  const close = isActivePolicy(page.auth) ? `    </ProtectedPage>\n` : ''
  if (page.layout === 'dashboard') {
    return `${BANNER}${imports}
${authImport}

export default function Page() {
  return (
${open}    <main className="min-h-screen bg-muted/20">
${nav}      <header className="mx-auto max-w-6xl px-4 pt-10"><h1 className="text-2xl font-semibold">${page.title || pascal(page.id)}</h1></header>
${body}
    </main>
${close}  )
}
`
  }
  return `${BANNER}${imports}
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
  return Boolean(graph?.navigation && graph.navigation.enabled !== false)
}

export function pageUsesGlobalNav(graph, page) {
  return hasGlobalNavigation(graph) && page?.navigation !== false
}
