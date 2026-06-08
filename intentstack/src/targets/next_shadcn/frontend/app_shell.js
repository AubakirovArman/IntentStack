import { BANNER } from '../constants.js'

export function toastHostTsx() {
  return BANNER + `'use client'
import { useEffect, useState } from 'react'

type Toast = { id: number; message: string; type?: 'success' | 'error' | 'info' }

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    function onToast(event: Event) {
      const detail = (event as CustomEvent<Partial<Toast>>).detail || {}
      const toast = { id: Date.now(), message: detail.message || 'Saved', type: detail.type || 'info' }
      setItems((current) => [...current.slice(-2), toast])
      window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== toast.id)), 3200)
    }
    window.addEventListener('intentstack:toast', onToast)
    return () => window.removeEventListener('intentstack:toast', onToast)
  }, [])
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((item) => (
        <div key={item.id} className={'rounded-md border bg-card px-4 py-3 text-sm shadow-lg transition ' + (item.type === 'error' ? 'border-destructive text-destructive' : item.type === 'success' ? 'border-green-600 text-green-700' : '')}>{item.message}</div>
      ))}
    </div>
  )
}
`
}

export function themeSwitcherTsx() {
  return BANNER + `'use client'
import { useEffect, useState } from 'react'

export function ThemeSwitcher() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const stored = window.localStorage.getItem('intentstack.theme')
    const next = stored === 'dark'
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }, [])
  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    window.localStorage.setItem('intentstack.theme', next ? 'dark' : 'light')
  }
  return <button type="button" aria-label="Toggle theme" className="fixed right-4 top-4 z-40 rounded-full border bg-background px-3 py-2 text-sm shadow transition hover:scale-105" onClick={toggle}>{dark ? 'L' : 'D'}</button>
}
`
}
