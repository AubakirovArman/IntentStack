import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

function normalize(s) {
  return String(s).replace(/\r\n/g, '\n')
}

function firstDifferentLine(a, b) {
  const aa = normalize(a).split('\n')
  const bb = normalize(b).split('\n')
  const n = Math.max(aa.length, bb.length)
  for (let i = 0; i < n; i++) {
    if ((aa[i] ?? '') !== (bb[i] ?? '')) return i + 1
  }
  return 1
}

function collectFiles(dir, base = dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...collectFiles(p, base))
    else if (st.isFile()) out.push(relative(base, p).replace(/\\/g, '/'))
  }
  return out
}

export function diffPlannedFiles(planned, outDir, managedZones = []) {
  const entries = []
  const plannedKeys = new Set(Object.keys(planned))

  for (const rel of Object.keys(planned).sort()) {
    const abs = join(outDir, rel)
    if (!existsSync(abs)) {
      entries.push({ kind: 'add', path: rel })
      continue
    }
    const current = readFileSync(abs, 'utf8')
    const next = planned[rel]
    if (normalize(current) !== normalize(next)) {
      entries.push({
        kind: 'change',
        path: rel,
        line: firstDifferentLine(current, next),
      })
    } else {
      entries.push({ kind: 'same', path: rel })
    }
  }

  for (const zone of managedZones) {
    const zoneDir = join(outDir, zone)
    for (const rel of collectFiles(zoneDir)) {
      const fullRel = join(zone, rel).replace(/\\/g, '/')
      if (!plannedKeys.has(fullRel)) entries.push({ kind: 'remove', path: fullRel })
    }
  }

  const counts = {
    add: entries.filter((e) => e.kind === 'add').length,
    change: entries.filter((e) => e.kind === 'change').length,
    remove: entries.filter((e) => e.kind === 'remove').length,
    same: entries.filter((e) => e.kind === 'same').length,
  }
  return { entries, counts, hasChanges: counts.add + counts.change + counts.remove > 0 }
}

export function formatDiff(diff, { verbose = false } = {}) {
  const lines = []
  for (const e of diff.entries) {
    if (e.kind === 'same' && !verbose) continue
    if (e.kind === 'add') lines.push(`  + ${e.path}`)
    else if (e.kind === 'remove') lines.push(`  - ${e.path}`)
    else if (e.kind === 'change') lines.push(`  ~ ${e.path} (first different line ${e.line})`)
    else lines.push(`  = ${e.path}`)
  }
  if (lines.length === 0) lines.push('  (no file changes)')
  lines.push(`\nSummary: ${diff.counts.add} add, ${diff.counts.change} change, ${diff.counts.remove} remove, ${diff.counts.same} unchanged`)
  return lines.join('\n')
}
