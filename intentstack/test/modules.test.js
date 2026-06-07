import test from 'node:test'
import assert from 'node:assert/strict'
import { validate } from '../src/validate.js'
import { buildGraph } from '../src/graph.js'
import { planFiles } from '../src/emit/index.js'

function moduleIntent(target = 'web_ts_minimal') {
  return {
    version: '0.1',
    project: { id: 'modules_app', name: 'Modules App', target },
    auth: { roles: ['admin'], users: [{ id: 'admin', role: 'admin', password: 'env:ADMIN_PASSWORD' }] },
    entities: [
      {
        id: 'Lead',
        table: 'leads',
        fields: [
          { id: 'name', type: 'string', required: true },
          { id: 'email', type: 'string', required: true },
        ],
      },
    ],
    actions: [
      { id: 'create_lead', type: 'create_record', entity: 'Lead' },
      { id: 'list_leads', type: 'list_records', entity: 'Lead', auth: ['admin'] },
    ],
    integrations: [
      { id: 'ops_webhook', type: 'webhook', config: { url: 'env:OPS_WEBHOOK_URL' } },
    ],
    workflows: [
      {
        id: 'notify_ops',
        trigger: { action: 'create_lead' },
        steps: [
          { type: 'webhook', integration: 'ops_webhook' },
          { type: 'state_transition', to: 'notified' },
          { type: 'approval' },
        ],
      },
    ],
    pages: [
      {
        id: 'home',
        path: '/',
        layout: 'landing',
        sections: [
          {
            id: 'lead_form',
            type: 'form',
            entity: 'Lead',
            fields: ['name', 'email'],
            submit: { action: 'create_lead', success_message: 'Thanks.' },
          },
        ],
      },
      {
        id: 'dashboard',
        path: '/dashboard',
        layout: 'dashboard',
        auth: ['admin'],
        sections: [
          { id: 'leads', type: 'table', entity: 'Lead', source: { action: 'list_leads' }, columns: ['name', 'email'] },
        ],
      },
    ],
  }
}

test('auth, workflows and integrations validate and emit for web_ts_minimal', () => {
  const ast = moduleIntent()
  const d = validate(ast)
  assert.equal(d.hasErrors(), false, d.format())

  const files = planFiles(buildGraph(ast))
  assert.match(files['server/generated/auth.ts'], /assertRole/)
  assert.match(files['server/generated/auth.ts'], /authRoutes\.post\('\/auth\/login'/)
  assert.match(files['server/generated/auth.ts'], /AUTH_USERS/)
  assert.match(files['server/generated/auth.ts'], /invalid_credentials/)
  assert.match(files['server/generated/auth.ts'], /bcrypt\.compare/)
  assert.match(files['server/generated/auth.ts'], /INTENTSTACK_SESSION_SECRET/)
  assert.match(files['server/generated/auth.ts'], /intentstack_session/)
  assert.match(files['server/generated/auth.ts'], /csrf_token_invalid/)
  assert.doesNotMatch(files['server/generated/auth.ts'], /new Map/)
  assert.doesNotMatch(files['server/generated/auth.ts'], /x-intentstack-role/)
  assert.doesNotMatch(files['src/generated/auth.tsx'], /localStorage/)
  assert.match(files['package.json'], /"bcryptjs"/)
  assert.match(files['.env.example'], /INTENTSTACK_SESSION_SECRET/)
  assert.match(files['server/index.ts'], /authRoutes/)
  assert.match(files['server/index.ts'], /request_id/)
  assert.match(files['server/index.ts'], /SIGTERM/)
  assert.match(files['server/index.ts'], /app\.onError/)
  assert.match(files['src/generated/ErrorBoundary.tsx'], /react_error_boundary/)
  assert.match(files['server/generated/routes/lead.ts'], /assertRole\(c, \["admin"\]\)/)
  assert.match(files['server/generated/workflows.ts'], /notify_ops/)
  assert.match(files['server/generated/workflows.ts'], /fetch\(url/)
  assert.match(files['server/generated/workflows.ts'], /skipped_missing_url/)
  assert.match(files['server/generated/workflows.ts'], /readWorkflowRuns/)
  assert.match(files['server/generated/workflows.ts'], /pending_approval/)
  assert.match(files['server/generated/integrations.ts'], /ops_webhook/)
  assert.match(files['server/generated/integrations.ts'], /callIntegration/)
  assert.match(files['server/generated/integrations.ts'], /sendTelegram/)
  assert.match(files['src/generated/auth.tsx'], /ProtectedPage/)
  assert.match(files['src/generated/pages/DashboardPage.tsx'], /roles={\["admin"\]}/)
})

test('auth, workflows and integrations validate and emit for next_shadcn', () => {
  const ast = moduleIntent('next_shadcn')
  const d = validate(ast)
  assert.equal(d.hasErrors(), false, d.format())

  const files = planFiles(buildGraph(ast))
  assert.match(files['lib/auth.ts'], /assertRequestRole/)
  assert.match(files['lib/auth.ts'], /loginRequest/)
  assert.match(files['lib/auth.ts'], /AUTH_USERS/)
  assert.match(files['lib/auth.ts'], /invalid_credentials/)
  assert.match(files['lib/auth.ts'], /bcrypt\.compare/)
  assert.match(files['lib/auth.ts'], /INTENTSTACK_SESSION_SECRET/)
  assert.match(files['lib/auth.ts'], /intentstack_session/)
  assert.match(files['lib/auth.ts'], /csrf_token_invalid/)
  assert.doesNotMatch(files['lib/auth.ts'], /new Map/)
  assert.doesNotMatch(files['lib/auth.ts'], /x-intentstack-role/)
  assert.match(files['app/api/auth/login/route.ts'], /loginRequest/)
  assert.match(files['app/api/auth/me/route.ts'], /meRequest/)
  assert.match(files['middleware.ts'], /request_id/)
  assert.match(files['middleware.ts'], /X-Correlation-Id/)
  assert.match(files['app/error.tsx'], /react_error_boundary/)
  assert.match(files['app/api/leads/route.ts'], /assertRequestRole\(req, \["admin"\]\)/)
  assert.match(files['lib/workflows.ts'], /notify_ops/)
  assert.match(files['lib/workflows.ts'], /fetch\(url/)
  assert.match(files['lib/workflows.ts'], /skipped_missing_url/)
  assert.match(files['lib/workflows.ts'], /readWorkflowRuns/)
  assert.match(files['lib/workflows.ts'], /pending_approval/)
  assert.match(files['lib/integrations.ts'], /ops_webhook/)
  assert.match(files['lib/integrations.ts'], /callIntegration/)
  assert.match(files['lib/integrations.ts'], /sendTelegram/)
  assert.match(files['components/generated/ProtectedPage.tsx'], /ProtectedPage/)
  assert.doesNotMatch(files['components/generated/ProtectedPage.tsx'], /localStorage/)
  assert.match(files['package.json'], /"bcryptjs"/)
  assert.match(files['.env.example'], /INTENTSTACK_SESSION_SECRET/)
  assert.match(files['app/dashboard/page.tsx'], /roles={\["admin"\]}/)
})

test('roadmap module validation rejects broken semantic references and inline secrets', () => {
  const ast = moduleIntent()
  ast.actions[1].auth = ['owner']
  ast.auth.users[0].password = 'plain-secret'
  ast.integrations[0].config = { token: 'plain-secret' }
  ast.workflows[0].trigger.action = 'missing_action'
  ast.workflows[0].steps[0].integration = 'missing_integration'

  const d = validate(ast)
  assert.equal(d.hasErrors(), true)
  assert.ok(d.errors.some((e) => e.code === 'E3006'))
  assert.ok(d.errors.some((e) => e.code === 'E2406'))
  assert.ok(d.errors.some((e) => e.code === 'E2504'))
  assert.ok(d.errors.some((e) => e.code === 'E3007'))
  assert.ok(d.errors.some((e) => e.code === 'E3008'))
})
