import { createSectionRenderer, sectionRendererContract } from '../shared/sections.js'
import { pascal } from '../util.js'
import {
  buildCardGrid,
  buildChart,
  buildCustomComponent,
  buildHero,
  buildNavbar,
  buildPricingCards,
  buildStats,
} from './builders/basic.js'
import { buildContent, buildFooter } from './builders/content.js'
import { buildForm, buildRecordDetail } from './builders/forms.js'
import { buildTable } from './builders/tables.js'

export function assignSectionNames(graph, reserved = []) {
  const usedNames = new Set(reserved)
  const sectionNames = new Map()
  for (const p of graph.pages || []) {
    for (const s of p.sections || []) {
      let name = pascal(s.id)
      if (usedNames.has(name)) name = `${pascal(p.id)}${name}`
      usedNames.add(name)
      sectionNames.set(sectionKey(p.id, s.id), name)
      if (!sectionNames.has(s.id)) sectionNames.set(s.id, name)
    }
  }
  return sectionNames
}

export function sectionKey(pageId, sectionId) {
  return `${pageId}:${sectionId}`
}

export function pageUsesGlobalNav(graph, page) {
  return hasGlobalNavigation(graph) && page?.navigation !== false
}

export function hasGlobalNavigation(graph) {
  return Boolean(graph?.navigation && graph.navigation.enabled !== false)
}

export function renderSection(graph, name, s, page, RAD, DEN, sectionNames) {
  if (!s?.id) return null
  return renderFrontendSection({ graph, name, section: s, page, RAD, DEN, sectionNames })
}

const WEB_SECTION_HANDLERS = {
  navbar: ({ name, section }) => buildNavbar(name, section),
  hero: ({ name, section, RAD, DEN }) => buildHero(name, section, RAD, DEN),
  card_grid: ({ name, section, RAD, DEN }) => buildCardGrid(name, section, RAD, DEN),
  chart: ({ name, section, RAD, DEN }) => buildChart(name, section, RAD, DEN),
  pricing_cards: ({ name, section, RAD, DEN }) => buildPricingCards(name, section, RAD, DEN),
  stats: ({ name, section, RAD, DEN }) => buildStats(name, section, RAD, DEN),
  content: ({ name, section, page, RAD, DEN, sectionNames }) => buildContent(name, section, RAD, DEN, page, sectionNameFor(sectionNames)),
  custom_component: ({ name, section }) => buildCustomComponent(name, section, 'src/generated/components'),
  form: ({ name, graph, section, RAD, DEN }) => buildForm(name, graph, section, RAD, DEN),
  table: ({ name, graph, section, page, RAD }) => buildTable(name, graph, section, page, RAD),
  record_detail: ({ name, graph, section, page, RAD, DEN }) => buildRecordDetail(name, graph, section, page, RAD, DEN),
  footer: ({ name, section }) => buildFooter(name, section),
}

export const webSectionContract = sectionRendererContract(WEB_SECTION_HANDLERS)

const renderFrontendSection = createSectionRenderer(WEB_SECTION_HANDLERS)

function sectionNameFor(sectionNames) {
  return (sectionId, page) => sectionNames.get(sectionKey(page.id, sectionId)) || sectionNames.get(sectionId)
}
