import { closest } from '../diagnostics.js'
import { asArray } from './utils.js'
import { policyRoles } from '../emit/shared/modules.js'

export function validateAuth(d, auth) {
  const roles = new Set(['authenticated'])
  if (auth == null || auth === false || auth === 'reserved') return roles
  if (auth === true) return roles
  if (typeof auth !== 'object' || Array.isArray(auth)) {
    d.error('E2400', 'auth must be an object, true, false, or "reserved".', { path: 'auth' })
    return roles
  }
  const roleDefs = asArray(d, auth.roles, 'auth.roles')
  const seen = new Set()
  for (const [i, role] of roleDefs.entries()) {
    const base = `auth.roles[${i}]`
    const id = typeof role === 'string' ? role : role?.id
    if (!id) {
      d.error('E2401', 'auth role id is required.', { path: base })
      continue
    }
    if (seen.has(id)) d.error('E2402', `Duplicate auth role "${id}".`, { path: base })
    seen.add(id)
    roles.add(id)
  }
  const users = asArray(d, auth.users, 'auth.users')
  const userIds = new Set()
  for (const [i, user] of users.entries()) {
    const base = `auth.users[${i}]`
    if (!user?.id) {
      d.error('E2404', 'auth user id is required.', { path: base })
      continue
    }
    if (userIds.has(user.id)) d.error('E2405', `Duplicate auth user "${user.id}".`, { path: `${base}.id` })
    userIds.add(user.id)
    const role = user.role || 'authenticated'
    if (!roles.has(role)) {
      const did = closest(role, [...roles])
      d.error('E3006', `Auth user "${user.id}" references unknown role "${role}".`, {
        path: `${base}.role`,
        suggestion: did ? `Did you mean "${did}"?` : 'Declare it under auth.roles.',
      })
    }
    if (!user.password || typeof user.password !== 'string' || !user.password.startsWith('env:')) {
      d.error('E2406', `Auth user "${user.id}" password must reference an environment variable with env:NAME.`, {
        path: `${base}.password`,
        suggestion: 'Use password: env:ADMIN_PASSWORD',
      })
    }
  }
  return roles
}

export function validateAuthPolicy(d, policy, path, roleIds) {
  if (policy == null || policy === false || policy === 'reserved') return
  const roles = policyRoles(policy)
  if (roles.length === 0) {
    d.error('E2403', 'auth policy must be true, a role string, an array of roles, or { roles }.', { path })
    return
  }
  for (const role of roles) {
    if (!roleIds.has(role)) {
      const did = closest(role, [...roleIds])
      d.error('E3006', `Auth policy references unknown role "${role}".`, {
        path,
        suggestion: did ? `Did you mean "${did}"?` : 'Declare it under auth.roles.',
      })
    }
  }
}

export function validateTenancy(d, tenancy) {
  if (tenancy == null || tenancy === false) return
  if (typeof tenancy !== 'object' || Array.isArray(tenancy)) {
    d.error('E2300', 'tenancy must be an object or false.', { path: 'tenancy' })
    return
  }
  if (tenancy.enabled !== true) {
    d.error('E2301', 'tenancy.enabled must be true when tenancy is configured.', { path: 'tenancy.enabled' })
  }
  if (tenancy.header != null && (typeof tenancy.header !== 'string' || !/^[a-z][a-z0-9-]*$/i.test(tenancy.header))) {
    d.error('E2302', 'tenancy.header must be an HTTP header name.', { path: 'tenancy.header' })
  }
  if (tenancy.storage_key != null && (typeof tenancy.storage_key !== 'string' || tenancy.storage_key.length === 0)) {
    d.error('E2303', 'tenancy.storage_key must be a non-empty string.', { path: 'tenancy.storage_key' })
  }
}
