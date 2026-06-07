// Component catalog, target capabilities (PRD 14, 16, 26) and design tokens (15).
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'js-yaml'

export const FIELD_TYPES = ['string', 'text', 'number', 'boolean', 'enum', 'datetime']

export const ACTION_TYPES = [
  'create_record', 'list_records', 'get_record', 'update_record', 'delete_record',
  'navigate', 'open_modal', 'close_modal', 'show_toast',
]

export const RECORD_ACTIONS = ['create_record', 'list_records', 'get_record', 'update_record', 'delete_record']

export const COMPONENT_TYPES = [
  'navbar',
  'hero',
  'card_grid',
  'form',
  'table',
  'record_detail',
  'footer',
  'stats',
  'pricing_cards',
  'content',
  'custom_component',
]

export const TARGETS = {
  web_ts_minimal: {
    id: 'web_ts_minimal',
    frontend: true, backend: true, database: true,
    framework: 'react', ui: 'daisyui',
    supported_components: COMPONENT_TYPES,
    supported_actions: ['create_record', 'list_records', 'get_record', 'update_record', 'delete_record', 'navigate', 'show_toast'],
    supported_field_types: FIELD_TYPES,
  },
  next_shadcn: {
    id: 'next_shadcn',
    frontend: true, backend: true, database: true,
    framework: 'next', ui: 'shadcn',
    supported_components: COMPONENT_TYPES,
    supported_actions: ['create_record', 'list_records', 'get_record', 'update_record', 'delete_record', 'navigate', 'show_toast'],
    supported_field_types: FIELD_TYPES,
  },
}

const RADIUS = { none: 'rounded-none', sm: 'rounded-sm', md: 'rounded-lg', lg: 'rounded-xl', xl: 'rounded-2xl', full: 'rounded-full' }
const DENSITY = {
  compact: { section: 'py-10', gap: 'gap-3' },
  comfortable: { section: 'py-16', gap: 'gap-6' },
  spacious: { section: 'py-24', gap: 'gap-10' },
}

export function radiusClass(theme) { return RADIUS[theme?.radius] || RADIUS.md }
export function density(theme) { return DENSITY[theme?.density] || DENSITY.comfortable }

export const COMPONENT_REGISTRY = loadComponentRegistry()

export function componentClasses(component, target) {
  return COMPONENT_REGISTRY[component]?.class_map?.[target] || {}
}

function loadComponentRegistry() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const dir = join(root, 'registry', 'components')
  const out = {}
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue
    const doc = YAML.load(readFileSync(join(dir, file), 'utf8')) || {}
    if (doc.id) out[doc.id] = doc
  }
  return out
}
