// Telas de entrada: senha, cadastro do app autenticador (primeiro acesso) e código do autenticador.

import { useState, type FormEvent, type ReactNode } from 'react'
import { Alert } from '../ui/alert.tsx'
import { Button } from '../ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx'
import { Input } from '../ui/input.tsx'
import { Label } from '../ui/label.tsx'
import type { AuthStage } from './useConsoleAuth.ts'

interface Props {
  stage: Exclude<AuthStage, { kind: 'pronto' }>
  error: string | null
  busy: boolean
  signIn: (email: string, password: string) => void
  verify: (factorId: string, code: string) => void
  signOut: () => void
}

function Frame({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center font-serif text-2xl font-semibold tracking-wide text-sidebar-foreground">
          AWARE <span className="font-normal text-sidebar-muted">Objective</span>
        </p>
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">{children}</CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-sidebar-muted">Console interno da Aware Investments. Acesso só por convite, com segundo fator.</p>
      </div>
    </main>
  )
}

function CodeForm({ factorId, busy, verify, label }: { factorId: string; busy: boolean; verify: Props['verify']; label: string }) {
  const [code, setCode] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    verify(factorId, code)
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Label htmlFor="codigo">{label}</Label>
      <Input
        id="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        required
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="text-center font-mono text-lg tracking-[0.4em]"
      />
      <Button type="submit" disabled={busy}>
        {busy ? 'Conferindo…' : 'Confirmar'}
      </Button>
    </form>
  )
}

export function LoginScreen({ stage, error, busy, signIn, verify, signOut }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const errorBox = error ? <Alert tone="error">{error}</Alert> : null

  switch (stage.kind) {
    case 'carregando':
      return <Frame title="Carregando…">{errorBox}</Frame>
    case 'entrar':
      return (
        <Frame title="Entrar">
          {stage.notice ? <Alert tone="warning">{stage.notice}</Alert> : null}
          {errorBox}
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              signIn(email, password)
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="senha">Senha</Label>
              <Input id="senha" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </Frame>
      )
    case 'cadastrar_fator':
      return (
        <Frame
          title="Cadastre o app autenticador"
          description="Primeiro acesso: o segundo fator é obrigatório. Leia o QR code com o app autenticador do celular (Google Authenticator, Microsoft Authenticator ou outro) e digite o código de 6 dígitos."
        >
          {errorBox}
          <img src={stage.qrCode} alt="QR code para cadastrar o app autenticador" className="mx-auto size-44 rounded-md bg-white p-2" />
          <p className="text-center text-xs text-muted-foreground">
            Sem câmera? Digite a chave no app: <code data-testid="segredo-totp" className="break-all font-mono text-foreground">{stage.secret}</code>
          </p>
          <CodeForm factorId={stage.factorId} busy={busy} verify={verify} label="Código do app autenticador" />
          <Button variant="link" onClick={signOut}>
            Sair
          </Button>
        </Frame>
      )
    case 'confirmar_fator':
      return (
        <Frame title="Segundo fator" description="Digite o código de 6 dígitos do app autenticador.">
          {errorBox}
          <CodeForm factorId={stage.factorId} busy={busy} verify={verify} label="Código do app autenticador" />
          <Button variant="link" onClick={signOut}>
            Sair
          </Button>
        </Frame>
      )
    case 'sem_acesso':
      return (
        <Frame title="Sem acesso ao console" description={`${stage.email} não tem papel na equipe da Aware. Clientes da assessoria usam o app, não o console.`}>
          <Button onClick={signOut}>Sair</Button>
        </Frame>
      )
  }
}
