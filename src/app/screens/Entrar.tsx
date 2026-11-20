// Entrar (SPEC, "1. Entrar"): e-mail e senha, depois o código do app autenticador. Sem cadastro aberto: o acesso vem do
// convite do responsável. Na etapa 3a (exemplo), a tela não confere nada e abre os números da Família Andrade; o login
// de verdade entra na 3c.

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../ui/button.tsx'
import { Input } from '../../ui/input.tsx'
import { Label } from '../../ui/label.tsx'

export function Entrar() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'senha' | 'codigo'>('senha')
  const [code, setCode] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (step === 'senha') setStep('codigo')
    else void navigate('/')
  }
  return (
    <main className="flex min-h-svh flex-col bg-sidebar px-6 py-10 text-sidebar-foreground">
      <div className="mx-auto w-full max-w-sm flex-1">
        <p className="font-serif text-2xl font-semibold tracking-wide">
          AWARE <span className="font-normal text-sidebar-muted">Investments</span>
        </p>
        <p className="mt-1 text-sm text-sidebar-muted">O seu plano, mês a mês.</p>
        <form onSubmit={submit} className="mt-10 flex flex-col gap-4 rounded-xl bg-card p-5 text-card-foreground">
          {step === 'senha' ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" autoComplete="username" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="senha">Senha</Label>
                <Input id="senha" type="password" autoComplete="current-password" required />
              </div>
              <Button type="submit" size="lg">
                Entrar
              </Button>
              <p className="text-xs text-muted-foreground">O acesso vem do convite do seu assessor. Não há cadastro aberto.</p>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="codigo">Código do app autenticador</Label>
                <Input
                  id="codigo"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>
              <Button type="submit" size="lg" disabled={code.length !== 6}>
                Confirmar
              </Button>
            </>
          )}
        </form>
        <p className="mt-6 rounded-md border border-white/20 px-3 py-2 text-xs text-sidebar-muted">
          Exemplo com dados fictícios: qualquer e-mail, senha e código de 6 dígitos abrem os números da Família Andrade.
        </p>
      </div>
    </main>
  )
}
