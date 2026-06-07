// Emit orchestrator: dispatch on the chosen target, write files, clean only managed zones
// so hand-written custom/ code survives (PRD 32).
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ADAPTERS } from '../targets/index.js'

export function getAdapter(graph) {
  const id = graph.project?.target
  const adapter = ADAPTERS[id]
  if (!adapter) throw new Error(`No adapter registered for target "${id}". Available: ${Object.keys(ADAPTERS).join(', ')}`)
  return adapter
}

export function planFiles(graph) {
  return getAdapter(graph).planFiles(graph)
}

export function emit(graph, outDir, { clean = true } = {}) {
  const adapter = getAdapter(graph)
  const files = adapter.planFiles(graph)
  if (clean) {
    for (const zone of adapter.managedZones || []) {
      const p = join(outDir, zone)
      try { if (existsSync(p)) rmSync(p, { recursive: true, force: true }) } catch { /* best-effort: overwrite below */ }
    }
  }
  const written = []
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(outDir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
    written.push(rel)
  }
  return written.sort()
}
