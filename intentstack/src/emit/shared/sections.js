// Shared section rendering contract for target adapters. Targets still own the
// concrete JSX, but dispatch is uniform and testable instead of hand-rolled
// switch statements in every adapter.

export function createSectionRenderer(handlers, opts = {}) {
  return function renderSection(ctx) {
    const section = ctx.section
    const handler = handlers[section?.type]
    if (!handler) return opts.onMissing ? opts.onMissing(ctx) : null
    return handler(ctx)
  }
}
