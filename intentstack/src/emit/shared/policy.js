// Security + auth policy helpers shared across codegen targets.

export function policyRoles(policy) {
  if (!policy || policy === 'reserved') return []
  if (policy === true) return ['authenticated']
  if (typeof policy === 'string') return [policy]
  if (Array.isArray(policy)) return policy.filter((r) => typeof r === 'string')
  if (Array.isArray(policy.roles)) return policy.roles.filter((r) => typeof r === 'string')
  if (typeof policy.role === 'string') return [policy.role]
  return []
}

export function isActivePolicy(policy) {
  return policyRoles(policy).length > 0
}

export function roleLiteral(policy) {
  return JSON.stringify(policyRoles(policy))
}

export function hasPageAuth(graph) {
  return (graph.pages || []).some((p) => isActivePolicy(p.auth))
}

export function hasActionAuth(actions) {
  return (actions || []).some((a) => isActivePolicy(a.auth))
}

export function declaredRoles(graph) {
  const roles = new Set(['authenticated'])
  const auth = graph.auth
  if (auth && typeof auth === 'object') {
    for (const role of auth.roles || []) {
      if (typeof role === 'string') roles.add(role)
      else if (role?.id) roles.add(role.id)
      else if (role?.name) roles.add(role.name)
    }
  }
  return [...roles]
}

export function declaredUsers(graph) {
  const auth = graph.auth
  if (!auth || typeof auth !== 'object') return []
  return (auth.users || []).map((user) => ({
    id: user.id,
    role: user.role || 'authenticated',
    password: user.password,
  }))
}
