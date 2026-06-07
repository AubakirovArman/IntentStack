// Component catalog, target capabilities (PRD 14, 16, 26) and design tokens (15).
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
