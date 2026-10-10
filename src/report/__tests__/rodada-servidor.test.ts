// Rodada do servidor (uma simulação por chamada): as partes guardadas montam a mesma rodada oficial e a mesma ponte
// de officialRun e monthAttribution; parte faltando ou de outras entradas é recusada.

import { describe, expect, it } from 'vitest'
import dataset from '../../data/andrade-fechamentos.json'
import { monthAttribution } from '../attribution.ts'
import { planVersionFor } from '../monthInputs.ts'
import { officialRun, type MonthPackage } from '../officialRun.ts'
import { monthReturn } from '../performance.ts'
import { assembleRun, runPart, runTasks, type PartOutcome, type RunInputs, type RunPart } from '../runTasks.ts'
import type { HouseholdMonths, MonthClosing } from '../types.ts'
import { cma, profiles } from './helpers.ts'

const paths = 2_000
const data = dataset as unknown as HouseholdMonths
const pkg = (closing: MonthClosing): MonthPackage => ({
  household: data.household,
  planVersion: planVersionFor(data.planVersions, closing.refDate.slice(0, 7)),
  closing,
  cma,
  profiles,
})
const setembro = pkg(data.closings[0])
const outubro = pkg(data.closings[1])

/** Roda cada parte e guarda como o banco guarda (ida e volta por JSON). */
function runAll(inputs: RunInputs) {
  const tasks = runTasks(inputs, { paths })
  const stored: Partial<Record<RunPart, PartOutcome>> = {}
  for (const part of tasks.parts) stored[part] = JSON.parse(JSON.stringify(runPart(tasks, part))) as PartOutcome
  return { tasks, stored }
}

describe('rodada oficial no servidor, por partes', () => {
  it('primeiro mês: só a rodada principal (e a com gasto flexível, se o plano liga as regras)', () => {
    const inputs: RunInputs = { pkg: setembro, ipca: data.ipca, previous: null }
    const { tasks, stored } = runAll(inputs)
    expect(tasks.parts[0]).toBe('principal')
    expect(tasks.parts).not.toContain('inicio')
    const r = assembleRun(inputs, tasks, stored)
    expect(r.run).toEqual(officialRun(setembro, data.ipca, { paths }))
    expect(r.attribution).toEqual({ kind: 'primeiro_mes' })
    expect(r.realizedReturnReal).toBeNull()
  })

  it('mês seguinte: a mesma rodada, a mesma ponte e a rentabilidade do mês', () => {
    const published = officialRun(setembro, data.ipca, { paths })
    const inputs: RunInputs = { pkg: outubro, ipca: data.ipca, previous: { pkg: setembro, published } }
    const { tasks, stored } = runAll(inputs)
    expect(tasks.parts.slice(-6)).toEqual(['inicio', 'passagem_do_tempo', 'mercado', 'aportes_e_resgates', 'carteira', 'plano'])
    const r = assembleRun(inputs, tasks, stored)
    expect(r.run).toEqual(officialRun(outubro, data.ipca, { paths }))
    expect(r.attribution).toEqual(monthAttribution({ previous: { pkg: setembro, published }, current: outubro, ipca: data.ipca, paths }))
    expect(r.realizedReturnReal).toBe(
      monthReturn({ refDate: '2026-10-31', startValue: setembro.closing.officialPl, endValue: outubro.closing.officialPl, flows: outubro.closing.flows, ipca: data.ipca }).real,
    )
  })

  it('parte faltando ou rodada com outras entradas é recusada', () => {
    const inputs: RunInputs = { pkg: setembro, ipca: data.ipca, previous: null }
    const { tasks, stored } = runAll(inputs)
    expect(() => assembleRun(inputs, tasks, { ...stored, principal: undefined })).toThrow('Falta a parte "principal" da rodada.')
    const other = runAll({ pkg: { ...setembro, household: { ...setembro.household, feeRate: 0.01 } }, ipca: data.ipca, previous: null })
    expect(() => assembleRun(inputs, tasks, { ...stored, principal: other.stored.principal })).toThrow('A parte "principal" foi rodada com outras entradas: refaça a rodada.')
  })
})
