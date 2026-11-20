-- AWARE Objective, Fase 2, etapa 4e: ajustes dos relatórios depois da revisão de código (D-070).
-- - O PDF é guardado só por quem aprovou (quatro olhos até o arquivo oficial), cada envio num arquivo próprio: dois
--   envios ao mesmo tempo não se sobrescrevem, e o anexado é o do hash gravado.
-- - A auditoria mascara os valores em reais para quem não pode vê-los, como as outras leituras.
-- - O descarte vai para a auditoria com nome próprio; a observação da devolução some no envio e não vai para o banker.
-- - O cenário confere os tipos antes das conversões; o resumo da versão diz quem aprovou.

create or replace function app.report_summary(r public.reports) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'household_id', r.household_id, 'ref_date', r.ref_date, 'version', r.version, 'status', r.status,
    'prepared_by', r.prepared_by, 'prepared_by_email', (select email from auth.users where id = r.prepared_by), 'approved_by', r.approved_by,
    'approved_by_email', (select email from auth.users where id = r.approved_by), 'approved_at', r.approved_at,
    'presented_at', r.presented_at, 'presented_how', r.presented_how, 'has_pdf', r.pdf_path is not null,
    'reason', r.reason, 'discard_reason', r.discard_reason, 'created_at', r.created_at)
$$;

create or replace function public.report_detail(p_report uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.reports;
  h public.households;
  v_amounts boolean := app.can_see_amounts();
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para ver o relatório.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  select * into r from public.reports where id = p_report;
  if not found or not app.can_read_report(r.household_id, r.status) then
    raise exception 'Relatório não encontrado.' using errcode = 'P0002', hint = 'relatorio_inexistente';
  end if;
  select * into h from public.households where id = r.household_id;
  perform app.audit('ler_relatorio', 'reports', r.id::text, r.household_id,
                    jsonb_build_object('mes', r.ref_date, 'versao', r.version, 'valores', v_amounts));
  return app.report_summary(r) || jsonb_build_object(
    'household', jsonb_build_object('id', h.id, 'code', h.code, 'name', h.name, 'manager_name', h.manager_name),
    'month_status', (select m.status from public.household_months m where m.household_id = r.household_id and m.ref_date = r.ref_date),
    'amounts_visible', v_amounts,
    'comment', case when v_amounts then r.comment end,
    'scenarios', case when v_amounts then coalesce(r.scenarios, '[]'::jsonb) end,
    'review_note', case when v_amounts and app.is_internal() then r.review_note end,
    'snapshot', case when v_amounts then r.snapshot end,
    'texts_current', app.report_texts_current(r.snapshot),
    'run_current', r.run_id is not distinct from (select s.run_id from public.monthly_snapshots s
                                                  where s.household_id = r.household_id and s.ref_date = r.ref_date),
    'versions', (select coalesce(jsonb_agg(app.report_summary(v) order by v.version), '[]'::jsonb) from public.reports v
                  where v.household_id = r.household_id and v.ref_date = r.ref_date and app.can_read_report(v.household_id, v.status)));
end
$$;

create or replace function public.submit_report(p_report uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare r public.reports := app.open_report(p_report, array['rascunho']::public.report_status[], true, 'enviar o relatório');
begin
  if r.comment is null then
    raise exception 'Escreva o comentário da gestão antes de enviar.' using errcode = 'P0001', hint = 'sem_comentario';
  end if;
  update public.reports set status = 'em_revisao', review_note = null where id = r.id;
  perform app.audit('enviar_relatorio', 'reports', r.id::text, r.household_id, jsonb_build_object('mes', r.ref_date, 'versao', r.version));
  return jsonb_build_object('id', r.id, 'status', 'em_revisao');
end
$$;

create or replace function public.discard_report(p_report uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.reports := app.open_report(p_report, array['rascunho', 'em_revisao']::public.report_status[], false, 'descartar o relatório');
  v text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v is null or length(v) < 3 or length(v) > 500 then
    raise exception 'Diga o motivo do descarte (de 3 a 500 caracteres).' using errcode = '22023', hint = 'sem_motivo';
  end if;
  update public.reports set status = 'descartado', discard_reason = v where id = r.id;
  perform app.audit('descartar_relatorio', 'reports', r.id::text, r.household_id,
                    jsonb_build_object('mes', r.ref_date, 'versao', r.version, 'motivo', v));
  return jsonb_build_object('id', r.id, 'status', 'descartado');
end
$$;

create or replace function public.record_report_scenario(p_report uuid, p_actor uuid, p_scenario jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.reports;
  v_seed bigint;
begin
  perform app.act_as(p_actor, 'o relatório');
  select * into r from public.reports where id = p_report for update;
  if not found then
    raise exception 'Relatório não encontrado.' using errcode = 'P0002', hint = 'relatorio_inexistente';
  end if;
  if r.status <> 'rascunho' or r.prepared_by <> p_actor then
    raise exception 'Os cenários mudam só no rascunho, por quem prepara.' using errcode = 'P0001', hint = 'relatorio_status';
  end if;
  if jsonb_array_length(coalesce(r.scenarios, '[]'::jsonb)) >= 3 then
    raise exception 'O relatório já tem três cenários: tire um antes.' using errcode = 'P0001', hint = 'cenarios_cheios';
  end if;
  select seed into v_seed from public.households where id = r.household_id;
  -- Os tipos antes das conversões: o Postgres não garante a ordem de avaliação do "or".
  if jsonb_typeof(p_scenario) is distinct from 'object'
     or coalesce(p_scenario ->> 'id', '') !~ '^[0-9a-f-]{36}$' or length(coalesce(p_scenario ->> 'name', '')) not between 1 and 200
     or jsonb_typeof(p_scenario -> 'params') is distinct from 'object'
     or jsonb_typeof(p_scenario -> 'probability') is distinct from 'number'
     or jsonb_typeof(p_scenario -> 'requiredReturn') not in ('number', 'null')
     or coalesce(p_scenario ->> 'requiredReturnStatus', '') not in ('ok', 'folga_total', 'inviavel')
     or coalesce(p_scenario ->> 'inputsHash', '') = ''
     or coalesce(p_scenario ->> 'seed', '') !~ '^[0-9]{1,18}$'
     or coalesce(p_scenario ->> 'paths', '') !~ '^[0-9]{1,9}$' then
    raise exception 'Cenário inválido.' using errcode = '22023', hint = 'cenario_invalido';
  end if;
  if (p_scenario ->> 'probability')::numeric not between 0 and 1
     or (p_scenario ->> 'seed')::bigint is distinct from v_seed
     or (p_scenario ->> 'paths')::integer < 1000 then
    raise exception 'Cenário inválido.' using errcode = '22023', hint = 'cenario_invalido';
  end if;
  -- O nome sai das hipóteses: mesmo nome é o mesmo cenário.
  if exists (select 1 from jsonb_array_elements(coalesce(r.scenarios, '[]'::jsonb)) s where s ->> 'name' = p_scenario ->> 'name') then
    raise exception 'Esse cenário já está no relatório.' using errcode = 'P0001', hint = 'cenario_repetido';
  end if;
  update public.reports set scenarios = coalesce(scenarios, '[]'::jsonb) || jsonb_build_array(p_scenario) where id = r.id;
  return jsonb_build_object('id', r.id, 'scenario', p_scenario ->> 'id');
end
$$;

create or replace function public.report_pdf_target(p_report uuid, p_actor uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare r public.reports;
begin
  perform app.act_as(p_actor, 'o PDF do relatório');
  select * into r from public.reports where id = p_report;
  if not found then
    raise exception 'Relatório não encontrado.' using errcode = 'P0002', hint = 'relatorio_inexistente';
  end if;
  if r.status not in ('aprovado', 'apresentado') then
    raise exception 'Só relatório aprovado recebe o PDF.' using errcode = 'P0001', hint = 'relatorio_status';
  end if;
  if r.pdf_path is not null then
    raise exception 'O PDF deste relatório já está guardado.' using errcode = 'P0001', hint = 'pdf_guardado';
  end if;
  if r.approved_by is distinct from p_actor then
    raise exception 'Só quem aprovou guarda o PDF do relatório.' using errcode = '42501', hint = 'so_quem_aprova';
  end if;
  -- Um arquivo por envio: dois envios ao mesmo tempo não se sobrescrevem, e só o anexado vale.
  return jsonb_build_object('path', format('%s/%s/v%s-%s.pdf', r.household_id, r.ref_date, r.version, gen_random_uuid()));
end
$$;

-- Anexa o PDF guardado por quem aprovou: confere o caminho do envio, o arquivo na pasta e o tamanho, e grava o hash.
drop function public.attach_report_pdf(uuid, uuid, text, integer);
create function public.attach_report_pdf(p_report uuid, p_actor uuid, p_path text, p_sha256 text, p_size integer)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.reports;
  v_path text;
begin
  perform app.act_as(p_actor, 'o PDF do relatório');
  select * into r from public.reports where id = p_report for update;
  if not found then
    raise exception 'Relatório não encontrado.' using errcode = 'P0002', hint = 'relatorio_inexistente';
  end if;
  if r.status not in ('aprovado', 'apresentado') then
    raise exception 'Só relatório aprovado recebe o PDF.' using errcode = 'P0001', hint = 'relatorio_status';
  end if;
  if r.pdf_path is not null then
    raise exception 'O PDF deste relatório já está guardado.' using errcode = 'P0001', hint = 'pdf_guardado';
  end if;
  if r.approved_by is distinct from p_actor then
    raise exception 'Só quem aprovou guarda o PDF do relatório.' using errcode = '42501', hint = 'so_quem_aprova';
  end if;
  v_path := p_path;
  if v_path is null or v_path !~ ('^' || r.household_id || '/' || r.ref_date || '/v' || r.version || '-[0-9a-f-]{36}\.pdf$') then
    raise exception 'Caminho do PDF inválido.' using errcode = '22023', hint = 'pdf_invalido';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_size is null or p_size <= 0 then
    raise exception 'Hash ou tamanho do PDF inválido.' using errcode = '22023', hint = 'pdf_invalido';
  end if;
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'relatorios' and o.name = v_path and (o.metadata ->> 'size')::bigint = p_size) then
    raise exception 'O PDF não está guardado como esperado.' using errcode = 'P0001', hint = 'pdf_ausente';
  end if;
  update public.reports set pdf_path = v_path, pdf_sha256 = p_sha256, pdf_size = p_size where id = r.id;
  perform app.audit('guardar_pdf_do_relatorio', 'reports', r.id::text, r.household_id,
                    jsonb_build_object('mes', r.ref_date, 'versao', r.version, 'sha256', p_sha256, 'bytes', p_size));
  return jsonb_build_object('id', r.id, 'path', v_path);
end
$$;

create or replace function public.audit_trail(p_from date, p_to date, p_household uuid default null, p_action text default null,
                                   p_limit integer default 200)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para ver a auditoria.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  if not (app.has_role('compliance') or app.has_role('comite')) then
    raise exception 'Sem permissão para ver a auditoria.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    raise exception 'Escolha um período de até um ano.' using errcode = '22023', hint = 'periodo_invalido';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Peça de 1 a 500 registros.' using errcode = '22023', hint = 'limite_invalido';
  end if;
  perform app.audit('ler_auditoria', 'audit_log', null, p_household,
                    jsonb_build_object('de', p_from, 'ate', p_to, 'acao', p_action));
  return jsonb_build_object(
    'rows', (select coalesce(jsonb_agg(x.row order by x.at desc, x.id desc), '[]'::jsonb) from (
       select a.at, a.id, jsonb_build_object(
         'id', a.id, 'at', a.at, 'actor_email', u.email, 'action', a.action, 'target_table', a.target_table,
         'target_id', a.target_id, 'household_code', h.code, 'household_name', h.name,
         'details', case when app.can_see_amounts() then v.details else app.mask_amounts(v.details) end) as row
         from public.audit_log a
         left join auth.users u on u.id = a.actor_id
         left join public.households h on h.id = a.household_id
         cross join lateral (select case when a.target_table = 'reports' then a.details - 'snapshot' else a.details end as details) v
        where (a.at at time zone 'America/Sao_Paulo')::date between p_from and p_to
          and (p_household is null or a.household_id = p_household)
          and (p_action is null or a.action = p_action)
        order by a.at desc, a.id desc
        limit p_limit) x),
    'actions', (select coalesce(jsonb_agg(distinct a.action order by a.action), '[]'::jsonb) from public.audit_log a
                 where (a.at at time zone 'America/Sao_Paulo')::date between p_from and p_to));
end
$$;

revoke all on function public.attach_report_pdf(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.attach_report_pdf(uuid, uuid, text, text, integer) to service_role;
