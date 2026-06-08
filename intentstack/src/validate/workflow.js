import { closest } from '../diagnostics.js'
import { asArray, WORKFLOW_STEP_TYPES } from './utils.js'

export function validateWorkflows(d, workflows, actionIds, integrationIds) {
  const ids = new Set()
  for (const [i, workflow] of asArray(d, workflows, 'workflows').entries()) {
    const base = `workflows[${i}]`
    if (!workflow.id) {
      d.error('E2600', 'workflow.id is required.', { path: base })
      continue
    }
    if (ids.has(workflow.id)) d.error('E2601', `Duplicate workflow id "${workflow.id}".`, { path: `${base}.id` })
    ids.add(workflow.id)
    const action = workflow.trigger?.action
    if (!action) {
      d.error('E2602', `Workflow "${workflow.id}" must declare trigger.action.`, { path: `${base}.trigger.action` })
    } else if (!actionIds.has(action)) {
      const did = closest(action, [...actionIds])
      d.error('E3007', `Workflow "${workflow.id}" references unknown action "${action}".`, {
        path: `${base}.trigger.action`,
        suggestion: did ? `Did you mean "${did}"?` : undefined,
      })
    }
    const steps = asArray(d, workflow.steps, `${base}.steps`)
    for (const [j, step] of steps.entries()) {
      const sp = `${base}.steps[${j}]`
      if (!step.type) d.error('E2603', 'workflow step.type is required.', { path: `${sp}.type` })
      else if (!WORKFLOW_STEP_TYPES.includes(step.type)) {
        d.error('E2604', `Unsupported workflow step type "${step.type}".`, {
          path: `${sp}.type`,
          suggestion: `Supported: ${WORKFLOW_STEP_TYPES.join(', ')}`,
        })
      }
      if (step.integration && !integrationIds.has(step.integration)) {
        const did = closest(step.integration, [...integrationIds])
        d.error('E3008', `Workflow step references unknown integration "${step.integration}".`, {
          path: `${sp}.integration`,
          suggestion: did ? `Did you mean "${did}"?` : undefined,
        })
      }
    }
  }
}
