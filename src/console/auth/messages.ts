// Mensagens do login em português. O Auth do Supabase responde em inglês; os ganchos de bloqueio já respondem em
// português (supabase/migrations/…500_bloqueio.sql).

export function authMessage(error: { message?: string; status?: number } | null | undefined): string {
  const m = error?.message ?? ''
  if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.'
  if (/invalid totp|invalid mfa|code.*(invalid|expired)/i.test(m)) return 'Código incorreto ou vencido. Confira o app autenticador e tente de novo.'
  if (/email logins are disabled|signups not allowed/i.test(m)) return 'Este acesso não está liberado. Fale com o comitê.'
  if (/fetch|network/i.test(m)) return 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.'
  if (/too many requests|rate limit/i.test(m)) return 'Muitas tentativas em pouco tempo. Espere um pouco e tente de novo.'
  return m === '' ? 'Algo deu errado. Tente de novo.' : m
}
