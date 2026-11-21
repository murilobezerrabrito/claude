// Entrar (SPEC, "1. Entrar"): sem cadastro aberto; o acesso vem do convite do assessor, só por e-mail. No primeiro
// acesso (link do e-mail), o cliente cria a senha e cadastra o app autenticador; depois, e-mail, senha e o código do
// autenticador. Celular primeiro, nos dois temas.

import { useState, type FormEvent, type ReactNode } from 'react'
import { Alert } from '../../ui/alert.tsx'
import { Button } from '../../ui/button.tsx'
import { Input } from '../../ui/input.tsx'
import { Label } from '../../ui/label.tsx'
import type { ClientAuth } from '../auth/useClientAuth.ts'

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col bg-sidebar px-6 py-10 text-sidebar-foreground">
      <div className="mx-auto w-full max-w-sm flex-1">
        <p className="font-serif text-2xl font-semibold tracking-wide">
          AWARE <span className="font-normal text-sidebar-muted">Investments</span>
        </p>
        <p className="mt-1 text-sm text-sidebar-muted">O seu plano, mês a mês.</p>
        <div className="mt-10 flex flex-col gap-4 rounded-xl bg-card p-5 text-card-foreground">{children}</div>
      </div>
    </main>
  )
}

function CodeField(props: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="codigo">Código do app autenticador</Label>
      <Input
        id="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value.replace(/\D/g, ''))}
        required
      />
    </div>
  )
}

export function Entrar({ auth }: { auth: ClientAuth }) {
  const { stage, error, busy } = auth
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const submit = (action: () => Promise<void>) => (e: FormEvent) => {
    e.preventDefault()
    void action()
  }
  const failure = error ? <Alert tone="error">{error}</Alert> : null

  if (stage.kind === 'carregando' || stage.kind === 'pronto') {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </Shell>
    )
  }
  if (stage.kind === 'link_invalido') {
    return (
      <Shell>
        <h1 className="font-serif text-xl font-semibold">Link inválido</h1>
        <Alert tone="error">{stage.message}</Alert>
        <Button variant="outline" onClick={() => window.location.assign('/app')}>
          Ir para a entrada
        </Button>
      </Shell>
    )
  }
  if (stage.kind === 'sem_acesso') {
    return (
      <Shell>
        <h1 className="font-serif text-xl font-semibold">Sem acesso ao app</h1>
        <p className="text-sm">
          A conta {stage.email} não é de cliente do app. Se você é da equipe da Aware, use o console; se é cliente, fale com o seu assessor.
        </p>
        <Button variant="outline" disabled={busy} onClick={() => void auth.signOut()}>
          Sair
        </Button>
      </Shell>
    )
  }
  if (stage.kind === 'criar_senha') {
    return (
      <Shell>
        <form onSubmit={submit(() => auth.createPassword(password, confirm))} className="flex flex-col gap-4">
          <h1 className="font-serif text-xl font-semibold">Crie a sua senha</h1>
          <p className="text-sm text-muted-foreground">Primeiro acesso de {stage.email}.</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="nova-senha">Senha nova</Label>
            <Input id="nova-senha" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmar-senha">Repita a senha</Label>
            <Input id="confirmar-senha" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <p className="text-xs text-muted-foreground">12 ou mais caracteres, com letras maiúsculas e minúsculas, números e símbolos.</p>
          {failure}
          <Button type="submit" size="lg" disabled={busy}>
            Criar senha
          </Button>
        </form>
      </Shell>
    )
  }
  if (stage.kind === 'cadastrar_fator') {
    return (
      <Shell>
        <form onSubmit={submit(() => auth.verify(stage.factorId, code))} className="flex flex-col gap-4">
          <h1 className="font-serif text-xl font-semibold">Cadastre o app autenticador</h1>
          <p className="text-sm text-muted-foreground">
            No app autenticador do celular (como o Google Authenticator ou o Microsoft Authenticator), leia o código abaixo ou digite a chave. Depois,
            informe o código de 6 dígitos que ele mostra.
          </p>
          <img src={stage.qrCode} alt="Código para o app autenticador" className="mx-auto size-44 rounded-md bg-white p-2" />
          <p className="text-xs break-all text-muted-foreground">
            Chave: <span data-testid="segredo-totp">{stage.secret}</span>
          </p>
          <CodeField value={code} onChange={setCode} />
          {failure}
          <Button type="submit" size="lg" disabled={busy || code.length !== 6}>
            Confirmar
          </Button>
        </form>
      </Shell>
    )
  }
  if (stage.kind === 'confirmar_fator') {
    return (
      <Shell>
        <form onSubmit={submit(() => auth.verify(stage.factorId, code))} className="flex flex-col gap-4">
          <h1 className="font-serif text-xl font-semibold">Código do app autenticador</h1>
          <CodeField value={code} onChange={setCode} />
          {failure}
          <Button type="submit" size="lg" disabled={busy || code.length !== 6}>
            Confirmar
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void auth.signOut()}>
            Entrar com outra conta
          </Button>
        </form>
      </Shell>
    )
  }
  return (
    <Shell>
      <form onSubmit={submit(() => auth.signIn(email, password))} className="flex flex-col gap-4">
        {stage.notice ? <Alert tone="info">{stage.notice}</Alert> : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="senha">Senha</Label>
          <Input id="senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {failure}
        <Button type="submit" size="lg" disabled={busy}>
          Entrar
        </Button>
        <p className="text-xs text-muted-foreground">O acesso vem do convite do seu assessor, por e-mail. Não há cadastro aberto.</p>
      </form>
    </Shell>
  )
}
