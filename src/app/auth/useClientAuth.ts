// Entrada do cliente AI (SPEC, "1. Entrar"; D-071 e D-074): sem cadastro aberto. O primeiro acesso vem do link do
// convite (ou do link de criar senha), que chega só no e-mail do cliente e abre esta tela com uma sessão do Auth: o
// cliente cria a senha e cadastra o app autenticador. Depois, e-mail, senha e o código do autenticador a cada entrada.
// Sem o segundo fator o banco não libera nada (D-042); a sessão dura 30 minutos e fica no sessionStorage.

import type { User } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { authMessage } from '../../lib/authMessages.ts'
import { supabase } from '../../lib/supabase.ts'

export type ClientAuthStage =
  | { kind: 'carregando' }
  | { kind: 'link_invalido'; message: string }
  | { kind: 'criar_senha'; email: string }
  | { kind: 'entrar'; notice?: string }
  | { kind: 'cadastrar_fator'; factorId: string; qrCode: string; secret: string }
  | { kind: 'confirmar_fator'; factorId: string }
  | { kind: 'pronto'; user: User }
  | { kind: 'sem_acesso'; email: string }

/** Regras de senha do Auth (config.toml, D-042): 12 ou mais caracteres, maiúsculas, minúsculas, números e símbolos. */
export function passwordIssue(password: string, confirm: string): string | null {
  if (password.length < 12) return 'A senha precisa de 12 ou mais caracteres.'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) return 'Use letras maiúsculas e minúsculas.'
  if (!/\d/.test(password)) return 'Use ao menos um número.'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Use ao menos um símbolo, como ! ou #.'
  if (password !== confirm) return 'As duas senhas não são iguais.'
  return null
}

/** O que o link do e-mail traz depois do # (sessão do convite ou do link de criar senha, ou o erro do Auth). */
export function readAuthLink(hash: string):
  | { kind: 'sessao'; accessToken: string; refreshToken: string }
  | { kind: 'erro'; message: string }
  | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  if (p.get('error') || p.get('error_code')) {
    return {
      kind: 'erro',
      message:
        p.get('error_code') === 'otp_expired'
          ? 'Este link venceu ou já foi usado. Peça um novo convite ao seu assessor.'
          : 'Não foi possível abrir este link. Peça um novo convite ao seu assessor.',
    }
  }
  const accessToken = p.get('access_token')
  const refreshToken = p.get('refresh_token')
  const type = p.get('type')
  if (accessToken && refreshToken && (type === 'invite' || type === 'recovery')) return { kind: 'sessao', accessToken, refreshToken }
  return null
}

/**
 * Marca de "falta criar a senha" na aba: quem entrou pelo link do e-mail só segue para o autenticador depois de criar a
 * senha, mesmo que recarregue a página (o link já saiu do endereço, mas a sessão dele fica no sessionStorage).
 */
const MUST_SET_PASSWORD = 'aware.app.criar_senha'
function mustSetPassword(value?: boolean): boolean {
  try {
    if (value === true) window.sessionStorage.setItem(MUST_SET_PASSWORD, '1')
    else if (value === false) window.sessionStorage.removeItem(MUST_SET_PASSWORD)
    return window.sessionStorage.getItem(MUST_SET_PASSWORD) === '1'
  } catch {
    return false
  }
}

/**
 * Lê o link do e-mail uma vez por carregamento da página (o React pode montar a tela duas vezes): tira o # do endereço,
 * entra com a sessão do link e devolve a etapa de criar senha (ou o erro do link); sem link, null.
 */
let linkStart: Promise<ClientAuthStage | null> | null = null
function startFromLink(): Promise<ClientAuthStage | null> {
  if (!linkStart) {
    const link = readAuthLink(window.location.hash)
    if (link) window.history.replaceState(null, '', window.location.pathname + window.location.search)
    linkStart = (async () => {
      if (!link) return null
      if (link.kind === 'erro') return { kind: 'link_invalido', message: link.message }
      const { data, error } = await supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
      if (error || !data.user) throw error ?? new Error('Link sem usuário.')
      mustSetPassword(true)
      return { kind: 'criar_senha', email: data.user.email ?? '' }
    })()
  }
  return linkStart
}

/** O QR code do Supabase vem como SVG; vira endereço de imagem. */
const qrSource = (qr: string) => (qr.startsWith('data:') ? qr : `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`)

export function useClientAuth() {
  const [stage, setStage] = useState<ClientAuthStage>({ kind: 'carregando' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const signingOut = useRef(false)
  const signedIn = useRef(false)

  /** Depois da senha (ou ao abrir com sessão): cadastra ou confere o segundo fator e confere o papel de cliente. */
  const resolve = useCallback(async () => {
    const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal.error) throw aal.error
    if (aal.data.currentLevel === 'aal2') {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) throw userError ?? new Error('Sessão sem usuário.')
      const { data, error: rolesError } = await supabase.from('user_roles').select('role').eq('user_id', userData.user.id)
      if (rolesError) throw rolesError
      signedIn.current = true
      if (!(data ?? []).some((r: { role: string }) => r.role === 'cliente_ai')) {
        setStage({ kind: 'sem_acesso', email: userData.user.email ?? '' })
        return
      }
      setStage({ kind: 'pronto', user: userData.user })
      return
    }
    const factors = await supabase.auth.mfa.listFactors()
    if (factors.error) throw factors.error
    const verified = factors.data.totp.find((f) => f.status === 'verified')
    if (verified) {
      setStage({ kind: 'confirmar_fator', factorId: verified.id })
      return
    }
    // Primeiro acesso: tira cadastros abandonados e começa um novo.
    for (const f of factors.data.all) {
      if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
    const enrolled = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'AWARE Investments' })
    if (enrolled.error) throw enrolled.error
    setStage({ kind: 'cadastrar_fator', factorId: enrolled.data.id, qrCode: qrSource(enrolled.data.totp.qr_code), secret: enrolled.data.totp.secret })
  }, [])

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(authMessage(e as { message?: string }))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      const fromLink = await startFromLink()
      if (cancelled) return
      if (fromLink) {
        setStage(fromLink)
        return
      }
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session && mustSetPassword()) setStage({ kind: 'criar_senha', email: data.session.user.email ?? '' })
      else if (data.session) await resolve()
      else setStage({ kind: 'entrar' })
    }
    start().catch((e: unknown) => {
      if (cancelled) return
      setError(authMessage(e as { message?: string }))
      setStage({ kind: 'entrar' })
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return
      // Fim da sessão (30 minutos) ou saída pelo botão.
      const notice = signingOut.current || !signedIn.current ? undefined : 'Sua sessão terminou. Entre de novo para continuar.'
      mustSetPassword(false)
      signingOut.current = false
      signedIn.current = false
      setStage({ kind: 'entrar', notice })
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [resolve])

  const signIn = (email: string, password: string) =>
    run(async () => {
      const { error: e } = await supabase.auth.signInWithPassword({ email, password })
      if (e) throw e
      await resolve()
    })

  const createPassword = (password: string, confirm: string) =>
    run(async () => {
      const issue = passwordIssue(password, confirm)
      if (issue) throw new Error(issue)
      const { error: e } = await supabase.auth.updateUser({ password })
      if (e) throw e
      mustSetPassword(false)
      await resolve()
    })

  const verify = (factorId: string, code: string) =>
    run(async () => {
      const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') })
      if (e) throw e
      await resolve()
    })

  const signOut = () =>
    run(async () => {
      signingOut.current = true
      await supabase.auth.signOut()
    })

  return { stage, error, busy, signIn, createPassword, verify, signOut }
}

export type ClientAuth = ReturnType<typeof useClientAuth>
