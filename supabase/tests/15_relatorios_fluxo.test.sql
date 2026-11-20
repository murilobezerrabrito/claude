-- Relatórios no banco (etapa 4; SPEC, "Fluxo do mês", passos 4 a 8): rascunho pela função do servidor a partir da
-- rodada publicada; revisão com o comentário e os cenários de quem prepara; aprovação por outra pessoa da gestão, com a
-- família fechada e os textos legais do rascunho em vigor; PDF uma vez; apresentação; leitura por papel; descarte; nova
-- versão; textos legais da compliance; trilha de auditoria; gestor responsável no cadastro.
begin;
select plan(96);

\set G1 'ac000000-0000-4000-8000-000000000001'
\set G2 'ac000000-0000-4000-8000-000000000002'
\set GN 'ac000000-0000-4000-8000-000000000003'
\set P  'ac000000-0000-4000-8000-000000000004'
\set C  'ac000000-0000-4000-8000-000000000005'
\set B  'ac000000-0000-4000-8000-000000000006'
\set B2 'ac000000-0000-4000-8000-000000000007'
\set H  'bc000000-0000-4000-8000-000000000001'
\set H2 'bc000000-0000-4000-8000-000000000002'
\set HA 'bc000000-0000-4000-8000-000000000003'
\set S1 'cc000000-0000-4000-8000-000000000001'
\set S2 'cc000000-0000-4000-8000-000000000002'
\set S3 'cc000000-0000-4000-8000-000000000003'
\set S4 'cc000000-0000-4000-8000-000000000004'

create function pg_temp.entrar(p_user uuid, p_aal text default 'aal2') returns text language sql as $$
  select set_config('request.jwt.claim.sub', p_user::text, true);
  select set_config('request.jwt.claim.role', 'authenticated', true);
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true)
$$;
create function pg_temp.servidor() returns text language sql as $$
  select set_config('request.jwt.claim.sub', '', true);
  select set_config('request.jwt.claim.role', 'service_role', true);
  select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true)
$$;
-- Snapshot mínimo de um rascunho, com as versões aprovadas hoje dos textos legais do relatório.
create function pg_temp.snap(p_household uuid, p_month text, p_hash text) returns jsonb language sql as $$
  select jsonb_build_object('schema', 2, 'refMonth', p_month, 'family', jsonb_build_object('id', p_household),
    'run', jsonb_build_object('inputsHash', p_hash), 'comment', jsonb_build_object('text', '', 'example', false), 'scenarios', '[]'::jsonb,
    'texts', jsonb_build_object('legal', (select jsonb_object_agg(key, version) from public.legal_texts
                                           where status = 'aprovado' and key in ('rodape_relatorio', 'nota_ponte', 'primeiro_relatorio', 'aviso_completo'))))
$$;
-- Cenário rodado pela função do servidor (resultado fictício).
create function pg_temp.cenario(p_id uuid) returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'name', 'Cenário ' || p_id::text, 'params', '{"spendingMultiplier": 1.1}'::jsonb,
    'probability', 0.7, 'requiredReturn', 0.035, 'requiredReturnStatus', 'ok', 'inputsHash', 'hash-cenario', 'seed', 11, 'paths', 10000,
    'computeMs', 900)
$$;

insert into auth.users (id, instance_id, aud, role, email)
select u::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid'
  from unnest(array[:'G1', :'G2', :'GN', :'P', :'C', :'B', :'B2']) u;
insert into public.user_roles (user_id, household_id, role, can_see_amounts) values
  (:'G1', null, 'gestao', true), (:'G2', null, 'gestao', true), (:'GN', null, 'gestao', false), (:'P', null, 'compliance', true),
  (:'C', null, 'comite', true), (:'B', null, 'banker', true), (:'B2', null, 'banker', true);
insert into public.profiles (id, name, weights_pre) values ('teste', 'Perfil de teste', '{"POS": 1}') on conflict (id) do nothing;
insert into public.households (id, code, name, channel, banker_id, manager_name, profile_id, weights_source, fee_rate, seed) values
  (:'H', 'T-REL', 'Teste relatório', 'cadm', :'B', 'Gestora Teste', 'teste', 'perfil', 0.008, 11),
  (:'H2', 'T-REL2', 'Teste relatório sem gestor', 'cadm', :'B2', null, 'teste', 'perfil', 0.008, 12),
  (:'HA', 'T-RELA', 'Teste relatório AI', 'ai', null, null, 'teste', 'carteira_atual', 0.008, 13);
insert into public.plan_versions (household_id, version, snapshot, base_month) values (:'H', 1, '{"people": []}', '2026-08-01');
insert into public.household_months (household_id, ref_date, official_pl, status) values (:'H', '2026-09-30', 1000000, 'importado');
update public.household_months set status = 'conferido' where household_id = :'H';
select (now() at time zone 'America/Sao_Paulo')::date as hoje \gset

-- Setembro rodado (rodada publicada; primeiro mês acompanhado).
set local role service_role;
select pg_temp.servidor();
select public.record_official_run(:'H', '2026-09-30', :'G1', '{"pkg": {"closing": {"refDate": "2026-09-30"}}}',
  jsonb_build_object('refDate', '2026-09-30', 'inputsHash', 'hash-set', 'seed', 11, 'engineVersion', 't', 'paths', 10000,
                     'probability', 0.8, 'requiredReturn', 0.03, 'slack', 0.01, 'wealth', 1000000),
  jsonb_build_object('cma_version_id', (select id from public.cma_versions where status = 'vigente'),
                     'plan_version_id', (select id from public.plan_versions where household_id = :'H'),
                     'realized_return_real', null, 'attribution', '{"kind": "primeiro_mes"}'::jsonb)) ->> 'run_id' as run_id \gset
reset role;
select id as rodape_v1 from public.legal_texts where key = 'rodape_relatorio' and status = 'rascunho' \gset
select id as nota_v1 from public.legal_texts where key = 'nota_ponte' and status = 'rascunho' \gset
select id as primeiro_v1 from public.legal_texts where key = 'primeiro_relatorio' and status = 'rascunho' \gset
select id as aviso_v1 from public.legal_texts where key = 'aviso_completo' and status = 'rascunho' \gset
select body as aviso_corpo from public.legal_texts where key = 'aviso_completo' and status = 'rascunho' \gset

-- Textos legais ---------------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G1');
select is((select count(*)::integer from jsonb_array_elements(public.legal_texts_overview())), 6, 'a equipe interna vê os seis textos legais');
select throws_ok($$ select public.save_legal_text('nota_ponte', 'Nota da ponte escrita pela gestão.') $$, '42501', null,
  'a gestão não escreve textos legais');
select pg_temp.entrar(:'B');
select throws_ok($$ select public.legal_texts_overview() $$, '42501', null, 'o banker não vê os textos legais');
reset role;

set local role service_role;
select pg_temp.servidor();
select throws_ok(format($$ select public.report_inputs(%L, '2026-09-30', %L) $$, :'H', :'G1'), 'P0001',
  'A compliance ainda não aprovou todos os textos legais do relatório.', 'sem os textos legais aprovados, não há rascunho');
reset role;

set local role authenticated;
select pg_temp.entrar(:'P');
select throws_ok($$ select public.save_legal_text('rodape_relatorio', 'Rodapé sem os campos do mês e da versão.') $$, '22023', null,
  'o rodapé do relatório precisa dos campos [mês] e [versão]');
select is(public.approve_legal_text(:'rodape_v1') ->> 'status', 'aprovado', 'a compliance aprova o texto');
select public.approve_legal_text(:'nota_v1');
select public.approve_legal_text(:'primeiro_v1');
select public.approve_legal_text(:'aviso_v1');
select throws_ok(format($$ select public.save_legal_text('aviso_completo', %L) $$, :'aviso_corpo'), '22023', null,
  'texto igual ao aprovado não vira versão nova');
select public.save_legal_text('nota_ponte', 'A variação foi separada trocando um fator de cada vez, com os mesmos cenários.') as nota2 \gset
select is(:'nota2'::jsonb ->> 'version', '2', 'texto novo vira a versão 2, em rascunho');
select throws_ok(format($$ select public.discard_legal_text(%L) $$, :'rodape_v1'), 'P0001', null, 'texto aprovado não é descartado');
reset role;

-- Rascunho (função do servidor) -------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G1');
select throws_ok(format($$ select public.report_inputs(%L, '2026-09-30', %L) $$, :'H', :'G1'), '42501', null,
  'o navegador não lê as entradas do relatório');
select throws_ok(format($$ select public.record_report_draft(%L, '2026-09-30', %L, %L, '{}', null) $$, :'H', :'G1', :'run_id'), '42501', null,
  'nem grava o rascunho');
reset role;

set local role service_role;
select pg_temp.servidor();
select throws_ok(format($$ select public.report_inputs(%L, '2026-09-30', %L) $$, :'H', :'B'), '42501', null, 'só em nome de alguém da gestão');
select throws_ok(format($$ select public.report_inputs(%L, '2026-09-30', %L) $$, :'HA', :'G1'), 'P0001',
  'Relatório mensal só para família CADM.', 'só família CADM');
select throws_ok(format($$ select public.report_inputs(%L, '2026-09-30', %L) $$, :'H2', :'G1'), 'P0001',
  'Informe o gestor responsável no cadastro da família.', 'sem gestor responsável, não há rascunho');
select throws_ok(format($$ select public.report_inputs(%L, '2026-10-31', %L) $$, :'H', :'G1'), 'P0001', null, 'sem o mês rodado, não há rascunho');
select public.report_inputs(:'H', '2026-09-30', :'G1') as entradas \gset
select is(jsonb_array_length(:'entradas'::jsonb -> 'months'), 1, 'o primeiro mês acompanhado, com a rodada publicada');
select is(:'entradas'::jsonb #>> '{months,0,run,inputsHash}', 'hash-set', 'a rodada do mês, como foi gravada');
select is(:'entradas'::jsonb #>> '{legal,rodape_relatorio,version}', '1', 'os textos legais aprovados, com a versão');
select is((select count(*)::integer from jsonb_object_keys(:'entradas'::jsonb -> 'cdi')), 21, 'o CDI de setembro (21 dias úteis)');
select is(:'entradas'::jsonb ->> 'manager', 'Gestora Teste', 'e o gestor responsável');
reset role;
select ok(exists (select 1 from public.audit_log where action = 'ler_entradas_do_relatorio' and actor_id = :'G1' and household_id = :'H'),
  'a leitura das entradas vai para a auditoria em nome de quem pediu');
select pg_temp.snap(:'H', '2026-09', 'hash-set') as snap_set \gset
select pg_temp.snap(:'H', '2026-08', 'hash-set') as snap_ago \gset

set local role service_role;
select pg_temp.servidor();
select throws_ok(format($$ select public.record_report_draft(%L, '2026-09-30', %L, %L, %L, null) $$, :'H', :'G1', :'run_id', :'snap_ago'), '22023', null,
  'rascunho de outro mês é recusado');
select throws_ok(format($$ select public.record_report_draft(%L, '2026-09-30', %L, gen_random_uuid(), %L, null) $$, :'H', :'G1', :'snap_set'), 'P0001',
  null, 'rodada que não é a publicada é recusada');
select public.record_report_draft(:'H', '2026-09-30', :'G1', :'run_id', :'snap_set', null) as v1 \gset
select is(:'v1'::jsonb ->> 'version', '1', 'a gestão grava o rascunho da versão 1');
select throws_ok(format($$ select public.report_inputs(%L, '2026-09-30', %L) $$, :'H', :'G2'), 'P0001',
  'Já há uma versão aberta deste relatório: envie, aprove ou descarte antes.', 'uma versão aberta por família e mês');
reset role;
select :'v1'::jsonb ->> 'id' as r1 \gset
select is((select prepared_by from public.reports where id = :'r1'), :'G1'::uuid, 'quem pediu o rascunho é quem prepara');

-- Revisão -----------------------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G2');
select throws_ok(format($$ select public.save_report_comment(%L, 'Comentário de outra pessoa.') $$, :'r1'), '42501', null,
  'só quem prepara escreve o comentário');
select pg_temp.entrar(:'G1');
select throws_ok(format($$ select public.submit_report(%L) $$, :'r1'), 'P0001', 'Escreva o comentário da gestão antes de enviar.',
  'sem comentário, não envia');
select throws_ok(format($$ select public.save_report_comment(%L, %L) $$, :'r1', repeat('a', 1201)), '22023', null, 'comentário de até 1.200 caracteres');
select lives_ok(format($$ select public.save_report_comment(%L, 'Comentário do teste.') $$, :'r1'), 'quem prepara escreve o comentário');
reset role;

set local role service_role;
select pg_temp.servidor();
select throws_ok(format($$ select public.report_scenario_inputs(%L, %L) $$, :'r1', :'G2'), '42501', null, 'só quem prepara escolhe os cenários');
select ok(public.report_scenario_inputs(:'r1', :'G1') ? 'pkg', 'as entradas do cenário trazem o pacote do mês da rodada');
select lives_ok(format($$ select public.record_report_scenario(%L, %L, %L) $$, :'r1', :'G1', pg_temp.cenario(:'S1')), 'grava um cenário');
select throws_ok(format($$ select public.record_report_scenario(%L, %L, %L) $$, :'r1', :'G1', pg_temp.cenario(:'S2') || '{"seed": 99}'::jsonb),
  '22023', null, 'cenário com outra semente é recusado');
select throws_ok(format($$ select public.record_report_scenario(%L, %L, %L) $$, :'r1', :'G1',
  pg_temp.cenario(:'S2') || jsonb_build_object('name', pg_temp.cenario(:'S1') ->> 'name')), 'P0001',
  'Esse cenário já está no relatório.', 'o mesmo cenário não entra duas vezes');
select public.record_report_scenario(:'r1', :'G1', pg_temp.cenario(:'S2'));
select public.record_report_scenario(:'r1', :'G1', pg_temp.cenario(:'S3'));
select throws_ok(format($$ select public.record_report_scenario(%L, %L, %L) $$, :'r1', :'G1', pg_temp.cenario(:'S4')), 'P0001',
  'O relatório já tem três cenários: tire um antes.', 'até três cenários');
reset role;

set local role authenticated;
select pg_temp.entrar(:'G1');
select is(jsonb_array_length(public.remove_report_scenario(:'r1', :'S3') -> 'scenarios'), 2, 'quem prepara tira um cenário');
select lives_ok(format($$ select public.submit_report(%L) $$, :'r1'), 'quem prepara envia para a aprovação');
select throws_ok(format($$ select public.save_report_comment(%L, 'Mudança depois de enviar.') $$, :'r1'), 'P0001', null,
  'em revisão, o comentário não muda');
select pg_temp.entrar(:'G2');
select throws_ok(format($$ select public.return_report(%L, '') $$, :'r1'), '22023', null, 'quem devolve diz o que mudar');
select lives_ok(format($$ select public.return_report(%L, 'Revise o comentário.') $$, :'r1'), 'outra pessoa da gestão devolve com observação');
select pg_temp.entrar(:'G1');
select is(public.report_detail(:'r1') ->> 'review_note', 'Revise o comentário.', 'quem prepara vê a observação');
select public.submit_report(:'r1');
select is(public.report_detail(:'r1') ->> 'review_note', null, 'no envio, a observação da devolução sai (não volta depois)');
select throws_ok(format($$ select public.approve_report(%L) $$, :'r1'), '42501', null, 'quem prepara não aprova (quatro olhos)');
select pg_temp.entrar(:'G2');
select throws_ok(format($$ select public.approve_report(%L) $$, :'r1'), 'P0001',
  'Feche o mês da família antes de aprovar: só família fechada alimenta o relatório.', 'só aprova com a família fechada no mês');
reset role;
update public.household_months set status = 'fechado' where household_id = :'H' and ref_date = '2026-09-30';

-- Texto legal novo no meio do caminho: o rascunho não é aprovado; descarta e prepara outra versão.
set local role authenticated;
select pg_temp.entrar(:'P');
select public.approve_legal_text((:'nota2'::jsonb ->> 'id')::uuid);
select pg_temp.entrar(:'G2');
select throws_ok(format($$ select public.approve_report(%L) $$, :'r1'), 'P0001',
  'Os textos legais mudaram depois do rascunho: descarte e prepare uma nova versão.', 'texto legal novo pede rascunho novo');
select throws_ok(format($$ select public.discard_report(%L, '') $$, :'r1'), '22023', null, 'descartar pede o motivo');
select lives_ok(format($$ select public.discard_report(%L, 'Texto legal novo da nota da ponte.') $$, :'r1'), 'a gestão descarta, com motivo');
reset role;
select throws_ok(format($$ update public.reports set comment = 'outro' where id = %L $$, :'r1'), 'P0001', null, 'versão descartada não muda');
select ok(exists (select 1 from public.audit_log where action = 'descartar_relatorio' and target_id = :'r1'
                   and details ->> 'motivo' = 'Texto legal novo da nota da ponte.'), 'o descarte vai para a auditoria, com o motivo');
select is((select status::text from public.legal_texts where id = :'nota_v1'), 'arquivado', 'a versão anterior do texto fica arquivada');
select pg_temp.snap(:'H', '2026-09', 'hash-set') as snap_set2 \gset

set local role service_role;
select pg_temp.servidor();
select throws_ok(format($$ select public.record_report_draft(%L, '2026-09-30', %L, %L, %L, null) $$, :'H', :'G2', :'run_id', :'snap_set2'), '22023',
  'Diga o motivo da nova versão (de 3 a 500 caracteres).', 'nova versão pede motivo');
select public.record_report_draft(:'H', '2026-09-30', :'G2', :'run_id', :'snap_set2', 'Rascunho com a nota da ponte nova.') as v2 \gset
select is(:'v2'::jsonb ->> 'version', '2', 'a versão 2 vem depois da descartada');
select public.record_report_scenario((:'v2'::jsonb ->> 'id')::uuid, :'G2', pg_temp.cenario(:'S1'));
reset role;
select :'v2'::jsonb ->> 'id' as r2 \gset
select is((select supersedes_id from public.reports where id = :'r2'), :'r1'::uuid, 'e aponta para a versão que substitui');

-- Aprovação ---------------------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G2');
select public.save_report_comment(:'r2', 'Comentário da versão 2.');
select public.submit_report(:'r2');
select pg_temp.entrar(:'G1');
select is(public.approve_report(:'r2') ->> 'status', 'aprovado', 'outra pessoa da gestão aprova, com a família fechada');
reset role;
select is((select snapshot #>> '{comment,text}' from public.reports where id = :'r2'), 'Comentário da versão 2.', 'o comentário entra no snapshot');
select is((select snapshot #>> '{scenarios,0,name}' from public.reports where id = :'r2'), 'Cenário ' || :'S1', 'e os cenários também');
select is((select snapshot #>> '{scenarios,0,probability}' from public.reports where id = :'r2'), '0.7', 'com o resultado de cada um');
select is((select approved_by from public.reports where id = :'r2'), :'G1'::uuid, 'com quem aprovou');
select ok(exists (select 1 from public.audit_log where action = 'aprovar_relatorio' and actor_id = :'G1' and household_id = :'H'),
  'a aprovação vai para a auditoria');

set local role authenticated;
select pg_temp.entrar(:'G2');
select throws_ok(format($$ select public.save_report_comment(%L, 'Depois de aprovado.') $$, :'r2'), 'P0001', null, 'aprovado, nada muda');
select throws_ok(format($$ select public.present_report(%L, 'reuniao', %L) $$, :'r2', :'hoje'), 'P0001',
  'Guarde o PDF antes de registrar a apresentação.', 'a apresentação pede o PDF guardado');
reset role;

-- PDF (função do servidor) ------------------------------------------------------------------------------------------

set local role service_role;
select pg_temp.servidor();
select throws_ok(format($$ select public.report_pdf_target(%L, %L) $$, :'r2', :'G2'), '42501',
  'Só quem aprovou guarda o PDF do relatório.', 'quem preparou não guarda o PDF (quatro olhos até o arquivo)');
select public.report_pdf_target(:'r2', :'G1') ->> 'path' as pdf_path \gset
select ok(:'pdf_path' ~ ('^' || :'H' || '/2026-09-30/v2-[0-9a-f-]{36}\.pdf$'), 'o PDF vai para a pasta da família, do mês e da versão, um arquivo por envio');
select throws_ok(format($$ select public.attach_report_pdf(%L, %L, %L, %L, 1234) $$, :'r2', :'G1', :'pdf_path', repeat('a', 64)), 'P0001',
  'O PDF não está guardado como esperado.', 'sem o arquivo na pasta, não anexa');
reset role;
insert into storage.objects (bucket_id, name, metadata) values ('relatorios', :'pdf_path', '{"size": 1234, "mimetype": "application/pdf"}');
set local role service_role;
select pg_temp.servidor();
select throws_ok(format($$ select public.attach_report_pdf(%L, %L, %L, %L, 1234) $$, :'r2', :'G1', :'H' || '/2026-09-30/v2.pdf', repeat('a', 64)),
  '22023', null, 'caminho fora do envio, não anexa');
select throws_ok(format($$ select public.attach_report_pdf(%L, %L, %L, %L, 1234) $$, :'r2', :'G2', :'pdf_path', repeat('a', 64)), '42501', null,
  'quem preparou não anexa');
select throws_ok(format($$ select public.attach_report_pdf(%L, %L, %L, %L, 999) $$, :'r2', :'G1', :'pdf_path', repeat('a', 64)), 'P0001', null,
  'com outro tamanho, não anexa');
select lives_ok(format($$ select public.attach_report_pdf(%L, %L, %L, %L, 1234) $$, :'r2', :'G1', :'pdf_path', repeat('a', 64)), 'anexa o PDF guardado, com o hash');
select throws_ok(format($$ select public.attach_report_pdf(%L, %L, %L, %L, 1234) $$, :'r2', :'G1', :'pdf_path', repeat('b', 64)), 'P0001', null,
  'o PDF é anexado uma vez');
reset role;

-- Apresentação e download -----------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G2');
select throws_ok(format($$ select public.present_report(%L, 'reuniao', '2026-01-01') $$, :'r2'), '22023', null, 'data antes da aprovação é recusada');
select lives_ok(format($$ select public.present_report(%L, 'reuniao', %L) $$, :'r2', :'hoje'), 'registro da apresentação');
select throws_ok(format($$ select public.present_report(%L, 'pdf', %L) $$, :'r2', :'hoje'), 'P0001', null, 'a apresentação é registrada uma vez');
select is(public.report_pdf_access(:'r2') ->> 'file_name', 'relatorio-t-rel-2026-09-v2.pdf', 'o download diz o nome do arquivo');
reset role;
select ok(exists (select 1 from public.audit_log where action = 'baixar_relatorio' and actor_id = :'G2' and household_id = :'H'),
  'o download vai para a auditoria');

-- Leitura por papel -------------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'B');
select is(public.report_detail(:'r2') ->> 'status', 'apresentado', 'o banker vê o relatório aprovado da sua família');
select throws_ok(format($$ select public.report_detail(%L) $$, :'r1'), 'P0002', null, 'mas não a versão descartada');
select is((select count(*)::integer from jsonb_array_elements(public.report_months('2026-09-30') -> 'families')), 1,
  'na lista do mês, só as famílias do banker');
select pg_temp.entrar(:'B2');
select throws_ok(format($$ select public.report_detail(%L) $$, :'r2'), 'P0002', null, 'outro banker não vê');
select pg_temp.entrar(:'P');
select is(public.report_detail(:'r1') ->> 'status', 'descartado', 'a compliance vê todas as versões');
select pg_temp.entrar(:'GN');
select is(public.report_detail(:'r2') -> 'snapshot', 'null'::jsonb, 'sem permissão para valores, sem o conteúdo');
select throws_ok(format($$ select public.report_pdf_access(%L) $$, :'r2'), '42501', null, 'nem o PDF');
select pg_temp.entrar(:'G1');
select is((select f -> 'latest' ->> 'version' from jsonb_array_elements(public.report_months('2026-09-30') -> 'families') f where f ->> 'code' = 'T-REL'),
  '2', 'a lista do mês mostra a última versão');
reset role;
insert into auth.users (id, instance_id, aud, role, email)
values ('ac000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@teste.invalid');
insert into public.user_roles (user_id, household_id, role) values ('ac000000-0000-4000-8000-000000000008', :'HA', 'cliente_ai');
set local role authenticated;
select pg_temp.entrar('ac000000-0000-4000-8000-000000000008');
select throws_ok($$ select public.report_months('2026-09-30') $$, '42501', null, 'o cliente AI não lê relatórios');
reset role;

-- Correção depois de aprovado: nova versão com motivo; aprovada, a anterior fica substituída.
set local role service_role;
select pg_temp.servidor();
select public.record_report_draft(:'H', '2026-09-30', :'G1', :'run_id', :'snap_set2', 'Correção do comentário.') ->> 'id' as r3 \gset
reset role;
set local role authenticated;
select pg_temp.entrar(:'G1');
select public.save_report_comment(:'r3', 'Comentário corrigido.');
select public.submit_report(:'r3');
select pg_temp.entrar(:'G2');
select public.approve_report(:'r3');
reset role;
select is((select status::text from public.reports where id = :'r2'), 'substituido', 'aprovada a correção, a versão anterior fica substituída');

-- Mês que volta para a conferência descarta o rascunho -----------------------------------------------------------------

insert into public.household_months (household_id, ref_date, official_pl, status) values (:'H', '2026-10-31', 1010000, 'importado');
update public.household_months set status = 'conferido' where household_id = :'H' and ref_date = '2026-10-31';
set local role service_role;
select pg_temp.servidor();
select public.record_official_run(:'H', '2026-10-31', :'G1', '{"pkg": {"closing": {"refDate": "2026-10-31"}}}',
  jsonb_build_object('refDate', '2026-10-31', 'inputsHash', 'hash-out', 'seed', 11, 'engineVersion', 't', 'paths', 10000,
                     'probability', 0.75, 'requiredReturn', 0.032, 'slack', 0.008, 'wealth', 1010000),
  jsonb_build_object('cma_version_id', (select id from public.cma_versions where status = 'vigente'),
                     'plan_version_id', (select id from public.plan_versions where household_id = :'H'),
                     'realized_return_real', 0.001, 'attribution', '{"kind": "ponte"}'::jsonb)) ->> 'run_id' as run_out \gset
reset role;
select pg_temp.snap(:'H', '2026-10', 'hash-out') as snap_out \gset
set local role service_role;
select pg_temp.servidor();
select public.record_report_draft(:'H', '2026-10-31', :'G1', :'run_out', :'snap_out', null) ->> 'id' as r_out \gset
reset role;
update public.household_months set status = 'importado' where household_id = :'H' and ref_date = '2026-10-31';
select is((select status::text || ': ' || discard_reason from public.reports where id = :'r_out'),
  'descartado: O mês voltou para a conferência: os números do rascunho ficaram para trás.', 'o mês que volta para a conferência descarta o rascunho');

-- Trilha de auditoria -------------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G1');
select throws_ok(format($$ select public.audit_trail(%L::date - 1, %L::date) $$, :'hoje', :'hoje'), '42501', null, 'a gestão não lê a trilha');
select pg_temp.entrar(:'P');
select throws_ok($$ select public.audit_trail('2025-01-01', '2026-11-30') $$, '22023', null, 'período de até um ano');
select ok((select bool_or(x ->> 'action' = 'aprovar_relatorio')
             from jsonb_array_elements(public.audit_trail(:'hoje'::date - 1, :'hoje'::date + 1, :'H') -> 'rows') x),
  'a compliance vê a aprovação na trilha');
select ok((select coalesce(bool_and(not ((x -> 'details') ? 'snapshot')), true)
             from jsonb_array_elements(public.audit_trail(:'hoje'::date - 1, :'hoje'::date + 1, :'H') -> 'rows') x
            where x ->> 'target_table' = 'reports'), 'sem o snapshot dos relatórios');
select ok((select bool_or((x -> 'details') ? 'official_pl')
             from jsonb_array_elements(public.audit_trail(:'hoje'::date - 1, :'hoje'::date + 1, :'H') -> 'rows') x),
  'quem vê valores vê os valores dos registros');
select pg_temp.entrar(:'C');
select ok(jsonb_array_length(public.audit_trail(:'hoje'::date, :'hoje'::date, null, 'baixar_relatorio') -> 'rows') >= 1, 'o comitê também, com filtro por ação');
reset role;
update public.user_roles set can_see_amounts = false where user_id = :'C';
set local role authenticated;
select pg_temp.entrar(:'C');
select ok((select coalesce(bool_and(not ((x -> 'details') ? 'official_pl')), true)
             from jsonb_array_elements(public.audit_trail(:'hoje'::date - 1, :'hoje'::date + 1, :'H') -> 'rows') x),
  'sem permissão para valores, a trilha vem sem os valores');
reset role;
update public.user_roles set can_see_amounts = true where user_id = :'C';

-- Gestor responsável no cadastro ------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G1');
select is(public.save_household(:'HA', jsonb_build_object('code', 'T-RELA', 'name', 'Teste relatório AI', 'channel', 'ai', 'profile_id', 'teste',
                                                            'fee_rate', 0.008, 'horizon_age', 95, 'manager_name', 'Alguém')) #>> '{errors,0,path}',
  'manager_name', 'gestor responsável só na CADM');
select is(public.save_household(:'H2', jsonb_build_object('code', 'T-REL2', 'name', 'Teste relatório sem gestor', 'channel', 'cadm',
                                                           'profile_id', 'teste', 'fee_rate', 0.008, 'horizon_age', 95, 'banker_id', :'B2',
                                                           'manager_name', 'Gestor Novo')) ->> 'ok', 'true', 'a gestão informa o gestor responsável');
reset role;
select is((select manager_name from public.households where id = :'H2'), 'Gestor Novo', 'gravado no cadastro');

select * from finish();
rollback;
