export function buildReferenceGraph(graph) {
  const nodes = []
  const edges = []
  for (const symbol of Object.values(graph.symbols || {})) {
    nodes.push({ id: symbol.ref, kind: symbol.kind, source: ownerFileFor(graph, symbol.ref) })
  }
  for (const file of graph.modules?.sourceFiles || []) nodes.push({ id: `File.${file}`, kind: 'intent_file', file })
  for (const binding of graph.bindings || []) {
    edges.push({
      kind: binding.kind,
      from: binding.from,
      to: binding.to,
      resolved: Boolean(graph.symbols?.[binding.to]),
    })
  }
  for (const page of graph.pages || []) {
    for (const section of page.sections || []) {
      edges.push({
        kind: 'page.section',
        from: `Page.${page.id}`,
        to: `Page.${page.id}.section.${section.id}`,
        resolved: true,
      })
    }
  }
  for (const edge of entityReferenceEdges(graph)) edges.push(edge)
  for (const edge of graph.modules?.includeGraph?.edges || []) {
    const from = `File.${edge.from}`
    if (edge.to?.length) {
      for (const target of edge.to) edges.push({ kind: 'intent.include', from, to: `File.${target}`, pattern: edge.pattern, resolved: true })
    } else {
      edges.push({ kind: 'intent.include', from, to: null, pattern: edge.pattern, resolved: false })
    }
  }
  return {
    nodes,
    edges,
    unresolved: edges.filter((edge) => edge.resolved === false),
    cycles: [...entityCycles(graph), ...(graph.modules?.includeCycles || []).map((cycle) => ({
      kind: 'intent.include',
      refs: cycle.map((file) => `File.${file}`),
    }))],
  }
}

export function entityReferenceTarget(field) {
  const target = field?.references || field?.ref_entity || field?.entity
  return typeof target === 'string' && target.trim() ? target.trim() : null
}

export function entityCycles(graph) {
  const edges = new Map()
  for (const entity of graph.entities || []) {
    for (const field of entity.fields || []) {
      const target = entityReferenceTarget(field)
      if (!target) continue
      if (!edges.has(entity.id)) edges.set(entity.id, [])
      edges.get(entity.id).push(target)
    }
  }
  return findCycles(edges).map((cycle) => ({
    kind: 'entity.reference',
    refs: cycle.map((id) => `Entity.${id}`),
  }))
}

function entityReferenceEdges(graph) {
  const out = []
  for (const entity of graph.entities || []) {
    for (const field of entity.fields || []) {
      const target = entityReferenceTarget(field)
      if (!target) continue
      out.push({
        kind: 'entity.field_reference',
        from: `Entity.${entity.id}.field.${field.id}`,
        to: `Entity.${target}`,
        resolved: Boolean(graph.entityById?.[target]),
      })
    }
  }
  return out
}

function findCycles(edges) {
  const cycles = []
  const visiting = []
  const visited = new Set()
  function visit(node) {
    const idx = visiting.indexOf(node)
    if (idx >= 0) {
      cycles.push([...visiting.slice(idx), node])
      return
    }
    if (visited.has(node)) return
    visiting.push(node)
    for (const next of edges.get(node) || []) visit(next)
    visiting.pop()
    visited.add(node)
  }
  for (const node of edges.keys()) visit(node)
  return dedupeCycles(cycles)
}

function dedupeCycles(cycles) {
  const seen = new Set()
  return cycles.filter((cycle) => {
    const key = [...new Set(cycle)].sort().join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function ownerFileFor(graph, ref) {
  const owners = graph.modules?.owners || {}
  const section = ref.match(/^Page\.([^.]+)\.section\.([^.]+)/)
  if (section) return owners.sections?.[section[2]]?.file || owners.pages?.[section[1]]?.file || null
  const [, kind, id] = ref.match(/^(Entity|Action|Workflow|Integration|Page)\.([^.]+)/) || []
  if (kind === 'Entity') return owners.entities?.[id]?.file || null
  if (kind === 'Action') return owners.actions?.[id]?.file || null
  if (kind === 'Workflow') return owners.workflows?.[id]?.file || null
  if (kind === 'Integration') return owners.integrations?.[id]?.file || null
  if (kind === 'Page') return owners.pages?.[id]?.file || null
  return null
}
