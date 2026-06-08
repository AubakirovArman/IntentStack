const js = (value) => JSON.stringify(value)

export function workflowsTs(graph, banner) {
  return banner + `import { appendFile, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

export const WORKFLOWS = ${js(graph.workflows || [])} as const
export const WORKFLOW_INTEGRATIONS = ${js(graph.integrations || [])} as const

export type WorkflowDispatch = {
  action: string
  payload: unknown
}

const RUN_LOG = join(process.cwd(), '.intentstack-workflows.ndjson')

function envRef(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('env:')) return null
  return process.env[value.slice(4)] ?? null
}

async function runStep(workflow: { id: string }, step: { type: string; integration?: string }, payload: unknown) {
  if (step.type === 'webhook' && step.integration) {
    const integrations = WORKFLOW_INTEGRATIONS as readonly { id: string; config?: Record<string, unknown> }[]
    const integration = integrations.find((item) => item.id === step.integration)
    const url = envRef(integration?.config?.url)
    if (!url) return { type: step.type, integration: step.integration, status: 'skipped_missing_url' }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow: workflow.id, payload }),
    })
    return { type: step.type, integration: step.integration, status: res.ok ? 'sent' : 'failed', status_code: res.status }
  }
  if (step.type === 'email') return { type: step.type, integration: step.integration, status: 'queued_notification' }
  if (step.type === 'background_job') return { type: step.type, integration: step.integration, status: 'queued_job' }
  if (step.type === 'state_transition') return { type: step.type, integration: step.integration, status: 'transitioned', to: (step as { to?: string }).to ?? (step as { state?: string }).state ?? 'next' }
  if (step.type === 'approval') return { type: step.type, integration: step.integration, status: 'pending_approval' }
  return { type: step.type, integration: step.integration, status: 'queued' }
}

function maxAttempts(workflow: { retry?: { max_attempts?: number; attempts?: number } }) {
  const configured = workflow.retry?.max_attempts ?? workflow.retry?.attempts ?? process.env.INTENTSTACK_WORKFLOW_MAX_ATTEMPTS ?? 1
  const n = Number(configured)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
}

function finalStatus(steps: Array<{ status: string }>) {
  if (steps.some((step) => step.status === 'failed')) return 'failed'
  if (steps.some((step) => step.status === 'pending_approval')) return 'pending'
  return 'succeeded'
}

async function recordWorkflowEvent(event: Record<string, unknown>) {
  await appendFile(RUN_LOG, JSON.stringify({ ...event, recordedAt: new Date().toISOString() }) + '\\n')
}

async function runWorkflow(workflow: { id: string; trigger?: { action?: string }; steps?: readonly { type: string; integration?: string }[]; retry?: { max_attempts?: number; attempts?: number } }, action: string, payload: unknown) {
  const runId = randomUUID()
  await recordWorkflowEvent({ run_id: runId, id: workflow.id, action, status: 'queued', attempts: 0 })
  let attempts = 0
  let steps: Array<Record<string, unknown> & { status: string }> = []
  let status = 'failed'
  while (attempts < maxAttempts(workflow)) {
    attempts += 1
    await recordWorkflowEvent({ run_id: runId, id: workflow.id, action, status: 'running', attempt: attempts })
    steps = []
    for (const step of workflow.steps ?? []) steps.push(await runStep(workflow, step, payload))
    status = finalStatus(steps)
    if (status !== 'failed') break
  }
  const result = { run_id: runId, id: workflow.id, action, status, attempts, steps, createdAt: new Date().toISOString() }
  await recordWorkflowEvent(result)
  return result
}

export async function runWorkflows(action: string, payload: unknown) {
  const matched = WORKFLOWS.filter((workflow) => workflow.trigger?.action === action)
  const results = []
  for (const workflow of matched) results.push(await runWorkflow(workflow, action, payload))
  return results
}

export async function readWorkflowEvents() {
  const text = await readFile(RUN_LOG, 'utf8').catch(() => '')
  return text.split(/\\r?\\n/).filter(Boolean).map((line) => JSON.parse(line))
}

export async function readWorkflowRuns() {
  const events = await readWorkflowEvents()
  const runs = new Map<string, Record<string, unknown>>()
  for (const event of events) {
    const id = event.run_id || event.id || String(runs.size)
    runs.set(String(id), { ...(runs.get(String(id)) || {}), ...event })
  }
  return [...runs.values()]
}
`
}
