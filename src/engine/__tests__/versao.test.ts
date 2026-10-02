import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION } from '../index.ts'

describe('versão do motor', () => {
  it('segue o formato semver', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
