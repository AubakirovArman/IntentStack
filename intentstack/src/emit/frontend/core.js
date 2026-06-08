import { pascal, BANNER_TS } from '../util.js'
import { radiusClass, density } from '../../registry.js'
import { hasPageAuth, reactAuthTs } from '../shared/modules.js'
import { assignSectionNames, pageUsesGlobalNav, renderSection, hasGlobalNavigation, sectionKey } from './sections.js'
import { clientTs, errorBoundaryTsx, indexHtml, mainTsx, pageTsx, routesTsx, themeCss } from './templates.js'
import { buildNavbar } from './builders/basic.js'
import { themeSwitcherTsx, toastHostTsx } from './app_shell.js'

export function emitFrontend(graph = {}) {
  const files = {}
  const RAD = radiusClass(graph.theme)
  const DEN = density(graph.theme)
  const pages = graph.pages || []

  files['src/generated/styles/theme.css'] = themeCss()
  files['src/generated/api/client.ts'] = clientTs(graph)
  files['src/generated/ErrorBoundary.tsx'] = errorBoundaryTsx()
  files['src/generated/ToastHost.tsx'] = toastHostTsx()
  files['src/generated/ThemeSwitcher.tsx'] = themeSwitcherTsx()
  files['src/vite-env.d.ts'] = `/// <reference types="vite/client" />\n`
  if (hasPageAuth(graph)) files['src/generated/auth.tsx'] = reactAuthTs(graph, BANNER_TS)

  const globalNavName = hasGlobalNavigation(graph) ? 'AppNav' : null
  if (globalNavName) {
    files[`src/generated/components/${globalNavName}.tsx`] = buildNavbar(globalNavName, {
      id: 'app_nav',
      logo: graph.navigation?.logo || graph.project?.name,
      items: graph.navigation?.items || [],
    })
  }

  const sectionNames = assignSectionNames(graph, globalNavName ? [globalNavName] : [])

  const routes = []
  for (const p of pages) {
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
    const navName = pageUsesGlobalNav(graph, p) ? globalNavName : null
    files[`src/generated/pages/${pageComp}.tsx`] = pageTsx(pageComp, p, refs, navName)
  }
  files['src/main.tsx'] = mainTsx()
  files['src/routes.tsx'] = routesTsx(routes)
  files['index.html'] = indexHtml(graph)
  return files
}
