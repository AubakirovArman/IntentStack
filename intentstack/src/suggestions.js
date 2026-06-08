import YAML from 'js-yaml'
import { ACTION_TYPES, COMPONENT_TYPES, FIELD_TYPES } from './registry.js'
import { patchOps } from './patch.js'

export function intentSuggestions(graph, opts = {}) {
  const suggestions = []
  const pages = graph.pages || []
  const actions = graph.actions || []
  const entities = graph.entities || []
  const hasNavigation = Boolean(graph.navigation)

  if (!hasNavigation && pages.length > 0) {
    suggestions.push(suggestion('add_navigation', 'Add shared navigation', 'Expose top-level pages through one generated navbar.', [{
      op: 'navigation.set',
      navigation: {
        logo: graph.project?.name || graph.project?.id || 'IntentStack',
        items: pages.slice(0, 5).map((page) => ({ label: title(page.id), href: page.path || '/' })),
      },
    }]))
  }

  for (const entity of entities) {
    const hasList = actions.some((action) => action.type === 'list_records' && action.entity === entity.id)
    if (!hasList) {
      suggestions.push(suggestion(`list_${entity.id}`, `Add list action for ${entity.id}`, 'Tables, dashboards and API tests need a list_records action.', [{
        op: 'action.create',
        action: { id: `list_${kebab(entity.id)}s`.replace(/-/g, '_'), type: 'list_records', entity: entity.id },
      }]))
      break
    }
  }

  const dashboard = pages.find((page) => page.layout === 'dashboard') || pages[1] || pages[0]
  for (const entity of entities) {
    const hasList = actions.some((action) => action.type === 'list_records' && action.entity === entity.id)
    const hasTable = pages.some((page) => (page.sections || []).some((section) => section.type === 'table' && section.entity === entity.id))
    if (dashboard && hasList && !hasTable) {
      suggestions.push(suggestion(`table_${entity.id}`, `Add ${entity.id} table`, 'Use section.module.add to keep the page module thin.', [{
        op: 'section.module.add',
        page: dashboard.id,
        section: {
          id: `${kebab(entity.id).replace(/-/g, '_')}_table`,
          type: 'table',
          title: `${title(entity.id)} records`,
          entity: entity.id,
          source: { action: actions.find((action) => action.type === 'list_records' && action.entity === entity.id)?.id },
          columns: (entity.fields || []).slice(0, 4).map((field) => field.id || field),
        },
      }]))
      break
    }
  }

  const footerPage = pages.find((page) => !(page.sections || []).some((section) => section.type === 'footer'))
  if (footerPage) {
    suggestions.push(suggestion('add_footer', `Add footer to ${footerPage.id}`, 'A footer gives generated pages a complete layout endpoint.', [{
      op: 'section.module.add',
      page: footerPage.id,
      section: {
        id: `${footerPage.id}_footer`,
        type: 'footer',
        text: graph.project?.name || graph.project?.id || 'IntentStack',
      },
    }]))
  }

  const docsSection = pages.flatMap((page) => (page.sections || []).map((section) => ({ page, section })))
    .find(({ section }) => section.type === 'content')
  if (docsSection) {
    suggestions.push(suggestion('docs_example', `Add example block to ${docsSection.section.id}`, 'Keep documentation, preview and patch code in one block.', [{
      op: 'content.example.add',
      section: docsSection.section.id,
      id: 'generated_example',
      title: 'Generated example',
      code: 'version: 0.1\npatch: []\n',
    }]))
  }

  return suggestions.slice(0, opts.limit || 6)
}

export function intentCompletions(graph, opts = {}) {
  const prefix = String(opts.prefix || '').toLowerCase()
  const limit = Number(opts.limit || 25) || 25
  const items = []
  for (const key of ['version', 'project', 'theme', 'navigation', 'auth', 'tenancy', 'entities', 'actions', 'pages', 'workflows', 'integrations']) {
    items.push(completion(key, 'root_key', `${key}:`, 'Top-level intent key'))
  }
  for (const type of COMPONENT_TYPES) items.push(completion(type, 'component_type', type, 'Supported page section type'))
  for (const type of ACTION_TYPES) items.push(completion(type, 'action_type', type, 'Supported action type'))
  for (const type of FIELD_TYPES) items.push(completion(type, 'field_type', type, 'Supported entity field type'))
  for (const op of patchOps()) items.push(completion(op, 'patch_op', op, 'Semantic patch operation'))
  for (const entity of graph.entities || []) items.push(completion(entity.id, 'entity', entity.id, `Entity ${entity.table || entity.id.toLowerCase()}`))
  for (const action of graph.actions || []) items.push(completion(action.id, 'action', action.id, `${action.type}${action.entity ? ` for ${action.entity}` : ''}`))
  for (const page of graph.pages || []) {
    items.push(completion(page.id, 'page', page.id, page.path || '/'))
    for (const section of page.sections || []) items.push(completion(section.id, 'section', section.id, `${section.type} on ${page.id}`))
  }
  for (const item of intentSuggestions(graph, { limit: opts.suggestionLimit || 6 })) {
    items.push({ label: item.id, kind: 'patch_suggestion', insert_text: item.yaml, detail: item.title, patch: item.patch })
  }
  return unique(items)
    .filter((item) => !prefix || item.label.toLowerCase().startsWith(prefix) || item.insert_text.toLowerCase().includes(prefix))
    .slice(0, limit)
}

function completion(label, kind, insertText, detail) {
  return { label, kind, insert_text: insertText, detail }
}

function suggestion(id, titleText, reason, patch) {
  return {
    id,
    title: titleText,
    reason,
    patch,
    yaml: YAML.dump({ version: '0.1', patch }, { lineWidth: 100, noRefs: true }),
  }
}

function unique(items) {
  const seen = new Set()
  return items.filter((item) => {
    const key = `${item.kind}:${item.label}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function title(value) {
  return String(value || 'Page')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function kebab(value) {
  return String(value || 'item')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'item'
}
