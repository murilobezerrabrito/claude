-- AWARE Objective, Fase 2, etapa 4: status "descartado" do relatório (D-070). Uma versão em rascunho ou em revisão é
-- descartada quando o mês da família volta para a conferência ou quando a gestão descarta com motivo; ela fica guardada
-- e não muda mais. Num arquivo próprio: o valor novo do tipo só pode ser usado depois que esta transação termina.

alter type public.report_status add value 'descartado';
