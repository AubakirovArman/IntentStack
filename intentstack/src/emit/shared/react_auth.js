import { declaredRoles } from './policy.js'

const js = (value) => JSON.stringify(value)

export function reactAuthTs(graph, banner) {
  return banner + `'use client'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export const AUTH_ROLES = ${js(declaredRoles(graph))} as const

type AuthState = {
  loading: boolean
  authenticated: boolean
  role: string
}

function isAllowed(role: string, allowed: readonly string[]) {
  if (allowed.includes('authenticated')) return role.length > 0
  return allowed.includes(role)
}

async function loadAuth(): Promise<AuthState> {
  const res = await fetch('/api/auth/me', { credentials: 'include' }).catch(() => null)
  if (!res?.ok) return { loading: false, authenticated: false, role: '' }
  const json = await res.json().catch(() => ({}))
  return {
    loading: false,
    authenticated: Boolean(json.authenticated),
    role: typeof json.role === 'string' ? json.role : '',
  }
}

export function ProtectedPage({ roles, children }: { roles: readonly string[]; children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ loading: true, authenticated: false, role: '' })
  useEffect(() => {
    let cancelled = false
    loadAuth().then((next) => { if (!cancelled) setAuth(next) })
    return () => { cancelled = true }
  }, [])
  if (auth.loading) {
    return (
      <main className="min-h-screen bg-white p-8 text-slate-950">
        <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Checking access</h1>
          <p className="mt-2 text-slate-600">Verifying your server session.</p>
        </div>
      </main>
    )
  }
  if (roles.length === 0 || isAllowed(auth.role, roles)) return <>{children}</>
  return (
    <main className="min-h-screen bg-white p-8 text-slate-950">
      <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Access required</h1>
        <p className="mt-2 text-slate-600">This page requires one of these roles: {roles.join(', ')}.</p>
      </div>
    </main>
  )
}
`
}
