// Palco do modo apresentação: o PDF em tela cheia, sem barra de ferramentas, e o botão de saída, discreto.

import type { ReactNode } from 'react'
import type { usePresentation } from './browserPdf.ts'

export function PresentationStage(props: {
  presentation: ReturnType<typeof usePresentation>
  url: string | null
  /** Enquanto o PDF não chega (ou se ele falhar). */
  placeholder?: ReactNode
}) {
  const { presenting, stage, leave } = props.presentation
  return (
    <div ref={stage} className={presenting ? 'fixed inset-0 z-50 bg-black' : 'hidden'} aria-hidden={!presenting}>
      {presenting && props.url ? (
        <iframe className="size-full border-0" src={`${props.url}#toolbar=0&navpanes=0&view=Fit`} title="Relatório em modo apresentação" />
      ) : null}
      {presenting && !props.url ? <div className="flex size-full items-center justify-center text-white/80">{props.placeholder ?? 'Carregando o PDF…'}</div> : null}
      {presenting ? (
        <button
          className="absolute top-3 right-3 rounded-md bg-black/55 px-3 py-1.5 text-white opacity-40 transition-opacity hover:opacity-100 focus-visible:opacity-100"
          type="button"
          onClick={leave}
        >
          Sair (Esc)
        </button>
      ) : null}
    </div>
  )
}
