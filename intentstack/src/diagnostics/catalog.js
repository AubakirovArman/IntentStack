export const WARNING_CATALOG = {
  W1001: {
    rule_id: 'intent.version.missing',
    category: 'language',
    title: 'Missing DSL version',
  },
  W1100: {
    rule_id: 'intent.include.empty_glob',
    category: 'loader',
    title: 'Include glob matched no files',
  },
  W2001: {
    rule_id: 'page.dashboard.public',
    category: 'security',
    title: 'Dashboard page is public',
  },
  W2010: {
    rule_id: 'page.navigation.duplicate_local_navbar',
    category: 'frontend',
    title: 'Local navbar duplicates shared navigation',
  },
  W2101: {
    rule_id: 'navigation.item.duplicate',
    category: 'frontend',
    title: 'Duplicate navigation item',
  },
  W3001: {
    rule_id: 'form.success_message.missing',
    category: 'frontend',
    title: 'Form action has no success message',
  },
  W3002: {
    rule_id: 'hero.title.missing',
    category: 'frontend',
    title: 'Hero has no title',
  },
  W3100: {
    rule_id: 'content.blocks.empty',
    category: 'content',
    title: 'Content section has no blocks',
  },
  W3101: {
    rule_id: 'content.example.section_not_embed_only',
    category: 'content',
    title: 'Example embeds a standalone section',
  },
}

export function warningCatalog() {
  return Object.fromEntries(Object.entries(WARNING_CATALOG).map(([code, entry]) => [code, { ...entry }]))
}

export function warningCatalogEntry(code) {
  return WARNING_CATALOG[code] || null
}
