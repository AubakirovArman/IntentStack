import { pascal } from '../../../emit/util.js'
import { hasPageAuth, reactAuthTs } from '../../../emit/shared/modules.js'
import { assignSectionNames, pageFile, pageTsx, pageUsesGlobalNav, renderSection } from './sections.js'
import { buildNav } from './common.js'
import { layoutTsx } from './layout.js'
import { themeSwitcherTsx, toastHostTsx } from './app_shell.js'

export function frontend(graph = {}) {
  const files = {}
  const pages = graph.pages || []
  const sectionNames = assignSectionNames(graph, pageUsesGlobalNav(graph) ? ['AppNav'] : [])
  const globalNavName = pageUsesGlobalNav(graph) ? 'AppNav' : null

  files['app/layout.tsx'] = layoutTsx(graph.project?.name || 'IntentStack App')
  files['components/generated/ToastHost.tsx'] = toastHostTsx()
  files['components/generated/ThemeSwitcher.tsx'] = themeSwitcherTsx()
  if (hasPageAuth(graph)) files['components/generated/ProtectedPage.tsx'] = reactAuthTs(graph, '')

  if (globalNavName) {
    files[`components/generated/${globalNavName}.tsx`] = buildNav(globalNavName, {
      id: 'app_nav',
      logo: graph.navigation?.logo || graph.project?.name,
      items: graph.navigation?.items || [],
    })
  }

  for (const p of pages) {
    const refs = []
    for (const s of p.sections || []) {
      const name = sectionNames.get(`${p.id}:${s.id}`)
      const content = renderSection(graph, name, s, p, sectionNames)
      if (!content) continue
      files[`components/generated/${name}.tsx`] = content
      if (s.embed_only !== true) refs.push(name)
    }
    const navName = pageUsesGlobalNav(graph, p) ? globalNavName : null
    files[pageFile(p)] = pageTsx(pascal(p.id) + 'Page', p, refs, navName)
  }
  return files
}
