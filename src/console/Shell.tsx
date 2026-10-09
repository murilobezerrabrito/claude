// Moldura do console: menu lateral azul-escuro (as cores da AWARE), itens conforme o papel, tema e saída.

import { FileText, LayoutList, ListChecks, LogOut, Tags } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { cn } from '../lib/utils.ts'
import { ROLE_LABELS, useSession } from './session.tsx'
import { useTheme, type ThemeChoice } from './theme.ts'
import { Select } from './ui/input.tsx'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  visible: boolean
}

export function Shell({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const session = useSession()
  const [theme, setTheme] = useTheme()
  const items: NavItem[] = [
    { to: '/familias', label: 'Famílias', icon: <LayoutList />, visible: true },
    { to: '/mes', label: 'Mês', icon: <ListChecks />, visible: session.has('gestao', 'comite', 'compliance', 'banker', 'responsavel') },
    { to: '/mapeamento', label: 'Mapeamento de ativos', icon: <Tags />, visible: session.has('gestao', 'comite', 'compliance') },
    { to: '/relatorio-exemplo', label: 'Relatório de exemplo', icon: <FileText />, visible: true },
  ]
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-svh md:w-60">
        <p className="px-5 pt-5 pb-3 font-serif text-xl font-semibold tracking-wide">
          AWARE <span className="font-normal text-sidebar-muted">Objective</span>
        </p>
        <nav aria-label="Seções do console" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {items
            .filter((i) => i.visible)
            .map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap text-sidebar-muted hover:text-sidebar-foreground [&_svg]:size-4',
                    isActive && 'bg-sidebar-active text-sidebar-foreground',
                  )
                }
              >
                {i.icon}
                {i.label}
              </NavLink>
            ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-3 border-t border-white/10 p-4 text-xs text-sidebar-muted md:flex">
          <div>
            <p className="truncate text-sidebar-foreground" title={session.user.email}>
              {session.user.email}
            </p>
            <p>{[...new Set(session.roles.map((r) => ROLE_LABELS[r.role]))].join(', ')}</p>
          </div>
          <label className="flex items-center justify-between gap-2">
            Tema
            <Select
              aria-label="Tema"
              value={theme}
              onChange={(e) => setTheme(e.target.value as ThemeChoice)}
              className="h-8 border-white/20 bg-sidebar-active text-xs text-sidebar-foreground"
            >
              <option value="sistema">Do sistema</option>
              <option value="claro">Claro</option>
              <option value="escuro">Escuro</option>
            </Select>
          </label>
          <button type="button" onClick={onSignOut} className="flex items-center gap-2 text-sidebar-foreground hover:underline [&_svg]:size-4">
            <LogOut /> Sair
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-end gap-3 border-b px-4 py-2 text-xs md:hidden">
          <span className="truncate text-muted-foreground">{session.user.email}</span>
          <button type="button" onClick={onSignOut} className="underline">
            Sair
          </button>
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  )
}

/** Título de página: serifada, com uma linha de contexto. */
export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <h1 className="font-serif text-2xl font-semibold">{title}</h1>
      {children}
    </header>
  )
}
