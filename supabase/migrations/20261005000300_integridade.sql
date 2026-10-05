-- AWARE Objective, Fase 2, etapa 1: regras que nem a gestão nem o servidor podem contornar.
-- - Relatório aprovado é imutável: só mudam o status (apresentado, substituído) e os campos de apresentação; o PDF
--   entra uma vez depois da aprovação; apagar é negado. Quem prepara não aprova (quatro olhos).
-- - Trilha de auditoria só de inserção: update, delete e truncate negados para todos.
-- - Toda escrita nas tabelas de família, de papéis e de referência vai para a auditoria (quem, quando, o quê).
-- - Premissas aprovadas não mudam: as classes e as correlações de uma versão fora de rascunho ficam travadas; o fluxo
--   é rascunho → aprovada → vigente → arquivada, com uma só versão vigente.
-- - Textos legais aprovados não mudam: mudança de texto é uma nova versão, aprovada pela compliance.
-- - Quem aprova (relatório, premissas, texto) precisa ter o papel certo e, numa sessão de usuário, ser o próprio usuário.

-- O usuário tem o papel (para conferir aprovadores e quem prepara).
create function app.user_has_role(p_user uuid, r public.app_role) returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.user_roles ur where ur.user_id = p_user and ur.role = r) $$;

-- Confere quem aprova: tem o papel e, numa sessão de usuário (auth.uid() presente), é o próprio usuário logado.
create function app.check_approver(p_approver uuid, r public.app_role, p_what text) returns void
language plpgsql stable
set search_path = ''
as $$
begin
  if p_approver is null then
    raise exception 'Aprovação sem aprovador.' using errcode = 'P0001', hint = 'aprovador';
  end if;
  if auth.uid() is not null and p_approver <> auth.uid() then
    raise exception 'Só o próprio usuário logado aprova %.', p_what using errcode = 'P0001', hint = 'aprovador';
  end if;
  if not app.user_has_role(p_approver, r) then
    raise exception 'Quem aprova % precisa ter o papel %.', p_what, r using errcode = 'P0001', hint = 'aprovador';
  end if;
end
$$;

-- Relatórios -------------------------------------------------------------------------------------------------------

create function app.guard_report() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  frozen constant public.report_status[] := array['aprovado', 'apresentado', 'substituido']::public.report_status[];
begin
  if tg_op = 'DELETE' then
    raise exception 'Relatório não pode ser apagado; corrigir é criar uma nova versão com motivo.'
      using errcode = 'P0001', hint = 'relatorio_imutavel';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'rascunho' or new.approved_by is not null or new.approved_at is not null then
      raise exception 'Relatório novo começa como rascunho, sem aprovação.' using errcode = 'P0001', hint = 'relatorio_status';
    end if;
    if auth.uid() is not null and new.prepared_by <> auth.uid() then
      raise exception 'Quem prepara o relatório é o próprio usuário logado.' using errcode = 'P0001', hint = 'quatro_olhos';
    end if;
    if not app.user_has_role(new.prepared_by, 'gestao') then
      raise exception 'Quem prepara o relatório precisa ser da gestão.' using errcode = 'P0001', hint = 'quatro_olhos';
    end if;
    if new.supersedes_id is not null and not exists (
         select 1 from public.reports r
          where r.id = new.supersedes_id and r.household_id = new.household_id and r.ref_date = new.ref_date) then
      raise exception 'A nova versão substitui um relatório da mesma família e do mesmo mês.' using errcode = 'P0001', hint = 'relatorio_versao';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.status = any (frozen) then
    if (to_jsonb(new) - array['status', 'presented_at', 'presented_how', 'pdf_path'])
       is distinct from (to_jsonb(old) - array['status', 'presented_at', 'presented_how', 'pdf_path']) then
      raise exception 'Relatório aprovado não muda: números, comentário e cenários ficam como foram aprovados.'
        using errcode = 'P0001', hint = 'relatorio_imutavel';
    end if;
    -- O PDF é gravado uma vez, depois da aprovação.
    if old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path then
      raise exception 'O PDF de um relatório aprovado não muda.' using errcode = 'P0001', hint = 'relatorio_imutavel';
    end if;
    if not ((old.status = new.status)
            or (old.status = 'aprovado' and new.status in ('apresentado', 'substituido'))
            or (old.status = 'apresentado' and new.status = 'substituido')) then
      raise exception 'Mudança de status não permitida: % para %.', old.status, new.status
        using errcode = 'P0001', hint = 'relatorio_status';
    end if;
    if old.status = 'substituido' and (new.presented_at is distinct from old.presented_at
                                        or new.presented_how is distinct from old.presented_how) then
      raise exception 'Relatório substituído não muda.' using errcode = 'P0001', hint = 'relatorio_imutavel';
    end if;
    return new;
  end if;

  -- Rascunho ou em revisão.
  if new.status in ('apresentado', 'substituido') then
    raise exception 'Só relatório aprovado pode ser apresentado ou substituído.' using errcode = 'P0001', hint = 'relatorio_status';
  end if;
  if new.status = 'aprovado' then
    if old.status <> 'em_revisao' then
      raise exception 'Só relatório em revisão pode ser aprovado.' using errcode = 'P0001', hint = 'relatorio_status';
    end if;
    if new.approved_by is null or new.approved_at is null then
      raise exception 'Aprovação sem aprovador.' using errcode = 'P0001', hint = 'quatro_olhos';
    end if;
    if new.approved_by = new.prepared_by then
      raise exception 'Quem prepara o relatório não pode aprová-lo.' using errcode = 'P0001', hint = 'quatro_olhos';
    end if;
    perform app.check_approver(new.approved_by, 'gestao', 'o relatório');
  elsif new.approved_by is not null or new.approved_at is not null then
    raise exception 'Só a aprovação preenche o aprovador.' using errcode = 'P0001', hint = 'quatro_olhos';
  end if;
  if new.prepared_by is distinct from old.prepared_by then
    raise exception 'Quem preparou o relatório não muda.' using errcode = 'P0001', hint = 'quatro_olhos';
  end if;
  return new;
end
$$;

create trigger relatorio_imutavel
  before insert or update or delete on public.reports
  for each row execute function app.guard_report();

-- Trilha de auditoria só de inserção -------------------------------------------------------------------------------

create function app.deny_audit_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'A trilha de auditoria é só de inserção.' using errcode = 'P0001', hint = 'auditoria_imutavel';
end
$$;

create trigger auditoria_so_insercao
  before update or delete on public.audit_log
  for each row execute function app.deny_audit_change();
create trigger auditoria_sem_truncate
  before truncate on public.audit_log
  for each statement execute function app.deny_audit_change();

revoke update, delete, truncate on public.audit_log from authenticated, service_role;

-- Registro na auditoria, usado pelos gatilhos e pelas funções da API.
create function app.audit(p_action text, p_table text, p_target text, p_household uuid, p_details jsonb)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, target_table, target_id, household_id, details)
  values (auth.uid(), p_action, p_table, p_target, p_household, p_details)
$$;

-- Gatilho genérico: grava insert, update (só as colunas que mudaram) e delete.
create function app.audit_row() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  hid uuid := case when tg_table_name = 'households' then (rec ->> 'id')::uuid else (rec ->> 'household_id')::uuid end;
  target text := coalesce(rec ->> 'id', rec ->> 'household_id', rec ->> 'cma_version_id', rec ->> 'ref_date');
  details jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('antes', o.value, 'depois', n.value)), '{}'::jsonb)
      into details
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.value is distinct from o.value;
  else
    details := rec;
  end if;
  perform app.audit(lower(tg_op), tg_table_name, target, hid, details);
  return null;
end
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'households', 'people', 'user_roles', 'other_assets', 'cash_flows', 'events', 'goals', 'plan_versions',
    'plan_change_requests', 'assets', 'import_batches', 'positions', 'flows', 'household_months', 'month_closings',
    'scenarios', 'simulation_runs', 'monthly_snapshots', 'reports', 'profiles', 'cma_versions', 'cma_classes',
    'cma_correlations', 'legal_texts'] loop
    execute format(
      'create trigger auditoria after insert or update or delete on public.%I for each row execute function app.audit_row()', t);
  end loop;
end $$;

-- Premissas aprovadas não mudam ------------------------------------------------------------------------------------

create function app.guard_cma_version() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' then
      raise exception 'Versão de premissas aprovada não pode ser apagada.' using errcode = 'P0001', hint = 'premissas_imutaveis';
    end if;
    return old;
  end if;
  if old.status = 'rascunho' then
    if new.status not in ('rascunho', 'aprovada') then
      raise exception 'Rascunho de premissas só vai para aprovada.' using errcode = 'P0001', hint = 'premissas_status';
    end if;
    if new.status = 'aprovada' then
      perform app.check_approver(new.approved_by, 'comite', 'as premissas');
    end if;
  else
    if (to_jsonb(new) - array['status', 'effective_date']) is distinct from (to_jsonb(old) - array['status', 'effective_date']) then
      raise exception 'Versão de premissas aprovada não muda; crie uma nova versão.' using errcode = 'P0001', hint = 'premissas_imutaveis';
    end if;
    if not ((old.status = new.status)
            or (old.status = 'aprovada' and new.status in ('vigente', 'arquivada'))
            or (old.status = 'vigente' and new.status = 'arquivada')) then
      raise exception 'Mudança de status de premissas não permitida: % para %.', old.status, new.status
        using errcode = 'P0001', hint = 'premissas_status';
    end if;
    if old.status <> 'aprovada' and new.effective_date is distinct from old.effective_date then
      raise exception 'A data de vigência não muda depois que a versão entra em vigor.' using errcode = 'P0001', hint = 'premissas_imutaveis';
    end if;
  end if;
  return new;
end
$$;

create trigger premissas_imutaveis
  before update or delete on public.cma_versions
  for each row execute function app.guard_cma_version();

-- Versão nova começa como rascunho.
create function app.guard_cma_version_insert() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'rascunho' then
    raise exception 'Versão de premissas nova começa como rascunho.' using errcode = 'P0001', hint = 'premissas_status';
  end if;
  return new;
end
$$;

create trigger premissas_comecam_em_rascunho
  before insert on public.cma_versions
  for each row execute function app.guard_cma_version_insert();

-- Uma só versão vigente: é ela que vale no fechamento.
create unique index cma_uma_vigente on public.cma_versions ((true)) where status = 'vigente';

-- Classes e correlações só mudam enquanto a versão é rascunho.
create function app.guard_cma_detail() returns trigger
language plpgsql
set search_path = ''
as $$
declare vid uuid := case when tg_op = 'DELETE' then old.cma_version_id else new.cma_version_id end;
begin
  if exists (select 1 from public.cma_versions v where v.id = vid and v.status <> 'rascunho')
     or (tg_op = 'UPDATE' and exists (select 1 from public.cma_versions v where v.id = old.cma_version_id and v.status <> 'rascunho')) then
    raise exception 'Premissas de uma versão aprovada não mudam; crie uma nova versão.' using errcode = 'P0001', hint = 'premissas_imutaveis';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger classes_imutaveis
  before insert or update or delete on public.cma_classes
  for each row execute function app.guard_cma_detail();
create trigger correlacoes_imutaveis
  before insert or update or delete on public.cma_correlations
  for each row execute function app.guard_cma_detail();

-- Textos legais aprovados não mudam ---------------------------------------------------------------------------------

create function app.guard_legal_text() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'rascunho' or new.approved_by is not null then
      raise exception 'Texto legal novo começa como rascunho.' using errcode = 'P0001', hint = 'texto_status';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' then
      raise exception 'Texto legal aprovado não pode ser apagado.' using errcode = 'P0001', hint = 'texto_imutavel';
    end if;
    return old;
  end if;
  if old.status = 'rascunho' then
    if new.status = 'arquivado' then
      raise exception 'Rascunho de texto legal não é arquivado; apague ou aprove.' using errcode = 'P0001', hint = 'texto_status';
    end if;
    if new.status = 'aprovado' then
      perform app.check_approver(new.approved_by, 'compliance', 'o texto legal');
    end if;
    return new;
  end if;
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status')
     or not (old.status = new.status or (old.status = 'aprovado' and new.status = 'arquivado')) then
    raise exception 'Texto legal aprovado não muda; mudança de texto é uma nova versão aprovada pela compliance.'
      using errcode = 'P0001', hint = 'texto_imutavel';
  end if;
  return new;
end
$$;

create trigger texto_legal_imutavel
  before insert or update or delete on public.legal_texts
  for each row execute function app.guard_legal_text();

-- Um só texto aprovado por chave.
create unique index legal_texts_um_aprovado on public.legal_texts (key) where status = 'aprovado';

revoke all on all functions in schema app from public;
grant execute on function app.mfa_ok(), app.has_role(public.app_role), app.is_internal(), app.is_client_of(uuid),
  app.can_read_household(uuid), app.can_write_plan(uuid), app.user_has_role(uuid, public.app_role),
  app.check_approver(uuid, public.app_role, text) to authenticated, service_role;
