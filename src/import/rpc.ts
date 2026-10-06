// Linhas validadas no formato das funções do banco (import_preview e set_official_pl): as colunas da planilha, a
// linha do arquivo e os números como texto decimal, sem expoente, com as casas que o banco guarda.

import type { FlowRow, OfficialPlRow, PositionRow } from './types.ts'

/** Número em texto decimal com até `decimals` casas, sem zeros sobrando (1e-8 vira "0.00000001"). */
export function decimalText(value: number, decimals: number): string {
  const text = value.toFixed(decimals)
  return decimals > 0 ? text.replace(/\.?0+$/, '') : text
}

export function positionsToRpc(rows: PositionRow[]) {
  return rows.map((r) => ({
    linha: r.line,
    data_referencia: r.refDate,
    codigo_cliente: r.clientCode,
    custodiante: r.custodian,
    codigo_ativo: r.assetCode,
    isin: r.isin ?? null,
    cnpj: r.cnpj ?? null,
    nome_ativo: r.assetName,
    quantidade: decimalText(r.quantity, 8),
    preco_unitario: decimalText(r.unitPrice, 8),
    valor_bruto: decimalText(r.grossValue, 2),
    valor_liquido: decimalText(r.netValue, 2),
    moeda: r.currency,
  }))
}

export function flowsToRpc(rows: FlowRow[]) {
  return rows.map((r) => ({
    linha: r.line,
    data_referencia: r.refDate,
    codigo_cliente: r.clientCode,
    custodiante: r.custodian,
    data_movimento: r.date ?? null,
    tipo: r.kind,
    valor: decimalText(r.amount, 2),
    moeda: r.currency,
    descricao: r.description ?? null,
  }))
}

export function officialPlToRpc(rows: OfficialPlRow[]) {
  return rows.map((r) => ({ linha: r.line, data_referencia: r.refDate, codigo_cliente: r.clientCode, pl_oficial: decimalText(r.officialPl, 2) }))
}
