// Prévia local do relatório de exemplo (SPEC, "Fluxo do mês", passo 7): o PDF gerado no navegador a partir dos
// números congelados, o botão "Baixar PDF" e o modo apresentação, que mostra o próprio PDF em tela cheia, sem menus.
// O navegador não roda o motor: os números vêm do snapshot.

import fraunces400 from '@fontsource/fraunces/files/fraunces-latin-400-normal.woff?url'
import fraunces600 from '@fontsource/fraunces/files/fraunces-latin-600-normal.woff?url'
import plex400italic from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-italic.woff?url'
import plex400 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff?url'
import plex500 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff?url'
import plex600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff?url'
import { pdf } from '@react-pdf/renderer'
import { useEffect, useRef, useState } from 'react'
import snapshotData from '../../data/relatorios/andrade-2026-10.json'
import { formatDate, formatMonthLabel } from '../../lib/format.ts'
import type { ReportSnapshot } from '../../report/snapshot.ts'
import { ReportDocument } from './ReportDocument.tsx'
import { registerReportFonts } from './theme.ts'

const snapshot = snapshotData as unknown as ReportSnapshot
const fileName = `relatorio-${snapshot.family.id}-${snapshot.refMonth}.pdf`

export function ReportPreview() {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [presenting, setPresenting] = useState(false)
  const stage = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let created: string | null = null
    registerReportFonts({ fraunces400, fraunces600, plex400, plex400italic, plex500, plex600 })
    pdf(<ReportDocument snapshot={snapshot} />)
      .toBlob()
      .then((blob) => {
        if (cancelled) return
        created = URL.createObjectURL(blob)
        setUrl(created)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [])

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setPresenting(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const present = () => {
    setPresenting(true)
    // Tela cheia precisa sair do próprio clique; sem ela, o modo apresentação ocupa a janela inteira.
    stage.current?.requestFullscreen?.().catch(() => undefined)
  }
  const leave = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    setPresenting(false)
  }

  return (
    <main className="preview">
      <header className="preview-header">
        <div>
          <p className="eyebrow">AWARE Objective · relatório de exemplo, com dados fictícios</p>
          <h1>{snapshot.family.name}</h1>
          <p className="meta">
            {formatMonthLabel(snapshot.refMonth)} · posições de {formatDate(snapshot.refDate)} · premissas {snapshot.run.cmaVersion}
          </p>
        </div>
        <div className="actions">
          <a className={`button${url ? '' : ' disabled'}`} href={url ?? undefined} download={fileName} aria-disabled={!url}>
            Baixar PDF
          </a>
          <button className="button primary" type="button" onClick={present} disabled={!url}>
            Modo apresentação
          </button>
        </div>
      </header>
      {error ? <p className="error">Não foi possível gerar o PDF: {error}</p> : null}
      {!url && !error ? <p className="loading">Gerando o PDF…</p> : null}
      {url ? <iframe className="pdf" src={`${url}#view=FitH`} title={`Prévia do relatório de ${formatMonthLabel(snapshot.refMonth)}`} /> : null}
      <div ref={stage} className={`stage${presenting ? ' on' : ''}`} aria-hidden={!presenting}>
        {presenting && url ? <iframe className="stage-pdf" src={`${url}#toolbar=0&navpanes=0&view=Fit`} title="Relatório em modo apresentação" /> : null}
        {presenting ? (
          <button className="leave" type="button" onClick={leave}>
            Sair (Esc)
          </button>
        ) : null}
      </div>
    </main>
  )
}
