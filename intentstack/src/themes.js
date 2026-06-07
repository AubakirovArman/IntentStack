export const THEME_PACKS = {
  minimal: {
    id: 'minimal',
    label: 'Minimal',
    description: 'Neutral baseline with comfortable spacing.',
    theme: { preset: 'minimal', radius: 'md', density: 'comfortable', color: 'neutral' },
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    description: 'Compact, work-focused UI for internal tools and dashboards.',
    theme: { preset: 'enterprise', radius: 'sm', density: 'compact', color: 'slate' },
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    description: 'Roomier presentation pages with stronger visual rhythm.',
    theme: { preset: 'studio', radius: 'lg', density: 'spacious', color: 'indigo' },
  },
  field_ops: {
    id: 'field_ops',
    label: 'Field Ops',
    description: 'High-density operational layout for scanning records quickly.',
    theme: { preset: 'field_ops', radius: 'md', density: 'compact', color: 'green' },
  },
}

export function listThemePacks() {
  return Object.values(THEME_PACKS)
}

export function getThemePack(id) {
  return THEME_PACKS[id] || null
}
