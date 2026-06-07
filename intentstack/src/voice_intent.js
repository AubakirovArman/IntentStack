import YAML from 'js-yaml'

export function voiceToPatch(graph, utterance) {
  const text = String(utterance || '').trim()
  const lower = text.toLowerCase()
  const page = defaultPage(graph)
  const entity = firstEntity(graph)

  if (!text) return result('empty', 'Provide a voice/text command.', [])

  const rename = /\brename\s+(?:project|app|site)\s+to\s+(.+)$/i.exec(text)
  if (rename) {
    return result('project.set_name', 'Rename project', [{ op: 'project.set_name', name: cleanup(rename[1]) }])
  }

  const field = /\badd\s+(?:field\s+)?([a-z][a-z0-9_]*)\s+to\s+([a-z][a-z0-9_]*)/i.exec(text)
  if (field) {
    return result('entity.field.add', `Add ${field[1]} field`, [{
      op: 'entity.field.add',
      entity: pascal(field[2]),
      field: { id: camel(field[1]), type: inferFieldType(field[1]) },
    }])
  }

  if (/\b(add|create)\b/.test(lower) && /\bpricing\b/.test(lower)) {
    return result('section.add', 'Add pricing cards section', [
      sectionOp(graph, page.id, {
        id: 'pricing',
        type: 'pricing_cards',
        title: 'Pricing',
        items: [
          { title: 'Starter', price: '$19', features: ['Core workflow', 'Email support'] },
          { title: 'Pro', price: '$49', features: ['Automation', 'Priority support'] },
        ],
      }),
    ])
  }

  if (/\b(add|create)\b/.test(lower) && /\bstats?\b/.test(lower)) {
    return result('section.add', 'Add stats section', [
      sectionOp(graph, page.id, {
        id: 'stats',
        type: 'stats',
        title: 'Metrics',
        items: [
          { label: 'Users', value: '1k+' },
          { label: 'Requests', value: '10k+' },
          { label: 'Uptime', value: '99.9%' },
        ],
      }),
    ])
  }

  if (/\b(add|create)\b/.test(lower) && /\bdocs|documentation\b/.test(lower)) {
    return result('page.create', 'Create docs page', [
      { op: 'page.create', page: { id: 'docs', path: '/docs', layout: 'docs', sections: [] } },
      sectionOp(graph, 'docs', {
        id: 'docs_content',
        type: 'content',
        title: 'Documentation',
        blocks: [{ id: 'overview', type: 'paragraph', text: 'Generated documentation page.' }],
      }),
      { op: 'navigation.item.add', item: { label: 'Docs', href: '/docs' } },
    ])
  }

  if (/\b(add|create)\b/.test(lower) && /\btable\b/.test(lower) && entity) {
    const listAction = (graph.actions || []).find((action) => action.type === 'list_records' && action.entity === entity.id)
    return result('section.add', `Add ${entity.id} table`, [
      sectionOp(graph, page.id, {
        id: `${camel(entity.id)}_table`,
        type: 'table',
        title: `${entity.id} records`,
        entity: entity.id,
        source: listAction ? { action: listAction.id } : undefined,
        columns: (entity.fields || []).slice(0, 4).map((item) => item.id || item),
      }),
    ])
  }

  return result('unrecognized', 'No supported voice intent matched.', [])
}

function result(intent, summary, patch) {
  return {
    intent,
    summary,
    patch,
    yaml: YAML.dump({ version: '0.1', patch }, { lineWidth: 100, noRefs: true }),
  }
}

function sectionOp(graph, page, section) {
  return {
    op: graph.modules?.modular ? 'section.module.add' : 'section.add',
    page,
    section,
  }
}

function defaultPage(graph) {
  return (graph.pages || []).find((page) => page.id === 'home') || (graph.pages || [])[0] || { id: 'home' }
}

function firstEntity(graph) {
  return (graph.entities || [])[0] || null
}

function inferFieldType(name) {
  const value = String(name).toLowerCase()
  if (value.includes('email') || value.includes('phone') || value.includes('name')) return 'string'
  if (value.includes('notes') || value.includes('description')) return 'text'
  if (value.includes('count') || value.includes('price') || value.includes('amount')) return 'number'
  if (value.startsWith('is_') || value.startsWith('has_')) return 'boolean'
  return 'string'
}

function cleanup(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '')
}

function camel(value) {
  return String(value || 'field')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+([a-z0-9])/gi, (_, char) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase()) || 'field'
}

function pascal(value) {
  const text = camel(value)
  return text.charAt(0).toUpperCase() + text.slice(1)
}
