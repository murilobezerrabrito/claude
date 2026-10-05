import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildSeedSql, seedUuid } from '../../../scripts/dbSeed.ts'

const seed = readFileSync(new URL('../../../supabase/seed.sql', import.meta.url), 'utf8')

describe('seed do banco local (supabase/seed.sql)', () => {
  it('está em dia com o gerador; se mudar src/data, rode npm run db:seed', () => {
    expect(seed).toBe(buildSeedSql())
  })

  it('só tem dados fictícios: e-mails em domínio reservado e famílias marcadas como fictícias', () => {
    const emails = seed.match(/'[^']+@[^']+'/g) ?? []
    expect(emails.length).toBeGreaterThan(0)
    for (const e of emails) expect(e).toMatch(/@exemplo\.invalid'$/)
    const names = [...seed.matchAll(/insert into public\.households \([^)]*\) values \('[^']+', '[^']+', '([^']+)'/g)].map((m) => m[1])
    expect(names).toEqual(['Família Andrade (fictícia)', 'Família Barbosa (fictícia)', 'Família Costa (fictícia)'])
    expect(seed).not.toMatch(/encrypted_password/)
  })

  it('identificadores determinísticos', () => {
    expect(seedUuid('household:andrade')).toBe(seedUuid('household:andrade'))
    expect(seedUuid('household:andrade')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
