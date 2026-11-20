// Web Worker do "E se?" (SPEC, "Stack técnica": o motor roda num Web Worker no navegador): guarda o mês e os mercados
// sorteados entre um cenário e outro.

import { createWhatIf, type WhatIf } from './whatIf.ts'
import type { WhatIfRequest, WhatIfResponse } from './whatIfMessages.ts'

let whatIf: WhatIf | null = null
const reply = (r: WhatIfResponse) => (self as unknown as { postMessage(m: WhatIfResponse): void }).postMessage(r)

self.onmessage = (e: MessageEvent<WhatIfRequest>) => {
  const msg = e.data
  try {
    if (msg.type === 'init') {
      whatIf = createWhatIf(msg.pkg, msg.ipca)
      reply({ id: msg.id, ok: true, result: null })
      return
    }
    if (!whatIf) throw new Error('O mês ainda não foi carregado.')
    reply({ id: msg.id, ok: true, result: msg.type === 'run' ? whatIf.run(msg.params) : whatIf.sustainable(msg.params) })
  } catch (err) {
    reply({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
