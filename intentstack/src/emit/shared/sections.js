// Shared section rendering contract for target adapters. Targets still own the
// concrete JSX, but dispatch is uniform and testable instead of hand-rolled
// switch statements in every adapter.

export function createSectionRenderer(handlers, opts = {}) {
  return function renderSection(ctx) {
    const section = ctx.section
    const handler = handlers[section?.type]
    if (!handler) return opts.onMissing ? opts.onMissing(ctx) : null
    const rendered = handler(ctx)
    return opts.telemetry === false ? rendered : withSectionTelemetry(rendered, section)
  }
}

export function sectionRendererContract(handlers) {
  return Object.keys(handlers || {}).sort().map((type) => ({ type, render: typeof handlers[type] === 'function' }))
}

export function withSectionTelemetry(source, section) {
  if (!source || !section?.id || source.includes('data-intent-section-id=')) return source
  const attrs = ` data-intent-section-id="${escapeAttr(section.id)}" data-intent-section-type="${escapeAttr(section.type || 'unknown')}"`
  return String(source).replace(/<(section|header|footer)(\s|>)/, `<$1${attrs}$2`)
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
