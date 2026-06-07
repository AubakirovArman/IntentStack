// Adapter registry. emit() dispatches on graph.project.target.
import * as web_ts_minimal from './web_ts_minimal.js'
import * as next_shadcn from './next_shadcn.js'

export const ADAPTERS = { web_ts_minimal, next_shadcn }
