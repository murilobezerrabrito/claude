// A cópia do motor e de src/report nas funções do servidor (supabase/functions/_shared/aware) está igual à fonte.

import { describe, expect, it } from 'vitest'
import { staleFiles } from '../../../scripts/syncEngine.ts'

describe('cópia do motor nas funções do servidor', () => {
  it('está igual à fonte (senão, rode npm run sync:engine)', () => {
    expect(staleFiles()).toEqual([])
  })
})
