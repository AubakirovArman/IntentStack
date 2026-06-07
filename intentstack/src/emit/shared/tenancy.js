export function tenancyConfig(graph) {
  if (graph?.tenancy?.enabled !== true) return null
  return {
    header: graph.tenancy.header || 'X-Tenant-Id',
    storageKey: graph.tenancy.storage_key || 'intentstack.tenant_id',
  }
}
