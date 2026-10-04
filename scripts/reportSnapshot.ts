// npm run report:snapshot: grava os números congelados do relatório de exemplo (Família Andrade, out/2026).
// O teste snapshot.test.ts recalcula e compara com o arquivo, para pegar qualquer desvio quando o motor mudar.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { buildReportSnapshot } from '../src/report/snapshot.ts'
import { andradeReportArgs, EXAMPLE_SNAPSHOT_PATH } from './reportExample.ts'

const start = performance.now()
const snapshot = buildReportSnapshot(andradeReportArgs())
const file = fileURLToPath(new URL(`../${EXAMPLE_SNAPSHOT_PATH}`, import.meta.url))
mkdirSync(dirname(file), { recursive: true })
writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`)
const s = snapshot.summary
console.log(`${EXAMPLE_SNAPSHOT_PATH} gravado em ${((performance.now() - start) / 1000).toFixed(1)} s`)
console.log(`Chance: ${(s.probability * 100).toFixed(1)}% (antes ${s.previousProbability === null ? '—' : (s.previousProbability * 100).toFixed(1) + '%'})`)
console.log(snapshot.texts.bridge)
if (snapshot.texts.benchmark) console.log(snapshot.texts.benchmark)
console.log(snapshot.texts.reading)
