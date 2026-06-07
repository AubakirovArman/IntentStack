// Target adapter: next_shadcn - Next.js App Router + shadcn/ui + route handlers, on the
// SAME Drizzle/SQLite data layer as web_ts_minimal. Same intent, different "how".
import { projectFiles } from './next_shadcn/project.js'
import { uiPrimitives } from './next_shadcn/ui.js'
import { dataLayer } from './next_shadcn/data.js'
import { apiRoutes } from './next_shadcn/api.js'
import { frontend } from './next_shadcn/frontend.js'

export const managedZones = ['app', 'components', 'lib', 'migrations']

export function planFiles(graph) {
  return {
    ...projectFiles(graph),
    ...uiPrimitives(),
    ...dataLayer(graph),
    ...apiRoutes(graph),
    ...frontend(graph),
  }
}
