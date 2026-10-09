// Quem está usando o console: o usuário e os seus papéis (o banco confere tudo de novo; isto só mostra ou esconde).

import type { User } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'
import type { AppRole } from '../lib/apiTypes.ts'
import type { UserRole } from './auth/useConsoleAuth.ts'

export interface ConsoleSession {
  user: User
  roles: UserRole[]
  has: (...roles: AppRole[]) => boolean
  /** Algum papel sem permissão para valores em reais: o banco esconde os valores. */
  canSeeAmounts: boolean
}

export const SessionContext = createContext<ConsoleSession | null>(null)

export function useSession(): ConsoleSession {
  const s = useContext(SessionContext)
  if (!s) throw new Error('useSession fora do console.')
  return s
}

export function makeSession(user: User, roles: UserRole[]): ConsoleSession {
  return {
    user,
    roles,
    has: (...wanted) => roles.some((r) => wanted.includes(r.role)),
    canSeeAmounts: roles.every((r) => r.can_see_amounts),
  }
}

export const ROLE_LABELS: Record<AppRole, string> = {
  gestao: 'Gestão',
  comite: 'Comitê',
  compliance: 'Compliance',
  banker: 'Banker',
  responsavel: 'Responsável AI',
  cliente_ai: 'Cliente AI',
}
