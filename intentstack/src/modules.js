export const DOMAIN_MODULES = {
  web_crud: {
    version: '0.1',
    status: 'active',
    capabilities: ['pages', 'sections', 'components', 'forms', 'entities', 'actions', 'basic_api', 'basic_db'],
  },
  auth_permissions: {
    version: '0.2',
    status: 'partial',
    capabilities: ['users', 'roles', 'sessions', 'auth_policies', 'protected_pages', 'protected_api', 'rbac_guards'],
  },
  workflows: {
    version: '0.3',
    status: 'partial',
    capabilities: ['action_triggers', 'workflow_steps', 'dispatch_stubs', 'webhook_step_metadata'],
  },
  integrations: {
    version: '0.4',
    status: 'partial',
    capabilities: ['webhook', 'email', 'crm', 'telegram_bot', 'whatsapp_provider', 'external_api', 'secret_env_refs'],
  },
  multi_target: {
    version: '0.5',
    status: 'active',
    capabilities: ['web_ts_minimal', 'next_shadcn'],
  },
  visual_graph: {
    version: '0.6',
    status: 'partial',
    capabilities: ['graph_export', 'html_viewer', 'patch_history', 'component_tree'],
  },
}
