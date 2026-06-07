import { spawnSync } from 'node:child_process'
import { relative, resolve } from 'node:path'

export function collaborationReport(graph, projectDir, opts = {}) {
  const modules = graph.modules || {}
  const owners = ownerEntries(graph)
  const git = gitChanges(projectDir, opts.base || 'HEAD')
  const changedFiles = git.changedFiles.map((file) => resolve(git.root || projectDir, file))
  const incoming = opts.incoming ? gitChangesBetween(projectDir, opts.base || 'HEAD', opts.incoming) : null
  const incomingFiles = incoming?.changedFiles?.map((file) => resolve(incoming.root || projectDir, file)) || []
  const sourceFiles = new Set((modules.sourceFiles || []).map((file) => normalizeAbs(file)))
  const ownerByFile = groupOwnersByFile(owners)

  const changedOwners = []
  const incomingOwners = []
  const unknownIntentFiles = []
  for (const file of changedFiles) {
    const key = normalizeAbs(file)
    const rel = relProject(projectDir, file)
    const matches = ownerByFile.get(key) || []
    for (const owner of matches) changedOwners.push({ ...owner, changed_file: rel })
    if (isIntentFile(projectDir, file) && matches.length === 0 && !sourceFiles.has(key)) {
      unknownIntentFiles.push(rel)
    }
  }
  for (const file of incomingFiles) {
    const key = normalizeAbs(file)
    const rel = relProject(projectDir, file)
    const matches = ownerByFile.get(key) || []
    for (const owner of matches) incomingOwners.push({ ...owner, changed_file: rel })
  }
  const localOwners = dedupeOwners(changedOwners)
  const remoteOwners = dedupeOwners(incomingOwners)
  const conflicts = ownerConflicts(localOwners, remoteOwners)

  const findings = []
  if (!git.available) {
    findings.push({
      code: 'COLLAB_GIT_UNAVAILABLE',
      severity: 'warn',
      message: git.error || 'Git metadata is unavailable for this project.',
    })
  }
  if (incoming && !incoming.available) {
    findings.push({
      code: 'COLLAB_INCOMING_UNAVAILABLE',
      severity: 'warn',
      message: incoming.error || `Git metadata is unavailable for incoming ref ${opts.incoming}.`,
    })
  }
  if (modules.modular && changedFiles.some((file) => samePath(file, modules.rootPath))) {
    findings.push({
      code: 'COLLAB_ROOT_INTENT_CHANGED',
      severity: 'warn',
      message: 'Root intent changed in a modular project; review includes and shared top-level ownership.',
      file: relProject(projectDir, modules.rootPath),
    })
  }
  for (const file of changedFiles) {
    const entries = ownerByFile.get(normalizeAbs(file)) || []
    if (entries.length > 1) {
      findings.push({
        code: 'COLLAB_SHARED_OWNER_FILE',
        severity: 'warn',
        message: `Changed file owns ${entries.length} semantic objects; review patch ordering carefully.`,
        file: relProject(projectDir, file),
        owners: entries.map((entry) => `${entry.kind}:${entry.id}`),
      })
    }
  }
  for (const file of unknownIntentFiles) {
    findings.push({
      code: 'COLLAB_UNKNOWN_INTENT_FILE',
      severity: 'warn',
      message: 'Changed intent file is not part of the assembled module graph; check includes.',
      file,
    })
  }
  for (const conflict of conflicts) {
    findings.push({
      code: 'COLLAB_OWNER_CONFLICT',
      severity: 'error',
      message: `Local changes and ${opts.incoming} both modify ${conflict.owner}.`,
      owner: conflict.owner,
      local_file: conflict.local_file,
      incoming_file: conflict.incoming_file,
      suggestion: 'Rebase or merge the incoming branch, then resolve by editing the owner module and re-running intentstack check/build.',
    })
  }

  return {
    project: graph.project,
    modules: {
      modular: Boolean(modules.modular),
      root_path: modules.rootPath || null,
      source_files: modules.sourceFiles || [],
    },
    git: {
      available: git.available,
      base: opts.base || 'HEAD',
      root: git.root,
      changed_files: changedFiles.map((file) => relProject(projectDir, file)),
    },
    incoming: incoming ? {
      available: incoming.available,
      ref: opts.incoming,
      changed_files: incomingFiles.map((file) => relProject(projectDir, file)),
      owners_changed: remoteOwners,
    } : null,
    owners_changed: localOwners,
    conflicts,
    findings,
    status: findings.some((item) => item.severity === 'error') ? 'error' : findings.length ? 'warn' : 'ok',
  }
}

export function formatCollabReport(report) {
  const lines = [
    `IntentStack collaboration - ${report.project?.id || 'app'}`,
    `Status: ${report.status}`,
    `Base: ${report.git.base}`,
    `Changed files: ${report.git.changed_files.length}`,
  ]
  if (report.owners_changed.length) {
    lines.push('', 'Changed owners:')
    for (const owner of report.owners_changed) lines.push(`  - ${owner.kind}:${owner.id} (${owner.changed_file})`)
  }
  if (report.incoming) {
    lines.push('', `Incoming ${report.incoming.ref}: ${report.incoming.changed_files.length} changed file(s)`)
    for (const owner of report.incoming.owners_changed || []) lines.push(`  - ${owner.kind}:${owner.id} (${owner.changed_file})`)
  }
  if (report.conflicts?.length) {
    lines.push('', 'Semantic conflicts:')
    for (const conflict of report.conflicts) {
      lines.push(`  - ${conflict.owner}: local ${conflict.local_file}; incoming ${conflict.incoming_file}`)
    }
  }
  if (report.findings.length) {
    lines.push('', 'Findings:')
    for (const finding of report.findings) {
      lines.push(`  [${finding.severity}] ${finding.code}: ${finding.message}${finding.file ? ` (${finding.file})` : ''}`)
    }
  } else {
    lines.push('', 'ok no collaboration findings')
  }
  return lines.join('\n')
}

function ownerEntries(graph) {
  const modules = graph.modules || {}
  const owners = modules.owners || {}
  const out = []
  if (modules.rootPath) out.push({ kind: 'root', id: 'app.intent', file: modules.rootPath })
  for (const key of ['project', 'theme', 'navigation', 'auth']) {
    if (owners[key]) out.push({ kind: key, id: key, file: owners[key] })
  }
  for (const key of ['entities', 'actions', 'pages', 'sections', 'workflows', 'integrations']) {
    for (const [id, owner] of Object.entries(owners[key] || {})) {
      if (owner?.file) out.push({ kind: owner.kind || singular(key), id, file: owner.file })
    }
  }
  return out
}

function gitChanges(projectDir, base) {
  const root = git(['-C', projectDir, 'rev-parse', '--show-toplevel'])
  if (root.status !== 0) return { available: false, root: null, changedFiles: [], error: root.error }
  const repoRoot = root.stdout.trim()
  const projectRel = gitPath(relative(repoRoot, projectDir)) || '.'
  const diff = git(['-C', repoRoot, 'diff', '--name-only', base, '--', projectRel])
  if (diff.status !== 0) return { available: false, root: repoRoot, changedFiles: [], error: diff.error }
  const untracked = git(['-C', repoRoot, 'ls-files', '--others', '--exclude-standard', '--', projectRel])
  const files = [...lines(diff.stdout), ...lines(untracked.stdout)]
  return { available: true, root: repoRoot, changedFiles: [...new Set(files)], error: null }
}

function gitChangesBetween(projectDir, base, incoming) {
  const root = git(['-C', projectDir, 'rev-parse', '--show-toplevel'])
  if (root.status !== 0) return { available: false, root: null, changedFiles: [], error: root.error }
  const repoRoot = root.stdout.trim()
  const projectRel = gitPath(relative(repoRoot, projectDir)) || '.'
  const diff = git(['-C', repoRoot, 'diff', '--name-only', base, incoming, '--', projectRel])
  if (diff.status !== 0) return { available: false, root: repoRoot, changedFiles: [], error: diff.error }
  return { available: true, root: repoRoot, changedFiles: [...new Set(lines(diff.stdout))], error: null }
}

function git(args) {
  const res = spawnSync('git', args, { encoding: 'utf8', stdio: 'pipe' })
  return {
    status: res.status ?? 1,
    stdout: res.stdout || '',
    error: (res.error?.message || res.stderr || '').trim(),
  }
}

function groupOwnersByFile(owners) {
  const map = new Map()
  for (const owner of owners) {
    const key = normalizeAbs(owner.file)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push({ ...owner, file: key })
  }
  return map
}

function dedupeOwners(owners) {
  const seen = new Set()
  const out = []
  for (const owner of owners) {
    const key = `${owner.kind}:${owner.id}:${owner.changed_file}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(owner)
  }
  return out
}

function ownerConflicts(localOwners, incomingOwners) {
  const incomingByOwner = new Map()
  for (const owner of incomingOwners) incomingByOwner.set(ownerKey(owner), owner)
  const conflicts = []
  const seen = new Set()
  for (const local of localOwners) {
    const key = ownerKey(local)
    const incoming = incomingByOwner.get(key)
    if (!incoming || seen.has(key)) continue
    seen.add(key)
    conflicts.push({
      owner: key,
      local_file: local.changed_file,
      incoming_file: incoming.changed_file,
    })
  }
  return conflicts
}

function ownerKey(owner) {
  return `${owner.kind}:${owner.id}`
}

function lines(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function isIntentFile(projectDir, file) {
  const rel = gitPath(relative(projectDir, file))
  return rel === 'intent' || rel.startsWith('intent/')
}

function relProject(projectDir, file) {
  return gitPath(relative(projectDir, file))
}

function gitPath(value) {
  return String(value || '').replace(/\\/g, '/')
}

function normalizeAbs(file) {
  return gitPath(resolve(file)).toLowerCase()
}

function samePath(a, b) {
  return normalizeAbs(a) === normalizeAbs(b)
}

function singular(collection) {
  if (collection === 'entities') return 'entity'
  if (collection === 'actions') return 'action'
  if (collection === 'pages') return 'page'
  if (collection === 'sections') return 'section'
  if (collection === 'workflows') return 'workflow'
  if (collection === 'integrations') return 'integration'
  return collection.replace(/s$/, '')
}
