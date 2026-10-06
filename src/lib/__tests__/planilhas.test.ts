import { describe, expect, it } from 'vitest'
import { decodeText, readCsv, readSheetFile, SheetReadError } from '../planilhas.ts'

describe('leitura de CSV', () => {
  it('detecta o separador pelo cabeçalho: ponto e vírgula, com vírgula decimal', () => {
    expect(readCsv('a;b;c\n1,5;"x;y";3\n').rows).toEqual([['a', 'b', 'c'], ['1,5', 'x;y', '3']])
  })

  it('vírgula como separador, aspas com vírgula dentro e sem quebra no fim', () => {
    expect(readCsv('a,b\n"Fundo, classe A",2').rows).toEqual([['a', 'b'], ['Fundo, classe A', '2']])
  })

  it('mantém as linhas em branco do meio (o número da linha não muda) e tira as do fim', () => {
    expect(readCsv('a,b\r\n1,2\r\n\r\n3,4\r\n\r\n').rows).toEqual([['a', 'b'], ['1', '2'], [''], ['3', '4']])
  })

  it('UTF-8 com marca de ordem de bytes e Windows-1252 do Excel em português', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41, 0xc3, 0xa7]))).toBe('Aç')
    expect(decodeText(new Uint8Array([0x41, 0xe7, 0xf5, 0x65, 0x73]))).toBe('Açõe' + 's')
  })

  it('aspas sem fechar e formato desconhecido dão erro claro', () => {
    expect(() => readCsv('a,b\n"x,1\n')).toThrow(SheetReadError)
    expect(() => readSheetFile('extrato.pdf', new Uint8Array())).toThrow('Formato não aceito: .pdf. Use CSV.')
    expect(() => readSheetFile('posicoes.XLSX', new Uint8Array())).toThrow('A leitura de XLSX ainda não está disponível')
  })
})
