// Acesso do cliente AI na página da família (SPEC, "1. Entrar": convite do responsável; D-071 e D-074): o convite vai
// só para o e-mail do cliente, que cria a senha e cadastra o app autenticador; quem convida nunca vê o link. Um
// cliente por família (o titular): o convite pendente pode ser reenviado ou trocado de e-mail, e o acesso pode ser
// tirado. A gestão e o responsável da família cuidam do acesso; comitê e compliance só veem.

import { useEffect, useState, type FormEvent } from 'react'
import type { ClientAccess as ClientAccessData, ClientInviteResult } from '../../lib/apiTypes.ts'
import { callFunction, errorText, rpc } from '../api.ts'
import { Alert } from '../../ui/alert.tsx'
import { Badge } from '../../ui/badge.tsx'
import { Button } from '../../ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card.tsx'
import { Input } from '../../ui/input.tsx'
import { Label } from '../../ui/label.tsx'

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—')

export function ClientAccess({ household }: { household: string }) {
  const [data, setData] = useState<ClientAccessData | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    rpc<ClientAccessData>('client_access_of', { p_household: household })
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && setFailure(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [household, version])

  const act = async (action: () => Promise<string>) => {
    setBusy(true)
    setFailure(null)
    setNotice(null)
    try {
      setNotice(await action())
      setVersion((v) => v + 1)
    } catch (e) {
      setFailure(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const invite = (to: string) =>
    act(async () => {
      const r = await callFunction<ClientInviteResult>('client-invite', { household_id: household, email: to })
      setEmail('')
      return r.envio === 'novo'
        ? `Convite enviado para ${r.email}. O link vale 24 horas e chega só no e-mail do cliente.`
        : `Convite reenviado para ${r.email}. O link vale 24 horas e chega só no e-mail do cliente.`
    })
  const revoke = (userId: string, address: string) => {
    if (!window.confirm(`Tirar o acesso de ${address} ao app? A conta deixa de ver os números da família.`)) return
    void act(async () => {
      await rpc('revoke_client_access', { p_household: household, p_user: userId })
      return `Acesso de ${address} retirado.`
    })
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void invite(email)
  }

  const active = data?.clients.find((c) => c.state === 'ativo')
  return (
    <Card data-testid="acesso-cliente">
      <CardHeader>
        <CardTitle>Acesso do cliente</CardTitle>
        <CardDescription>
          O convite vai só para o e-mail do cliente (titular), com um link de 24 horas para criar a senha e cadastrar o app autenticador.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {failure ? <Alert tone="error">{failure}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}
        {!data && !failure ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
        {data && data.clients.length === 0 ? <p className="text-sm text-muted-foreground">O cliente ainda não foi convidado.</p> : null}
        {data?.clients.map((c) => (
          <div key={c.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" data-testid="cliente">
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{c.email}</span>
              <span className="text-xs text-muted-foreground">
                Convidado em {when(c.invited_at)} · último acesso: {when(c.last_sign_in_at)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={c.state === 'ativo' ? 'green' : 'yellow'}>{c.state === 'ativo' ? 'Ativo' : 'Convite pendente'}</Badge>
              {data.can_manage && c.state === 'pendente' ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void invite(c.email)}>
                  Reenviar convite
                </Button>
              ) : null}
              {data.can_manage ? (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => revoke(c.user_id, c.email)}>
                  Tirar acesso
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        {data?.can_manage && !active ? (
          <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-64 flex-1 flex-col gap-2">
              <Label htmlFor="email-cliente">{data.clients.length > 0 ? 'Convidar outro e-mail (troca o convite pendente)' : 'E-mail do cliente'}</Label>
              <Input id="email-cliente" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" disabled={busy || email.trim() === ''}>
              Enviar convite
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}
