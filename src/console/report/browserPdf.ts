// PDF do relatório no navegador, a partir dos números congelados (o navegador não roda o motor): as fontes do pacote
// @fontsource (URLs do Vite) e o mesmo documento do Node. A prévia, o PDF guardado na aprovação e o relatório de
// exemplo usam este caminho. O modo apresentação (PresentationStage.tsx) mostra um PDF em tela cheia, sem menus.

import fraunces400 from '@fontsource/fraunces/files/fraunces-latin-400-normal.woff?url'
import fraunces600 from '@fontsource/fraunces/files/fraunces-latin-600-normal.woff?url'
import plex400italic from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-italic.woff?url'
import plex400 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff?url'
import plex500 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff?url'
import plex600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff?url'
import { pdf } from '@react-pdf/renderer'
import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import type { ReportSnapshot } from '../../report/snapshot.ts'
import { ReportDocument } from './ReportDocument.tsx'
import { registerReportFonts } from './theme.ts'

/** O PDF do relatório, gerado no navegador. */
export async function reportPdfBlob(snapshot: ReportSnapshot): Promise<Blob> {
  registerReportFonts({ fraunces400, fraunces600, plex400, plex400italic, plex500, plex600 })
  return pdf(createElement(ReportDocument, { snapshot }) as Parameters<typeof pdf>[0]).toBlob()
}

/**
 * O PDF do snapshot como endereço local (blob:), refeito quando o snapshot muda; o anterior é liberado. Enquanto o
 * novo não fica pronto, `url` é nulo.
 */
export function useReportPdf(snapshot: ReportSnapshot | null): { url: string | null; error: string | null } {
  const [done, setDone] = useState<{ for: ReportSnapshot; url: string | null; error: string | null } | null>(null)
  useEffect(() => {
    if (!snapshot) return
    let cancelled = false
    let created: string | null = null
    reportPdfBlob(snapshot)
      .then((blob) => {
        if (cancelled) return
        created = URL.createObjectURL(blob)
        setDone({ for: snapshot, url: created, error: null })
      })
      .catch((e: unknown) => {
        if (!cancelled) setDone({ for: snapshot, url: null, error: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [snapshot])
  return done && done.for === snapshot ? { url: done.url, error: done.error } : { url: null, error: null }
}

/**
 * Modo apresentação: ocupa a tela inteira (tela cheia, quando o navegador deixa) e sai pelo Esc ou pelo botão.
 * `enter` precisa ser chamado no próprio clique, para o navegador aceitar a tela cheia.
 */
export function usePresentation() {
  const [presenting, setPresenting] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setPresenting(false)
    }
    // Sem tela cheia (navegador sem a API ou pedido recusado), o Esc também fecha o modo apresentação.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setPresenting(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
  const enter = useCallback(() => {
    setPresenting(true)
    stage.current?.requestFullscreen?.().catch(() => undefined)
  }, [])
  const leave = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    setPresenting(false)
  }, [])
  return { presenting, stage, enter, leave }
}
