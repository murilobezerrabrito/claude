-- Relatório CADM: quatro olhos e imutável depois de aprovado (SPEC, "Regras do relatório" e "Segurança").
-- Os gatilhos valem para todos, inclusive para o dono do banco.
begin;
select plan(19);

\set U1 'a1000000-0000-4000-8000-000000000001'
\set U2 'a1000000-0000-4000-8000-000000000002'
\set H  'b1000000-0000-4000-8000-000000000001'
\set R  'd1000000-0000-4000-8000-000000000001'

insert into auth.users (id, instance_id, aud, role, email)
select u::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid'
  from unnest(array[:'U1', :'U2']) u;
insert into public.profiles (id, name, weights_pre) values ('teste', 'Perfil de teste', '{"POS": 1}') on conflict (id) do nothing;
insert into public.households (id, code, name, channel, profile_id, weights_source, fee_rate, seed)
values (:'H', 'T-R', 'Teste relatório', 'cadm', 'teste', 'perfil', 0.008, 1);

select throws_ok(format($$ insert into public.reports (household_id, ref_date, prepared_by, snapshot, status) values (%L, '2026-10-31', %L, '{}', 'aprovado') $$, :'H', :'U1'),
  'P0001', null, 'relatório novo não nasce aprovado');
insert into public.reports (id, household_id, ref_date, prepared_by, snapshot, comment)
values (:'R', :'H', '2026-10-31', :'U1', '{"chance": 0.62}', 'Comentário da gestão');

select throws_ok(format($$ update public.reports set status = 'aprovado', approved_by = %L, approved_at = now() where id = %L $$, :'U2', :'R'),
  'P0001', null, 'rascunho não pula a revisão');
select lives_ok(format($$ update public.reports set status = 'em_revisao' where id = %L $$, :'R'), 'rascunho vai para revisão');
select throws_ok(format($$ update public.reports set status = 'aprovado', approved_by = %L, approved_at = now() where id = %L $$, :'U1', :'R'),
  'P0001', 'Quem prepara o relatório não pode aprová-lo.', 'quem prepara não aprova (quatro olhos)');
select throws_ok(format($$ update public.reports set status = 'aprovado', approved_by = null, approved_at = now() where id = %L $$, :'R'),
  'P0001', null, 'aprovação exige aprovador');
select lives_ok(format($$ update public.reports set status = 'aprovado', approved_by = %L, approved_at = now() where id = %L $$, :'U2', :'R'),
  'outra pessoa aprova');

select throws_ok(format($$ update public.reports set snapshot = '{"chance": 0.9}' where id = %L $$, :'R'), 'P0001', null, 'números do relatório aprovado não mudam');
select throws_ok(format($$ update public.reports set comment = 'outro' where id = %L $$, :'R'), 'P0001', null, 'comentário do relatório aprovado não muda');
select throws_ok(format($$ update public.reports set scenarios = '[]' where id = %L $$, :'R'), 'P0001', null, 'cenários do relatório aprovado não mudam');
select throws_ok(format($$ update public.reports set approved_by = %L where id = %L $$, :'U1', :'R'), 'P0001', null, 'aprovador não muda');
select lives_ok(format($$ update public.reports set pdf_path = 'relatorios/t-r/2026-10-v1.pdf' where id = %L $$, :'R'), 'o PDF entra depois da aprovação');
select throws_ok(format($$ update public.reports set pdf_path = 'outro.pdf' where id = %L $$, :'R'), 'P0001', null, 'o PDF gravado não muda');
select lives_ok(format($$ update public.reports set status = 'apresentado', presented_at = now(), presented_how = 'reuniao' where id = %L $$, :'R'),
  'registro da apresentação');
select throws_ok(format($$ update public.reports set status = 'rascunho' where id = %L $$, :'R'), 'P0001', null, 'relatório apresentado não volta a rascunho');
select throws_ok(format($$ delete from public.reports where id = %L $$, :'R'), 'P0001', null, 'relatório não pode ser apagado');

select throws_ok(format($$ insert into public.reports (household_id, ref_date, version, prepared_by, snapshot) values (%L, '2026-10-31', 2, %L, '{}') $$, :'H', :'U1'),
  '23514', null, 'nova versão sem motivo é recusada');
select lives_ok(format($$ insert into public.reports (household_id, ref_date, version, prepared_by, snapshot, supersedes_id, reason) values (%L, '2026-10-31', 2, %L, '{}', %L, 'Correção do patrimônio') $$, :'H', :'U1', :'R'),
  'corrigir é criar nova versão com motivo');
select lives_ok(format($$ update public.reports set status = 'substituido' where id = %L $$, :'R'), 'a versão antiga fica substituída');
select throws_ok(format($$ update public.reports set presented_how = 'pdf' where id = %L $$, :'R'), 'P0001', null, 'relatório substituído não muda');

select * from finish();
rollback;
