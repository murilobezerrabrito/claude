// Prévia do relatório de exemplo, dentro do console (SPEC, "Fluxo do mês", passo 7): o PDF gerado no navegador a partir dos
// números congelados, o botão "Baixar PDF" e o modo apresentação, que mostra o próprio PDF em tela cheia, sem menus.
// O navegador não roda o motor: os números vêm do snapshot.

import snapshotData from '../../data/relatorios/andrade-2026-10.json'
import { formatDate, formatMonthLabel } from '../../lib/format.ts'
import type { ReportSnapshot } from '../../report/snapshot.ts'
import { PageTitle } from '../Shell.tsx'
import { Alert } from '../ui/alert.tsx'
import { Button } from '../ui/button.tsx'
import { usePresentation, useReportPdf } from './browserPdf.ts'
import { PresentationStage } from './PresentationStage.tsx'

const snapshot = snapshotData as unknown as ReportSnapshot
const fileName = `relatorio-${snapshot.family.id}-${snapshot.refMonth}.pdf`

export function ReportPreview() {
  const { url, error } = useReportPdf(snapshot)
  const presentation = usePresentation()

  return (
    <>
      <PageTitle title="Relatório de exemplo">
        <div className="flex gap-2">
          <Button asChild variant="outline" className={url ? '' : 'pointer-events-none opacity-50'}>
            <a href={url ?? undefined} download={fileName} aria-disabled={!url}>
              Baixar PDF
            </a>
          </Button>
          <Button onClick={presentation.enter} disabled={!url}>
            Modo apresentação
          </Button>
        </div>
      </PageTitle>
      <p className="-mt-4 mb-4 text-sm text-muted-foreground">
        {snapshot.family.name}, com dados fictícios · {formatMonthLabel(snapshot.refMonth)} · posições de {formatDate(snapshot.refDate)} · premissas{' '}
        {snapshot.run.cmaVersion}
      </p>
      {error ? <Alert tone="error">Não foi possível gerar o PDF: {error}</Alert> : null}
      {!url && !error ? <p className="text-muted-foreground">Gerando o PDF…</p> : null}
      {url ? (
        <iframe className="h-[78vh] w-full rounded-lg border bg-card" src={`${url}#view=FitH`} title={`Prévia do relatório de ${formatMonthLabel(snapshot.refMonth)}`} />
      ) : null}
      <PresentationStage presentation={presentation} url={url} />
    </>
  )
}
