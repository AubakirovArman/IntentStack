export function graphSummary(graph) {
  return {
    version: graph.version,
    project: graph.project,
    theme: graph.theme,
    auth: graph.auth,
    tenancy: graph.tenancy,
    navigation: graph.navigation,
    entities: graph.entities.map((e) => ({
      id: e.id,
      table: e.table || e.id.toLowerCase(),
      fields: (e.fields || []).map((f) => f.id),
    })),
    actions: graph.actions.map((a) => ({ id: a.id, type: a.type, entity: a.entity })),
    pages: graph.pages.map((p) => ({
      id: p.id,
      path: p.path,
      layout: p.layout,
      sections: (p.sections || []).map((s) => ({ id: s.id, type: s.type, entity: s.entity })),
    })),
    workflows: graph.workflows.map((w) => ({ id: w.id, trigger: w.trigger })),
    integrations: graph.integrations.map((i) => ({ id: i.id, type: i.type })),
    ir: {
      symbol_count: graph.symbolTable.length,
      binding_count: graph.bindings.length,
      symbols: graph.symbolTable,
      bindings: graph.bindings,
      types: graph.types,
      reference_graph: graph.referenceGraph,
    },
    modules: graph.modules?.modular ? {
      modular: true,
      root_path: graph.modules.rootPath,
      includes: graph.modules.includes,
      source_files: graph.modules.sourceFiles,
      owners: graph.modules.owners,
      include_graph: graph.modules.includeGraph,
      include_cycles: graph.modules.includeCycles,
    } : { modular: false, source_files: [] },
  }
}

export function statsSummary(graph, diagnostics, files) {
  const sectionCount = graph.pages.reduce((sum, page) => sum + (page.sections || []).length, 0)
  const fieldCount = graph.entities.reduce((sum, entity) => sum + (entity.fields || []).length, 0)
  const protectedPages = graph.pages.filter((page) => page.auth && page.auth !== 'reserved').length
  const protectedActions = graph.actions.filter((action) => action.auth && action.auth !== 'reserved').length
  return {
    version: graph.version,
    project: graph.project,
    counts: {
      pages: graph.pages.length,
      sections: sectionCount,
      entities: graph.entities.length,
      fields: fieldCount,
      actions: graph.actions.length,
      workflows: graph.workflows.length,
      integrations: graph.integrations.length,
      planned_files: Object.keys(files || {}).length,
    },
    diagnostics: {
      errors: diagnostics.errors.length,
      warnings: diagnostics.warnings.length,
      codes: diagnostics.toJSON().map((item) => item.code),
    },
    quality: {
      protected_pages: protectedPages,
      protected_actions: protectedActions,
      dashboard_pages: graph.pages.filter((page) => page.layout === 'dashboard').length,
      public_dashboard_pages: graph.pages.filter((page) => page.layout === 'dashboard' && !page.auth).length,
      multi_tenant: graph.tenancy?.enabled === true,
    },
  }
}

export function securitySummary(graph, diagnostics) {
  const findings = []
  for (const page of graph.pages) {
    if (page.layout === 'dashboard' && !page.auth) {
      findings.push({ severity: 'warning', code: 'SEC_PUBLIC_DASHBOARD', message: `Dashboard page "${page.id}" is public.` })
    }
  }
  for (const action of graph.actions) {
    if (['create_record', 'update_record', 'delete_record'].includes(action.type) && !action.auth) {
      findings.push({ severity: 'warning', code: 'SEC_PUBLIC_MUTATION', message: `Mutating action "${action.id}" has no auth policy.` })
    }
  }
  const auth = graph.auth
  if (auth && typeof auth === 'object') {
    for (const user of auth.users || []) {
      if (!String(user.password || '').startsWith('env:')) {
        findings.push({ severity: 'error', code: 'SEC_INLINE_PASSWORD', message: `Auth user "${user.id}" password is not env-backed.` })
      }
    }
  }
  for (const diagnostic of diagnostics.toJSON()) {
    if (['E2504', 'E2406'].includes(diagnostic.code)) {
      findings.push({ severity: 'error', code: `SEC_${diagnostic.code}`, message: diagnostic.message })
    }
  }
  return {
    project: graph.project,
    status: findings.some((f) => f.severity === 'error') ? 'fail' : findings.length ? 'warn' : 'pass',
    findings,
  }
}
