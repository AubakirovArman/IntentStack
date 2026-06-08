import { BANNER } from './constants.js'
import { jsStr } from '../../../emit/util.js'

export function layoutTsx(name) {
  return `${BANNER}import type { ReactNode } from 'react'
import { ThemeSwitcher } from '@/components/generated/ThemeSwitcher'
import { ToastHost } from '@/components/generated/ToastHost'
import './globals.css'

export const metadata = { title: ${jsStr(name)} }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><ThemeSwitcher />{children}<ToastHost /></body>
    </html>
  )
}
`
}
