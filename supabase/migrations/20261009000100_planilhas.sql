-- AWARE Objective, Fase 2, etapa 3a: a planilha original de cada importação fica guardada numa pasta privada do
-- Storage (SPEC, "Stack técnica": Storage privado para planilhas; D-046). Só a gestão, com segundo fator, envia;
-- ninguém lê, troca nem apaga pelo navegador, porque a planilha traz várias famílias e a equipe interna só lê dados
-- de família pela API, com registro (D-041). Os arquivos ficam por data de referência: AAAA-MM-DD/...

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('planilhas', 'planilhas', false, 10485760,
        array['text/csv', 'text/plain', 'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create policy gestao_envia_planilhas on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'planilhas'
    and app.mfa_ok()
    and app.has_role('gestao')
    and (storage.foldername(name))[1] ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  );
