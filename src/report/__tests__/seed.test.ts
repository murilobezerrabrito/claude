import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildSeedSql, seedUuid } from '../../../scripts/dbSeed.ts'
import { REPORT_FOOTER_TEMPLATE } from '../texts.ts'

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

  it('identificadores determinísticos: o mesmo valor a cada geração', () => {
    expect(seedUuid('household:andrade')).toBe('845857a2-9d29-4e40-841c-356c3edff2da')
  })

  it('cada família com a sua semente; a Andrade com a do SPEC', () => {
    const seeds = [...seed.matchAll(/insert into public\.households \([^)]*\) values \((.*)\);/g)].map((m) => Number(m[1].split(', ').at(-1)))
    expect(seeds[0]).toBe(20261002)
    expect(new Set(seeds).size).toBe(seeds.length)
  })

  it('o rodapé do relatório vem dos textos do relatório (o mesmo do PDF)', () => {
    expect(seed).toContain(REPORT_FOOTER_TEMPLATE.replace(/'/g, "''"))
  })
})
