// Meses-base que a nova versão do plano pode ter (mesmas regras de save_plan_version): nunca no futuro, depois do
// último mês fechado da família e não antes da versão mais recente. Do mais recente ao mais antigo, em "AAAA-MM";
// família sem histórico pode escolher até 12 meses para trás.

const toIndex = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return y * 12 + (m - 1)
}
const fromIndex = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`

export function allowedBaseMonths(args: { lastClosedMonth: string | null; latestBaseMonth: string | null; today: string }): string[] {
  const now = toIndex(args.today.slice(0, 7))
  let from = now - 12
  if (args.lastClosedMonth) from = Math.max(from, toIndex(args.lastClosedMonth.slice(0, 7)) + 1)
  if (args.latestBaseMonth) from = Math.max(from, toIndex(args.latestBaseMonth.slice(0, 7)))
  const out: string[] = []
  for (let i = now; i >= from; i--) out.push(fromIndex(i))
  return out
}
