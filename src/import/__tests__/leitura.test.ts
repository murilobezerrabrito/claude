import { describe, expect, it } from 'vitest'
import { readCsv } from '../../lib/planilhas.ts'
import { MAX_ERRORS, readFlows, readOfficialPl, readPositions } from '../read.ts'
import type { ReadResult } from '../types.ts'
import { decimalText, flowsToRpc, officialPlToRpc, positionsToRpc } from '../rpc.ts'
import { parseDecimal, toBrl } from '../values.ts'
import { exampleSheet, FLOWS_HEADER, POSITIONS_HEADER, positionLine, sheetOf } from './helpers.ts'

function errorsOf<T>(r: ReadResult<T>) {
  if (r.ok) throw new Error('esperava erro')
  return r.errors
}

function rowsOf<T>(r: ReadResult<T>) {
  if (!r.ok) throw new Error(`esperava sucesso: ${r.errors.map((e) => `${e.line}: ${e.message}`).join(' | ')}`)
  return r.rows
}

describe('arquivos de exemplo fictícios', () => {
  it('lê as posições de setembro: 19 linhas de 3 famílias, sem avisos', () => {
    const r = readPositions(exampleSheet('exemplo-posicoes-2026-09.csv'))
    expect(r.ok && r.refDate).toBe('2026-09-30')
    const rows = rowsOf(r)
    expect(rows).toHaveLength(19)
    expect(new Set(rows.map((p) => p.clientCode))).toEqual(new Set(['AND001', 'BAR001', 'COS001']))
    expect(r.warnings).toEqual([])
    const mm = rows.find((p) => p.assetCode === 'FUNDO-MM-Y')
    expect(mm).toMatchObject({ line: 9, cnpj: '00000000000100', quantity: 184333.21, unitPrice: 6.56419969, netValue: 1_200_000, currency: 'BRL' })
    expect(rows.find((p) => p.assetCode === 'FII-LOG-Q')?.isin).toBe('BRFLOGCTF001')
  })

  it('lê os movimentos e o PL oficial de outubro', () => {
    const flows = rowsOf(readFlows(exampleSheet('exemplo-movimentos-2026-10.csv')))
    expect(flows).toEqual([
      { line: 2, refDate: '2026-10-31', clientCode: 'AND001', custodian: 'Custodiante A', date: '2026-10-15', kind: 'resgate', amount: 300_000, currency: 'BRL', description: 'Resgate para reforma' },
      { line: 3, refDate: '2026-10-31', clientCode: 'BAR001', custodian: 'Corretora X', date: '2026-10-05', kind: 'aporte', amount: 50_000, currency: 'BRL', description: 'Aporte mensal' },
      { line: 4, refDate: '2026-10-31', clientCode: 'COS001', custodian: 'Custodiante B', kind: 'resgate', amount: 40_000, currency: 'BRL', description: 'Retirada sem data no extrato' },
    ])
    const pl = rowsOf(readOfficialPl(exampleSheet('exemplo-pl-2026-10.csv')))
    expect(pl.map((p) => [p.clientCode, p.officialPl])).toEqual([['AND001', 11_450_961.29], ['BAR001', 1_533_000], ['COS001', 5_942_500]])
  })
})

describe('posições: regras do SPEC', () => {
  it('cabeçalho sem uma coluna obrigatória recusa o arquivo na linha 1', () => {
    const header = POSITIONS_HEADER.replace(',moeda', '')
    const errors = errorsOf(readPositions(sheetOf(header, positionLine())))
    expect(errors).toEqual([{ line: 1, message: 'Faltam colunas no cabeçalho: moeda.' }])
  })

  it('aceita cabeçalho com acentos, maiúsculas e espaços, e avisa das colunas a mais', () => {
    const header = POSITIONS_HEADER.replace('data_referencia', ' Data_Referência ') + ',observacao'
    const r = readPositions(sheetOf(header, positionLine() + ',qualquer'))
    expect(rowsOf(r)).toHaveLength(1)
    expect(r.warnings).toEqual([{ line: 1, message: 'Colunas ignoradas: observacao.' }])
  })

  it('data fora do formato, data de referência fora do fim do mês e duas datas no arquivo', () => {
    const errors = errorsOf(readPositions(sheetOf(
      POSITIONS_HEADER,
      positionLine({ data_referencia: '30/09/2026' }),
      positionLine({ data_referencia: '2026-09-29', codigo_ativo: 'B' }),
      positionLine({ data_referencia: '2026-10-31', codigo_ativo: 'C' }),
    )))
    expect(errors).toEqual([
      { line: 2, message: 'data_referencia: "30/09/2026" não é uma data no formato AAAA-MM-DD.' },
      { line: 3, message: 'data_referencia: 2026-09-29 precisa ser o último dia do mês.' },
      { message: 'O arquivo tem mais de uma data de referência (2026-09-29, 2026-10-31): importe um mês por vez.' },
    ])
  })

  it('vírgula decimal é aceita; separador de milhar, valor negativo e texto são recusados', () => {
    const semicolon = positionLine().split(',').map((c, i) => (i === 8 ? '4380,55' : i === 10 ? '512020,5' : c)).join(';')
    const ok = rowsOf(readPositions(readCsv(`${POSITIONS_HEADER.replaceAll(',', ';')}\n${semicolon}\n`)))
    expect(ok[0]).toMatchObject({ unitPrice: 4380.55, netValue: 512_020.5 })
    const errors = errorsOf(readPositions(sheetOf(
      POSITIONS_HEADER,
      positionLine({ valor_liquido: '12a' }),
      positionLine({ codigo_ativo: 'B', valor_liquido: '-10' }),
      positionLine({ codigo_ativo: 'C', quantidade: 'cem' }),
    )))
    expect(errors.map((e) => [e.line, e.message])).toEqual([
      [2, 'valor_liquido: "12a" não é um número (use 1234.56 ou 1234,56).'],
      [3, 'valor_liquido: valor negativo.'],
      [4, 'quantidade: "cem" não é um número (use 1234.56 ou 1234,56).'],
    ])
    const thousands = errorsOf(readPositions({ rows: [POSITIONS_HEADER.split(','), positionLine().split(',').map((c, i) => (i === 10 ? '1.234.567,89' : c))] }))
    expect(thousands[0].message).toBe('valor_liquido: "1.234.567,89" tem separador de milhar; use só o separador decimal (ex.: 1234.56 ou 1234,56).')
  })

  it('moeda fora da v1, campo obrigatório vazio, ISIN inválido e CNPJ alfanumérico', () => {
    const errors = errorsOf(readPositions(sheetOf(
      POSITIONS_HEADER,
      positionLine({ moeda: 'EUR' }),
      positionLine({ codigo_ativo: 'B', nome_ativo: '' }),
      positionLine({ codigo_ativo: 'C', isin: 'BR123' }),
      positionLine({ codigo_ativo: 'D', cnpj: '12.ABC.345/01DE-35' }),
    )))
    expect(errors.map((e) => [e.line, e.message])).toEqual([
      [2, 'moeda: moeda "EUR" não aceita na v1: use BRL ou USD.'],
      [3, 'nome_ativo: obrigatório.'],
      [4, 'isin: ISIN "BR123" inválido (12 caracteres, ex.: BRSTNCNTB4U6).'],
    ])
    const rows = rowsOf(readPositions(sheetOf(POSITIONS_HEADER, positionLine({ cnpj: '12.ABC.345/01DE-35', moeda: 'usd', codigo_cliente: ' and001 ' }))))
    expect(rows[0]).toMatchObject({ cnpj: '12ABC34501DE35', currency: 'USD', clientCode: 'AND001' })
  })

  it('o mesmo ativo duas vezes no mesmo custodiante da família é erro; em outro custodiante, não', () => {
    const errors = errorsOf(readPositions(sheetOf(POSITIONS_HEADER, positionLine(), positionLine({ custodiante: 'custodiante a' }))))
    expect(errors).toEqual([{ line: 3, message: 'O ativo NTNB-2035 aparece de novo para AND001 em custodiante a (primeira vez na linha 2).' }])
    expect(rowsOf(readPositions(sheetOf(POSITIONS_HEADER, positionLine(), positionLine({ custodiante: 'Custodiante B' }))))).toHaveLength(2)
  })

  it('linhas em branco são puladas sem mudar o número das linhas', () => {
    const errors = errorsOf(readPositions(readCsv(`${POSITIONS_HEADER}\n${positionLine()}\n\n,,,\n${positionLine({ codigo_ativo: 'B', moeda: 'X' })}\n`)))
    expect(errors[0].line).toBe(5)
  })

  it('linha com mais colunas que o cabeçalho (vírgula decimal sem aspas) é recusada com explicação', () => {
    const errors = errorsOf(readPositions(readCsv(`${POSITIONS_HEADER}\n${positionLine({ valor_liquido: '512020,50' })}\n`)))
    expect(errors).toEqual([{ line: 2, message: 'A linha tem mais colunas que o cabeçalho. Num CSV separado por vírgula, número com vírgula decimal precisa de aspas (ou use ponto e vírgula como separador).' }])
  })

  it('dinheiro com exatamente 3 casas é ambíguo; quantidade com 3 casas, não', () => {
    const errors = errorsOf(readPositions(sheetOf(POSITIONS_HEADER, positionLine({ valor_liquido: '1.500', quantidade: '1.500' }))))
    expect(errors).toEqual([{ line: 2, message: 'valor_liquido: "1.500" é ambíguo (milhar ou casas decimais?); escreva sem separador de milhar e com até 2 casas (ex.: 1500 ou 1500,00).' }])
    expect(rowsOf(readPositions(sheetOf(POSITIONS_HEADER, positionLine({ valor_liquido: '1.5', quantidade: '1.500' }))))[0]).toMatchObject({ netValue: 1.5, quantity: 1.5 })
    expect(rowsOf(readPositions({ rows: [POSITIONS_HEADER.split(','), positionLine().split(',').map((v, i) => (i === 10 ? 1.5 : v))] }))[0].netValue).toBe(1.5)
  })

  it('o mesmo ativo em moedas diferentes no arquivo é erro', () => {
    const errors = errorsOf(readPositions(sheetOf(POSITIONS_HEADER, positionLine({ moeda: 'USD' }), positionLine({ codigo_cliente: 'COS001', moeda: 'BRL' }))))
    expect(errors).toEqual([{ line: 3, message: 'O ativo NTNB-2035 veio em BRL aqui e em USD na linha 2: o mesmo ativo tem uma moeda só.' }])
  })

  it('coluna desconhecida repetida só é ignorada; coluna esperada repetida é erro', () => {
    const r = readPositions(sheetOf(`${POSITIONS_HEADER},obs,obs`, `${positionLine()},a,b`))
    expect(rowsOf(r)).toHaveLength(1)
    expect(r.warnings).toEqual([{ line: 1, message: 'Colunas ignoradas: obs.' }])
    expect(errorsOf(readPositions(sheetOf(`${POSITIONS_HEADER},moeda`, `${positionLine()},BRL`)))[0].message).toBe('A coluna "moeda" aparece mais de uma vez no cabeçalho.')
  })

  it('arquivo vazio ou só com cabeçalho é recusado', () => {
    expect(errorsOf(readPositions({ rows: [] }))[0].message).toBe('O arquivo está vazio: falta o cabeçalho com os nomes das colunas.')
    expect(errorsOf(readPositions(sheetOf(POSITIONS_HEADER)))[0].message).toBe('O arquivo não tem nenhuma linha de dados.')
  })

  it('números de XLSX entram como números; a lista de erros é cortada em 100', () => {
    const header = POSITIONS_HEADER.split(',')
    const numeric = positionLine().split(',').map((c, i) => (i >= 7 && i <= 10 ? Number(c) : c))
    numeric[10] = 1.005
    expect(rowsOf(readPositions({ rows: [header, numeric] }))[0].netValue).toBe(1.01)
    const bad = Array.from({ length: 150 }, (_, i) => positionLine({ codigo_ativo: `A${i}`, moeda: 'X' }))
    const errors = errorsOf(readPositions(sheetOf(POSITIONS_HEADER, ...bad)))
    expect(errors).toHaveLength(MAX_ERRORS + 1)
    expect(errors[MAX_ERRORS].message).toBe('E mais 50 erros.')
  })
})

describe('aportes e resgates', () => {
  const line = (over: Partial<Record<string, string>> = {}) => {
    const base: Record<string, string> = {
      data_referencia: '2026-10-31', codigo_cliente: 'AND001', custodiante: 'Custodiante A', data_movimento: '2026-10-15',
      tipo: 'resgate', valor: '300000.00', moeda: 'BRL', descricao: '',
    }
    return FLOWS_HEADER.split(',').map((col) => over[col] ?? base[col]).join(',')
  }

  it('tipo sem diferenciar maiúsculas; sem data e sem descrição ficam de fora do registro', () => {
    const rows = rowsOf(readFlows(sheetOf(FLOWS_HEADER, line({ tipo: 'Aporte', data_movimento: '' }))))
    expect(rows).toEqual([{ line: 2, refDate: '2026-10-31', clientCode: 'AND001', custodian: 'Custodiante A', kind: 'aporte', amount: 300_000, currency: 'BRL' }])
  })

  it('data fora do mês, tipo desconhecido e valor zero são erros', () => {
    const errors = errorsOf(readFlows(sheetOf(
      FLOWS_HEADER,
      line({ data_movimento: '2026-09-30' }),
      line({ tipo: 'transferencia' }),
      line({ valor: '0' }),
    )))
    expect(errors.map((e) => [e.line, e.message])).toEqual([
      [2, 'data_movimento: 2026-09-30 fora do mês da data de referência (2026-10).'],
      [3, 'tipo: "transferencia" não é aporte nem resgate.'],
      [4, 'valor: o valor precisa ser maior que zero.'],
    ])
  })
})

describe('PL oficial', () => {
  it('uma linha por família; valor positivo', () => {
    const header = 'data_referencia,codigo_cliente,pl_oficial'
    const errors = errorsOf(readOfficialPl(sheetOf(header, '2026-09-30,AND001,12000000', '2026-09-30,and001,1', '2026-09-30,COS001,0')))
    expect(errors.map((e) => [e.line, e.message])).toEqual([
      [3, 'AND001 aparece de novo (primeira vez na linha 2).'],
      [4, 'pl_oficial: o valor precisa ser maior que zero.'],
    ])
  })
})

describe('números e conversão de moeda', () => {
  it('arredonda pela representação decimal, meio para cima', () => {
    const v = (text: string, d = 2) => {
      const r = parseDecimal(text, d)
      return r.ok ? r.value : r.message
    }
    expect([v('0.125'), v('2.675'), v('1234,5'), v('-0.004'), v('10'), v('1.23456789012', 8)]).toEqual([0.13, 2.68, 1234.5, 0, 10, 1.23456789])
  })

  it('converte para reais ao centavo, como round(valor * cotação, 2) no banco', () => {
    expect(toBrl(192_000, 5)).toBe(960_000)
    expect(toBrl(180_000, 5.04)).toBe(907_200)
    expect(toBrl(0.01, 0.5)).toBe(0.01)
    expect(toBrl(33.33, 5.0412)).toBe(168.02)
    expect(toBrl(1_234_567.89, 5.4321)).toBe(6_706_296.24)
    expect(() => toBrl(1, 0)).toThrow(RangeError)
  })
})

describe('linhas para o banco', () => {
  it('números como texto decimal, sem expoente, e campos opcionais nulos', () => {
    expect([decimalText(1e-8, 8), decimalText(1830000, 2), decimalText(6.56419969, 8), decimalText(0, 2)]).toEqual(['0.00000001', '1830000', '6.56419969', '0'])
    const [p] = rowsOf(readPositions(exampleSheet('exemplo-posicoes-2026-09.csv')))
    expect(positionsToRpc([p])[0]).toEqual({
      linha: 2, data_referencia: '2026-09-30', codigo_cliente: 'AND001', custodiante: 'Custodiante A', codigo_ativo: 'CDB-BANCOX-2028',
      isin: null, cnpj: null, nome_ativo: 'CDB Banco X 2028', quantidade: '1', preco_unitario: '1830000', valor_bruto: '1830000',
      valor_liquido: '1800000', moeda: 'BRL',
    })
    const flows = rowsOf(readFlows(exampleSheet('exemplo-movimentos-2026-10.csv')))
    expect(flowsToRpc(flows)[2]).toMatchObject({ data_movimento: null, tipo: 'resgate', valor: '40000' })
    expect(officialPlToRpc(rowsOf(readOfficialPl(exampleSheet('exemplo-pl-2026-10.csv'))))[0]).toEqual({
      linha: 2, data_referencia: '2026-10-31', codigo_cliente: 'AND001', pl_oficial: '11450961.29',
    })
  })
})
