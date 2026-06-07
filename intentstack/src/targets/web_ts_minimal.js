// Target adapter: web_ts_minimal (Vite + React + Tailwind/daisyUI · Hono · Drizzle/SQLite).
import { emitProject } from '../emit/project.js'
import { emitDatabase } from '../emit/database.js'
import { emitBackend } from '../emit/backend.js'
import { emitFrontend } from '../emit/frontend.js'

export const managedZones = ['src/generated', 'server/generated', 'migrations']

export function planFiles(graph) {
  return {
    ...emitProject(graph),
    ...emitDatabase(graph),
    ...emitBackend(graph),
    ...emitFrontend(graph),
  }
}
