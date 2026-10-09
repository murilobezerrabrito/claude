// Login do console (SPEC, "Segurança"): senha e, sempre, o segundo fator por app autenticador. No primeiro acesso,
// o console cadastra o autenticador (QR code do próprio Supabase); depois, pede o código a cada entrada. Sem o
// segundo fator, o banco não libera nada (D-042). Só usuários internos usam o console.

import type { User } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppRole } from '../../lib/apiTypes.ts'
import { supabase } from '../../lib/supabase.ts'
import { authMessage } from './messages.ts'

export interface UserRole {
  role: AppRole
  household_id: string | null
  can_see_amounts: boolean
}

export type AuthStage =
  | { kind: 'carregando' }
  | { kind: 'entrar'; notice?: string }
  | { kind: 'cadastrar_fator'; factorId: string; qrCode: string; secret: string }
  | { kind: 'confirmar_fator'; factorId: string }
  | { kind: 'pronto'; user: User; roles: UserRole[] }
  | { kind: 'sem_acesso'; email: string }

const INTERNAL: AppRole[] = ['gestao', 'comite', 'compliance', 'banker', 'responsavel']

/** O QR code do Supabase vem como SVG; vira endereço de imagem. */
function qrSource(qr: string): string {
  return qr.startsWith('data:') ? qr : `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`
}

export function useConsoleAuth() {
  const [stage, setStage] = useState<AuthStage>({ kind: 'carregando' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const signingOut = useRef(false)
  const signedIn = useRef(false)

  /** Depois da senha (ou ao abrir com sessão): cadastra ou confere o segundo fator e carrega os papéis. */
  const resolve = useCallback(async () => {
    const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal.error) throw aal.error
    if (aal.data.currentLevel === 'aal2') {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) throw userError ?? new Error('Sessão sem usuário.')
      const { data, error: rolesError } = await supabase.from('user_roles').select('role, household_id, can_see_amounts').eq('user_id', userData.user.id)
      if (rolesError) throw rolesError
      const roles = (data ?? []) as UserRole[]
      signedIn.current = true
      if (!roles.some((r) => INTERNAL.includes(r.role))) {
        setStage({ kind: 'sem_acesso', email: userData.user.email ?? '' })
        return
      }
      setStage({ kind: 'pronto', user: userData.user, roles })
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
    const enrolled = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'AWARE Objective' })
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
    // Ao abrir: com sessão guardada, segue para o segundo fator; sem ela, para a senha.
    supabase.auth
      .getSession()
      .then(({ data }) => (data.session ? resolve() : setStage({ kind: 'entrar' })))
      .catch((e: unknown) => {
        setError(authMessage(e as { message?: string }))
        setStage({ kind: 'entrar' })
      })
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return
      // Fim da sessão (30 minutos) ou saída pelo botão.
      const notice = signingOut.current || !signedIn.current ? undefined : 'Sua sessão terminou. Entre de novo para continuar.'
      signingOut.current = false
      signedIn.current = false
      setStage({ kind: 'entrar', notice })
    })
    return () => sub.subscription.unsubscribe()
  }, [resolve])

  const signIn = (email: string, password: string) =>
    run(async () => {
      const { error: e } = await supabase.auth.signInWithPassword({ email, password })
      if (e) throw e
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

  return { stage, error, busy, signIn, verify, signOut }
}
