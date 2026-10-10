import { describe, expect, it } from 'vitest'
import type { FamilyOverviewRow } from '../../lib/apiTypes.ts'
import { attentionReasons, bandOf, sortFamilies, variationTenths } from '../families.ts'

function family(code: string, probability: number | null, previous: number | null = null, slack: number | null = 0.01): FamilyOverviewRow {
  return {
    household_id: code,
    code,
    name: `Família ${code}`,
    channel: 'cadm',
    status: 'ativa',
    profile_id: 'moderado',
    weights_source: 'perfil',
    latest: probability === null ? null : { ref_date: '2026-10-31', probability, required_return: 0.03, slack, realized_return_real: null },
    previous_probability: previous,
    month: null,
  }
}

describe('famílias por canal', () => {
  it('variação no mês a partir das chances já arredondadas (o que aparece fecha a conta)', () => {
    // Andrade (src/data/relatorios/andrade-2026-10.json): 86,51% → 865 décimos; 61,95% → 620 (meio para cima);
    // variação −24,5 p.p., a mesma da ponte do relatório de outubro (865 → 620).
    expect(variationTenths(family('AND001', 0.6195, 0.8651))).toBe(-245)
    expect(variationTenths(family('X', 0.6195))).toBeNull()
    expect(variationTenths(family('X', null, 0.8))).toBeNull()
  })

  it('filtro "precisam de atenção": abaixo de 70%, queda de mais de 5 p.p., 99% ou mais', () => {
    expect(attentionReasons(family('A', 0.6999))).toEqual(['abaixo_de_70'])
    expect(attentionReasons(family('B', 0.7))).toEqual([])
    expect(attentionReasons(family('C', 0.85, 0.9006))).toEqual(['queda_no_mes'])
    // Queda de 5 p.p. na tela não entra ("mais de 5 p.p."), nem com o erro binário de 0,9 − 0,85, nem 5,01 p.p.
    // (que aparece como "−5,0 p.p.").
    expect(attentionReasons(family('D', 0.85, 0.9))).toEqual([])
    expect(attentionReasons(family('D', 0.85, 0.9001))).toEqual([])
    expect(attentionReasons(family('E', 0.99))).toEqual(['acima_de_99'])
    expect(attentionReasons(family('F', 0.6, 0.8))).toEqual(['abaixo_de_70', 'queda_no_mes'])
    // Sem rodada, sem número: não entra no filtro.
    expect(attentionReasons(family('G', null))).toEqual([])
  })

  it('selo da faixa pelos limites do SPEC', () => {
    expect(bandOf(family('A', 0.99))).toBe('folga_grande')
    expect(bandOf(family('A', 0.85))).toBe('no_caminho')
    expect(bandOf(family('A', 0.7))).toBe('atencao')
    expect(bandOf(family('A', 0.6999))).toBe('em_risco')
    expect(bandOf(family('A', null))).toBeNull()
  })

  it('ordena pela coluna; sem número fica no fim nos dois sentidos; o código desempata', () => {
    const rows = [family('C', 0.9), family('A', null), family('B', 0.6), family('D', 0.9)]
    expect(sortFamilies(rows, 'chance', true).map((f) => f.code)).toEqual(['B', 'C', 'D', 'A'])
    expect(sortFamilies(rows, 'chance', false).map((f) => f.code)).toEqual(['C', 'D', 'B', 'A'])
    expect(sortFamilies(rows, 'familia', true).map((f) => f.code)).toEqual(['A', 'B', 'C', 'D'])
    expect(sortFamilies(rows, 'familia', false).map((f) => f.code)).toEqual(['D', 'C', 'B', 'A'])
    const slack = [family('A', 0.9, null, null), family('B', 0.9, null, -0.01), family('C', 0.9, null, 0.02)]
    expect(sortFamilies(slack, 'folga', true).map((f) => f.code)).toEqual(['B', 'C', 'A'])
  })
})
