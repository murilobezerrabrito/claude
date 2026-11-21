// Moldura do app dos clientes AI (SPEC, "Canal 2"): celular primeiro (375 px), temas claro e escuro, marca da Aware e o
// intermediário do cadastro (o app é material do assessor, D-071), navegação embaixo e as sete telas. Em /app, a entrada
// do cliente (convite, senha e autenticador) e o mês fechado da própria família, do banco; em /app/exemplo, os números
// fictícios da Família Andrade, sem login.

import { CalendarRange, History, Home, Info, LogOut, Moon, SlidersHorizontal, Sun, SunMoon, Wallet } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes } from 'react-router'
import { cn } from '../lib/utils.ts'
import { useTheme, type ThemeChoice } from '../lib/theme.ts'
import { Alert } from '../ui/alert.tsx'
import { Button } from '../ui/button.tsx'
import { useClientAuth } from './auth/useClientAuth.ts'
import { ClientViewContext, loadClientView, loadExampleView } from './data.ts'
import { ComoCalculamos } from './screens/ComoCalculamos.tsx'
import { Entrar } from './screens/Entrar.tsx'
import { ESe } from './screens/ESe.tsx'
import { Historico } from './screens/Historico.tsx'
import { Patrimonio } from './screens/Patrimonio.tsx'
import { Plano } from './screens/Plano.tsx'
import { VisaoGeral } from './screens/VisaoGeral.tsx'
import type { ClientMonthView } from './types.ts'
import { useWhatIf, WhatIfContext } from './useWhatIf.ts'

const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = {
  sistema: 'claro',
  claro: 'escuro',
  escuro: 'sistema',
}
const THEME_LABEL: Record<ThemeChoice, string> = {
  sistema: 'Tema do sistema',
  claro: 'Tema claro',
  escuro: 'Tema escuro',
}
const EXAMPLE_BASE = '/app/exemplo'

type Theme = ReturnType<typeof useTheme>
/** O que a moldura mostra: carregando, o mês, a família ainda sem mês fechado ou o erro. */
type ViewState = { kind: 'carregando' } | { kind: 'pronto'; view: ClientMonthView } | { kind: 'sem_mes'; intermediary: string | null } | { kind: 'erro'; message: string }

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function AppRoot() {
  // O tema vale em todas as telas, inclusive na de entrada (fora da moldura).
  const theme = useTheme()
  const path = window.location.pathname
  const example = path === EXAMPLE_BASE || path.startsWith(`${EXAMPLE_BASE}/`)
  return example ? <ExampleApp theme={theme} /> : <ClientApp theme={theme} />
}

/** Os números fictícios da Andrade, sem login (demonstração do assessor). */
function ExampleApp({ theme }: { theme: Theme }) {
  const [state, setState] = useState<ViewState>({ kind: 'carregando' })
  useEffect(() => {
    loadExampleView()
      .then((view) => setState({ kind: 'pronto', view }))
      .catch((e: unknown) => setState({ kind: 'erro', message: errorMessage(e) }))
  }, [])
  return <Screens basename={EXAMPLE_BASE} state={state} theme={theme} onSignOut={() => window.location.assign('/app')} />
}

/** O cliente: entra (convite, senha e autenticador) e vê o mês fechado da própria família. */
function ClientApp({ theme }: { theme: Theme }) {
  const auth = useClientAuth()
  if (auth.stage.kind !== 'pronto') return <Entrar auth={auth} />
  return <SignedIn key={auth.stage.user.id} theme={theme} onSignOut={() => void auth.signOut()} />
}

function SignedIn({ theme, onSignOut }: { theme: Theme; onSignOut: () => void }) {
  const [state, setState] = useState<ViewState>({ kind: 'carregando' })
  useEffect(() => {
    let cancelled = false
    loadClientView()
      .then(({ view, intermediary }) => !cancelled && setState(view ? { kind: 'pronto', view } : { kind: 'sem_mes', intermediary }))
      .catch((e: unknown) => !cancelled && setState({ kind: 'erro', message: errorMessage(e) }))
    return () => {
      cancelled = true
    }
  }, [])
  return <Screens basename="/app" state={state} theme={theme} onSignOut={onSignOut} />
}

function Screens(props: { basename: string; state: ViewState; theme: Theme; onSignOut: () => void }) {
  return (
    <BrowserRouter basename={props.basename}>
      <Routes>
        <Route element={<Frame state={props.state} theme={props.theme} onSignOut={props.onSignOut} />}>
          <Route index element={<VisaoGeral />} />
          <Route path="e-se" element={<ESe />} />
          <Route path="patrimonio" element={<Patrimonio />} />
          <Route path="plano" element={<Plano />} />
          <Route path="historico" element={<Historico />} />
          <Route path="como-calculamos" element={<ComoCalculamos />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

const NAV: { to: string; label: string; icon: ReactNode }[] = [
  { to: '/', label: 'Início', icon: <Home /> },
  { to: '/e-se', label: 'E se?', icon: <SlidersHorizontal /> },
  { to: '/patrimonio', label: 'Patrimônio', icon: <Wallet /> },
  { to: '/plano', label: 'Plano', icon: <CalendarRange /> },
  { to: '/historico', label: 'Histórico', icon: <History /> },
]

function Frame({ state, theme: [theme, setTheme], onSignOut }: { state: ViewState; theme: Theme; onSignOut: () => void }) {
  const view = state.kind === 'pronto' ? state.view : null
  const intermediary = view?.intermediary ?? (state.kind === 'sem_mes' ? state.intermediary : null)
  const whatIf = useWhatIf(view?.pkg ?? null, view?.ipca ?? null)
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-serif text-lg leading-tight font-semibold tracking-wide">
              AWARE <span className="font-normal text-sidebar-muted">Investments</span>
            </p>
            {intermediary ? <p className="truncate text-xs text-sidebar-muted">Assessoria de investimentos · {intermediary}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Link to="/como-calculamos" aria-label="Como calculamos" className="rounded-md p-2 hover:bg-sidebar-active [&_svg]:size-5">
              <Info />
            </Link>
            <button
              type="button"
              aria-label={`${THEME_LABEL[theme]} (trocar)`}
              title={THEME_LABEL[theme]}
              onClick={() => setTheme(NEXT_THEME[theme])}
              className="rounded-md p-2 hover:bg-sidebar-active [&_svg]:size-5"
            >
              {theme === 'claro' ? <Sun /> : theme === 'escuro' ? <Moon /> : <SunMoon />}
            </button>
            <button type="button" aria-label="Sair" onClick={onSignOut} className="rounded-md p-2 hover:bg-sidebar-active [&_svg]:size-5">
              <LogOut />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-4 pb-28">
        {view?.example ? (
          <p className="mb-3 inline-block rounded-full border border-band-yellow/50 px-2.5 py-0.5 text-xs font-medium text-band-yellow">
            Exemplo com dados fictícios
          </p>
        ) : null}
        {state.kind === 'erro' ? <Alert tone="error">Não foi possível carregar os números: {state.message}</Alert> : null}
        {state.kind === 'carregando' ? <p className="text-muted-foreground">Carregando os números do mês…</p> : null}
        {state.kind === 'sem_mes' ? (
          <div className="flex flex-col gap-3" data-testid="sem-mes">
            <h1 className="font-serif text-2xl font-semibold">Bem-vindo</h1>
            <p>Os números do seu primeiro mês ainda não saíram. Assim que a gestão fechar o mês, eles aparecem aqui.</p>
            <p className="text-sm text-muted-foreground">Dúvidas? Fale com o seu assessor.</p>
            <Button variant="outline" className="self-start" onClick={onSignOut}>
              Sair
            </Button>
          </div>
        ) : null}
        {view ? (
          <ClientViewContext.Provider value={view}>
            <WhatIfContext.Provider value={whatIf}>
              <Outlet />
            </WhatIfContext.Provider>
          </ClientViewContext.Provider>
        ) : null}
      </main>
      {view ? (
        <nav aria-label="Seções do app" className="fixed inset-x-0 bottom-0 z-20 border-t bg-card pb-[env(safe-area-inset-bottom)]">
          <ul className="mx-auto grid max-w-xl grid-cols-5">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground [&_svg]:size-5',
                      isActive && 'font-semibold text-foreground [&_svg]:text-primary',
                    )
                  }
                >
                  {n.icon}
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  )
}
