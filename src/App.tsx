// Console interno do AWARE Objective (Fase 2): login com segundo fator e as telas do ciclo mensal. O app dos clientes
// AI tem um ponto de entrada próprio na Fase 3; o código do console não entra nele.

import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { LoginScreen } from './console/auth/LoginScreen.tsx'
import { useConsoleAuth } from './console/auth/useConsoleAuth.ts'
import { FamiliesPage } from './console/pages/FamiliesPage.tsx'
import { MappingPage } from './console/pages/MappingPage.tsx'
import { MonthPage } from './console/pages/MonthPage.tsx'
import { ReportPreview } from './console/report/ReportPreview.tsx'
import { makeSession, SessionContext } from './console/session.tsx'
import { Shell } from './console/Shell.tsx'
import { Alert } from './console/ui/alert.tsx'
import { supabaseConfigured } from './lib/supabase.ts'

export default function App() {
  const auth = useConsoleAuth()
  if (!supabaseConfigured) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <Alert tone="error">
          O console não sabe onde está o Supabase. No ambiente local, rode <code>npm run env:local</code> e reinicie o <code>npm run dev</code>.
        </Alert>
      </main>
    )
  }
  if (auth.stage.kind !== 'pronto') {
    return <LoginScreen stage={auth.stage} error={auth.error} busy={auth.busy} signIn={auth.signIn} verify={auth.verify} signOut={auth.signOut} />
  }
  const session = makeSession(auth.stage.user, auth.stage.roles)
  return (
    <SessionContext.Provider value={session}>
      <BrowserRouter>
        <Shell onSignOut={auth.signOut}>
          <Routes>
            <Route path="/familias" element={<FamiliesPage />} />
            <Route path="/mes" element={<MonthPage />} />
            <Route path="/mapeamento" element={<MappingPage />} />
            <Route path="/relatorio-exemplo" element={<ReportPreview />} />
            <Route path="*" element={<Navigate to={session.has('gestao') ? '/mes' : '/familias'} replace />} />
          </Routes>
        </Shell>
      </BrowserRouter>
    </SessionContext.Provider>
  )
}
