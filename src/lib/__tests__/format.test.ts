import { describe, expect, it } from 'vitest'
import {
  formatAge,
  formatDate,
  formatFrequency,
  formatMoney,
  formatMoneyExact,
  formatMonthLabel,
  formatMonthly,
  formatPercent,
  formatPp,
  formatProbability,
  formatRealReturn,
  formatSignedPercent,
  formatTenthsPercent,
  formatTenthsPp,
  monthName,
} from '../format.ts'

/** Troca o espaço que não quebra a linha por um espaço comum, para comparar. */
const plain = (s: string) => s.replace(/\u00a0/g, ' ')

describe('formatação para o cliente (SPEC, "Formatação de números")', () => {
  it('moeda: "R$ 12,4 mi", "R$ 850 mil", "R$ 85 mil por mês" e o valor exato', () => {
    expect(plain(formatMoney(12_400_000))).toBe('R$ 12,4 mi')
    expect(plain(formatMoney(850_000))).toBe('R$ 850 mil')
    expect(plain(formatMoney(999_600))).toBe('R$ 1,0 mi')
    expect(plain(formatMoney(1_250_000_000))).toBe('R$ 1,3 bi')
    expect(plain(formatMoney(900))).toBe('R$ 900')
    expect(plain(formatMoney(-300_000))).toBe('−R$ 300 mil')
    expect(plain(formatMonthly(85_000))).toBe('R$ 85 mil por mês')
    expect(plain(formatMoneyExact(12_400_000))).toBe('R$ 12.400.000,00')
    expect(plain(formatMoneyExact(11_450_961.29))).toBe('R$ 11.450.961,29')
  })

  it('probabilidade sem casas, também como frequência; nunca 100% sem certeza nem 0% com chance', () => {
    expect(formatProbability(0.8651)).toBe('87%')
    expect(formatFrequency(0.6195)).toBe('62 de cada 100 cenários')
    expect(formatProbability(0.996)).toBe('99%')
    expect(formatProbability(1)).toBe('100%')
    expect(formatProbability(0.003)).toBe('1%')
    expect(formatProbability(0)).toBe('0%')
  })

  it('retornos com uma casa e variações em pontos percentuais, com "−"', () => {
    expect(formatRealReturn(0.03806)).toBe('IPCA + 3,8% a.a.')
    expect(formatRealReturn(-0.005)).toBe('IPCA − 0,5% a.a.')
    expect(formatRealReturn(0.03244, 2)).toBe('IPCA + 3,24% a.a.')
    expect(plain(formatPp(0.0038, 2))).toBe('+0,38 p.p.')
    expect(plain(formatPp(-0.02))).toBe('−2,0 p.p.')
    expect(plain(formatPp(0.00001))).toBe('0,0 p.p.')
    expect(formatSignedPercent(-0.024925)).toBe('−2,5%')
    expect(formatPercent(0.6195)).toBe('62,0%')
  })

  it('ponte em décimos de ponto percentual', () => {
    expect(formatTenthsPercent(865)).toBe('86,5%')
    expect(plain(formatTenthsPp(-181))).toBe('−18,1 p.p.')
    expect(plain(formatTenthsPp(3))).toBe('+0,3 p.p.')
    expect(plain(formatTenthsPp(0))).toBe('0,0 p.p.')
  })

  it('datas e idades: "set/2026", "30/09/2026", "aos 62 anos"', () => {
    expect(formatMonthLabel('2026-09')).toBe('set/2026')
    expect(formatMonthLabel('2026-10-31')).toBe('out/2026')
    expect(monthName('2026-10')).toBe('outubro')
    expect(formatDate('2026-09-30')).toBe('30/09/2026')
    expect(formatAge(62)).toBe('aos 62 anos')
  })
})
