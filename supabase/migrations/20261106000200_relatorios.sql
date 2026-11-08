-- AWARE Objective, Fase 2, etapa 4: relatórios no banco (SPEC, "Fluxo do mês", passos 4 a 8, "Regras do relatório" e
-- "Segurança"; D-070). Regras:
-- - Rascunho: a gestão pede pela função do servidor `report`, que monta o snapshot a partir das rodadas publicadas
--   (src/report). Só família CADM ativa, com o mês rodado ou fechado, gestor responsável no cadastro e os textos legais
--   do relatório aprovados pela compliance. Uma versão aberta (rascunho ou em revisão) por família e mês.
-- - Revisão: quem prepara escreve o comentário e escolhe até três cenários (a função do servidor roda cada um) e envia.
--   Outra pessoa da gestão aprova ou devolve com uma observação; qualquer pessoa da gestão descarta, com motivo.
-- - Aprovação: só com a família fechada no mês, a rodada do rascunho ainda publicada e os mesmos textos legais aprovados.
--   O comentário e os cenários entram no snapshot, que não muda mais; a versão anterior aprovada vira "substituída".
-- - Mês que volta para a conferência descarta a versão aberta, com o motivo gravado.
-- - PDF: gerado no navegador de quem aprova e guardado pela função do servidor na pasta privada `relatorios`, uma vez,
--   com o hash SHA-256 e o tamanho; download por link assinado de curta duração, gerado pela função, com registro.
-- - Apresentação: data e forma (reunião ou PDF), uma vez, com o PDF guardado.
-- - Leitura (D-041): gestão, comitê e compliance veem todas as versões; o banker, as aprovadas das suas famílias; quem
--   não vê valores não recebe o conteúdo nem o PDF. Cada leitura vai para a auditoria.
-- - Textos legais: a compliance escreve uma versão nova (rascunho) e aprova; a aprovação arquiva a anterior.
-- - Auditoria: leitura filtrada para a compliance e o comitê.

-- Gestor responsável (capa do relatório) -----------------------------------------------------------------------------

alter table public.households add column manager_name text
  check (manager_name is null or (manager_name = trim(manager_name) and length(manager_name) between 2 and 80));
alter table public.households add constraint gestor_so_na_cadm check (channel = 'cadm' or manager_name is null);

-- Cadastro com o gestor responsável (o resto como na etapa 3c).
create or replace function public.save_household(p_household uuid, p_fields jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  h public.households;
  e jsonb := '[]'::jsonb;
  v_code text := upper(trim(coalesce(p_fields ->> 'code', '')));
  v_name text := trim(coalesce(p_fields ->> 'name', ''));
  v_channel text := coalesce(p_fields ->> 'channel', '');
  v_banker text := nullif(p_fields ->> 'banker_id', '');
  v_owner text := nullif(p_fields ->> 'owner_id', '');
  v_intermediary text := nullif(trim(coalesce(p_fields ->> 'intermediary', '')), '');
  v_manager text := nullif(trim(coalesce(p_fields ->> 'manager_name', '')), '');
  v_profile text := coalesce(p_fields ->> 'profile_id', '');
  v_suitability text := nullif(p_fields ->> 'suitability', '');
  v_fee numeric := app.jnum(p_fields -> 'fee_rate');
  v_horizon numeric := app.jnum(p_fields -> 'horizon_age');
  v_seed numeric := app.jnum(p_fields -> 'seed');
  v_status text := coalesce(p_fields ->> 'status', 'ativa');
  v_id uuid;
begin
  perform app.require_role('gestao', 'cadastrar famílias');
  if p_household is not null then
    select * into h from public.households where id = p_household for update;
    if not found then
      raise exception 'Família não encontrada.' using errcode = 'P0002', hint = 'familia_inexistente';
    end if;
    if v_channel = '' then v_channel := h.channel::text; end if;
    if v_seed is null then v_seed := h.seed; end if;
  end if;

  if v_code !~ '^[A-Z0-9][A-Z0-9-]{1,29}$' then
    e := e || app.plan_error('code', 'Use de 2 a 30 letras sem acento, números ou hífen, como AND001.');
  elsif exists (select 1 from public.households where code = v_code and id is distinct from p_household) then
    e := e || app.plan_error('code', format('O código %s já é de outra família.', v_code));
  end if;
  if v_name = '' or length(v_name) > 120 then
    e := e || app.plan_error('name', 'Informe o nome da família (até 120 caracteres).');
  end if;
  if v_channel not in ('cadm', 'ai') then
    e := e || app.plan_error('channel', 'Escolha o canal: CADM ou AI.');
  elsif h.id is not null and v_channel <> h.channel::text then
    e := e || app.plan_error('channel', 'O canal não muda depois do cadastro: cadastre a família de novo no outro canal.');
  end if;
  -- Banker e responsável: o formato antes da conversão (o banco não garante a ordem das condições num "or").
  if v_banker is not null then
    if v_channel <> 'cadm' or v_banker !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      e := e || app.plan_error('banker_id', 'Escolha um banker cadastrado (só na CADM).');
    elsif not exists (select 1 from public.user_roles r where r.user_id = v_banker::uuid and r.role = 'banker') then
      e := e || app.plan_error('banker_id', 'Escolha um banker cadastrado (só na CADM).');
    end if;
  end if;
  if v_owner is not null then
    if v_channel <> 'ai' or v_owner !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      e := e || app.plan_error('owner_id', 'Escolha um responsável cadastrado (só na AI).');
    elsif not exists (select 1 from public.user_roles r where r.user_id = v_owner::uuid and r.role = 'responsavel') then
      e := e || app.plan_error('owner_id', 'Escolha um responsável cadastrado (só na AI).');
    end if;
  end if;
  if length(coalesce(v_intermediary, '')) > 120 then
    e := e || app.plan_error('intermediary', 'O intermediário tem até 120 caracteres.');
  end if;
  if v_manager is not null and v_channel <> 'cadm' then
    e := e || app.plan_error('manager_name', 'O gestor responsável é só da CADM.');
  elsif v_manager is not null and length(v_manager) not between 2 and 80 then
    e := e || app.plan_error('manager_name', 'O nome do gestor responsável tem de 2 a 80 caracteres.');
  end if;
  if not exists (select 1 from public.profiles where id = v_profile) then
    e := e || app.plan_error('profile_id', 'Escolha o perfil de alocação.');
  end if;
  if v_suitability is not null and not exists (select 1 from public.profiles where id = v_suitability) then
    e := e || app.plan_error('suitability', 'Escolha a suitability entre os perfis.');
  end if;
  if v_fee is null or v_fee < 0 or v_fee >= 0.1 then
    e := e || app.plan_error('fee_rate', 'O custo anual vai de 0% a menos de 10% ao ano.');
  end if;
  if v_horizon is null or v_horizon <> trunc(v_horizon) or v_horizon < 60 or v_horizon > 110 then
    e := e || app.plan_error('horizon_age', 'A idade-limite vai de 60 a 110 anos.');
  end if;
  if (p_fields ? 'seed' and jsonb_typeof(p_fields -> 'seed') not in ('number', 'null'))
     or (v_seed is not null and (v_seed <> trunc(v_seed) or v_seed < 0 or v_seed > 4294967295)) then
    e := e || app.plan_error('seed', 'A semente é um inteiro de 0 a 4.294.967.295.');
  elsif h.id is not null and v_seed is distinct from h.seed
        and exists (select 1 from public.simulation_runs r where r.household_id = h.id) then
    e := e || app.plan_error('seed', 'A semente não muda depois da primeira rodada: os sorteios da família são os mesmos todos os meses.');
  end if;
  if v_status not in ('ativa', 'encerrada') then
    e := e || app.plan_error('status', 'Escolha a situação: ativa ou encerrada.');
  end if;
  if jsonb_array_length(e) > 0 then
    return jsonb_build_object('ok', false, 'errors', e);
  end if;

  if h.id is null then
    insert into public.households (code, name, channel, owner_id, intermediary, banker_id, manager_name, profile_id, weights_source,
                                   suitability, fee_rate, horizon_age, seed, status)
    values (v_code, v_name, v_channel::public.channel, v_owner::uuid, v_intermediary, v_banker::uuid, v_manager, v_profile,
            case v_channel when 'cadm' then 'perfil' else 'carteira_atual' end::public.weights_source, v_suitability, v_fee,
            v_horizon::integer, coalesce(v_seed, floor(random() * 4294967296))::bigint, v_status)
    returning id into v_id;
  else
    update public.households
       set code = v_code, name = v_name, owner_id = v_owner::uuid, intermediary = v_intermediary, banker_id = v_banker::uuid,
           manager_name = v_manager, profile_id = v_profile, suitability = v_suitability, fee_rate = v_fee,
           horizon_age = v_horizon::integer, seed = v_seed::bigint, status = v_status
     where id = h.id;
    v_id := h.id;
  end if;
  return jsonb_build_object('ok', true, 'household_id', v_id, 'code', v_code);
end
$$;

-- Textos legais: quem escreveu cada versão; um rascunho por chave ----------------------------------------------------

alter table public.legal_texts add column created_by uuid references auth.users (id) default auth.uid();
create unique index legal_texts_um_rascunho on public.legal_texts (key) where status = 'rascunho';

-- Relatórios: rodada, observação da revisão, descarte e PDF -----------------------------------------------------------

alter table public.reports
  add column run_id uuid references public.simulation_runs (id),
  add column review_note text check (review_note is null or length(review_note) <= 500),
  add column discard_reason text check (discard_reason is null or length(discard_reason) <= 500),
  add column pdf_sha256 text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  add column pdf_size integer check (pdf_size is null or pdf_size > 0),
  add constraint comentario_curto check (comment is null or length(comment) <= 1200),
  add constraint descarte_tem_motivo check (status <> 'descartado' or discard_reason is not null);
create unique index reports_uma_versao_aberta on public.reports (household_id, ref_date) where status in ('rascunho', 'em_revisao');

-- Quatro olhos e imutabilidade (etapa 1), com o descarte e o PDF: a versão descartada não muda mais; o PDF (caminho,
-- hash e tamanho) e a apresentação são gravados uma vez, depois da aprovação.
create or replace function app.guard_report() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  frozen constant public.report_status[] := array['aprovado', 'apresentado', 'substituido']::public.report_status[];
  mutable constant text[] := array['status', 'presented_at', 'presented_how', 'pdf_path', 'pdf_sha256', 'pdf_size'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Relatório não pode ser apagado; corrigir é criar uma nova versão com motivo.'
      using errcode = 'P0001', hint = 'relatorio_imutavel';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'rascunho' or new.approved_by is not null or new.approved_at is not null then
      raise exception 'Relatório novo começa como rascunho, sem aprovação.' using errcode = 'P0001', hint = 'relatorio_status';
    end if;
    if new.pdf_path is not null or new.pdf_sha256 is not null or new.presented_at is not null then
      raise exception 'Relatório novo não tem PDF nem apresentação.' using errcode = 'P0001', hint = 'relatorio_status';
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
  if old.status = 'descartado' then
    raise exception 'Versão descartada não muda.' using errcode = 'P0001', hint = 'relatorio_imutavel';
  end if;
  if old.status = any (frozen) then
    if (to_jsonb(new) - mutable) is distinct from (to_jsonb(old) - mutable) then
      raise exception 'Relatório aprovado não muda: números, comentário e cenários ficam como foram aprovados.'
        using errcode = 'P0001', hint = 'relatorio_imutavel';
    end if;
    -- O PDF é gravado uma vez, depois da aprovação.
    if (old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path)
       or (old.pdf_sha256 is not null and new.pdf_sha256 is distinct from old.pdf_sha256)
       or (old.pdf_size is not null and new.pdf_size is distinct from old.pdf_size) then
      raise exception 'O PDF de um relatório aprovado não muda.' using errcode = 'P0001', hint = 'relatorio_imutavel';
    end if;
    if not ((old.status = new.status)
            or (old.status = 'aprovado' and new.status in ('apresentado', 'substituido'))
            or (old.status = 'apresentado' and new.status = 'substituido')) then
      raise exception 'Mudança de status não permitida: % para %.', old.status, new.status
        using errcode = 'P0001', hint = 'relatorio_status';
    end if;
    -- A apresentação é registrada uma vez.
    if old.status in ('apresentado', 'substituido') and (new.presented_at is distinct from old.presented_at
                                                          or new.presented_how is distinct from old.presented_how) then
      raise exception 'Relatório já apresentado ou substituído não muda.' using errcode = 'P0001', hint = 'relatorio_imutavel';
    end if;
    return new;
  end if;

  -- Rascunho ou em revisão.
  if new.status in ('apresentado', 'substituido') then
    raise exception 'Só relatório aprovado pode ser apresentado ou substituído.' using errcode = 'P0001', hint = 'relatorio_status';
  end if;
  if new.pdf_path is not null or new.pdf_sha256 is not null or new.presented_at is not null then
    raise exception 'O PDF e a apresentação vêm depois da aprovação.' using errcode = 'P0001', hint = 'relatorio_status';
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

-- Mês que volta para a conferência: a versão aberta do relatório é descartada (os números dela ficaram para trás).
create function app.discard_stale_reports() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or (old.status in ('rodado', 'fechado') and new.status not in ('rodado', 'fechado')) then
    update public.reports
       set status = 'descartado', discard_reason = 'O mês voltou para a conferência: os números do rascunho ficaram para trás.'
     where household_id = old.household_id and ref_date = old.ref_date and status in ('rascunho', 'em_revisao');
  end if;
  return null;
end
$$;
create trigger descarta_relatorio_desatualizado
  after update of status or delete on public.household_months
  for each row execute function app.discard_stale_reports();

-- Auxiliares ---------------------------------------------------------------------------------------------------------

-- Textos legais do relatório (src/report/texts.ts, REPORT_LEGAL_KEYS).
create function app.report_legal_keys() returns text[]
language sql immutable
set search_path = ''
as $$ select array['rodape_relatorio', 'nota_ponte', 'primeiro_relatorio', 'aviso_completo'] $$;

-- Todos os textos legais do relatório têm versão aprovada.
create function app.report_texts_ready() returns boolean
language sql stable
set search_path = ''
as $$
  select (select count(distinct t.key) from public.legal_texts t
           where t.status = 'aprovado' and t.key = any (app.report_legal_keys())) = cardinality(app.report_legal_keys())
$$;

-- O snapshot usa as versões aprovadas hoje de todos os textos legais do relatório.
create function app.report_texts_current(p_snapshot jsonb) returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(bool_and(exists (select 1 from public.legal_texts t
                                     where t.key = k and t.status = 'aprovado'
                                       and t.version::text = (p_snapshot #>> array['texts', 'legal', k]))), false)
    from unnest(app.report_legal_keys()) k
$$;

-- Quem lê o relatório: gestão, comitê e compliance (todas as versões); o banker, as aprovadas das suas famílias.
create function app.can_read_report(p_household uuid, p_status public.report_status) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.mfa_ok() and (
    app.is_internal()
    or (p_status in ('aprovado', 'apresentado', 'substituido') and exists (
          select 1 from public.households h
           where h.id = p_household and h.channel = 'cadm' and h.banker_id = auth.uid() and app.has_role('banker')))
  )
$$;

-- Resumo de uma versão, sem os números: situação, pessoas, datas e motivos.
create function app.report_summary(r public.reports) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'household_id', r.household_id, 'ref_date', r.ref_date, 'version', r.version, 'status', r.status,
    'prepared_by', r.prepared_by, 'prepared_by_email', (select email from auth.users where id = r.prepared_by),
    'approved_by_email', (select email from auth.users where id = r.approved_by), 'approved_at', r.approved_at,
    'presented_at', r.presented_at, 'presented_how', r.presented_how, 'has_pdf', r.pdf_path is not null,
    'reason', r.reason, 'discard_reason', r.discard_reason, 'created_at', r.created_at)
$$;

-- Leitura -----------------------------------------------------------------------------------------------------------

-- Relatórios do mês: as famílias CADM (ativas, ou com relatório no mês) com a situação do mês e a última versão que
-- quem pede pode ver. O banker vê só as suas famílias.
create function public.report_months(p_ref_date date)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ref date := app.month_end_of(p_ref_date);
  v_banker boolean;
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para ver os relatórios.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  if not (app.is_internal() or app.has_role('banker')) then
    raise exception 'Sem permissão para ver os relatórios.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  v_banker := not app.is_internal();
  perform app.audit('ler_relatorios', 'reports', null, null, jsonb_build_object('mes', v_ref));
  return jsonb_build_object(
    'ref_date', v_ref,
    'texts_ready', app.report_texts_ready(),
    'families', (select coalesce(jsonb_agg(f.x order by f.code), '[]'::jsonb) from (
       select h.code, jsonb_build_object(
         'household_id', h.id, 'code', h.code, 'name', h.name, 'status', h.status, 'manager_name', h.manager_name,
         'month_status', m.status,
         'latest', (select app.report_summary(r) from public.reports r
                     where r.household_id = h.id and r.ref_date = v_ref and app.can_read_report(h.id, r.status)
                     order by r.version desc limit 1)) as x
         from public.households h
         left join public.household_months m on m.household_id = h.id and m.ref_date = v_ref
        where h.channel = 'cadm'
          and (h.status = 'ativa' or exists (select 1 from public.reports r where r.household_id = h.id and r.ref_date = v_ref))
          and (not v_banker or h.banker_id = auth.uid())) f));
end
$$;

-- Uma versão do relatório, com as demais versões do mesmo mês. Sem permissão para valores, só a situação.
create function public.report_detail(p_report uuid)
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
    'review_note', case when v_amounts then r.review_note end,
    'snapshot', case when v_amounts then r.snapshot end,
    'texts_current', app.report_texts_current(r.snapshot),
    'run_current', r.run_id is not distinct from (select s.run_id from public.monthly_snapshots s
                                                  where s.household_id = r.household_id and s.ref_date = r.ref_date),
    'versions', (select coalesce(jsonb_agg(app.report_summary(v) order by v.version), '[]'::jsonb) from public.reports v
                  where v.household_id = r.household_id and v.ref_date = r.ref_date and app.can_read_report(v.household_id, v.status)));
end
$$;

-- Fluxo da revisão (console) ----------------------------------------------------------------------------------------

-- A versão aberta, travada para a mudança, conferindo a situação e, se pedido, que quem muda é quem preparou.
create function app.open_report(p_report uuid, p_status public.report_status[], p_preparer boolean, p_what text)
returns public.reports
language plpgsql security definer
set search_path = ''
as $$
declare r public.reports;
begin
  perform app.require_role('gestao', p_what);
  select * into r from public.reports where id = p_report for update;
  if not found then
    raise exception 'Relatório não encontrado.' using errcode = 'P0002', hint = 'relatorio_inexistente';
  end if;
  if r.status <> all (p_status) then
    raise exception 'Não dá para % com o relatório %.', p_what, replace(r.status::text, '_', ' ') using errcode = 'P0001', hint = 'relatorio_status';
  end if;
  if p_preparer and r.prepared_by <> auth.uid() then
    raise exception 'Só quem prepara o relatório pode %.', p_what using errcode = '42501', hint = 'quatro_olhos';
  end if;
  return r;
end
$$;

-- Comentário da gestão (o único texto livre do relatório; quem aprova revisa).
create function public.save_report_comment(p_report uuid, p_comment text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.reports := app.open_report(p_report, array['rascunho']::public.report_status[], true, 'escrever o comentário');
  v text := nullif(trim(coalesce(p_comment, '')), '');
begin
  if length(v) > 1200 then
    raise exception 'O comentário tem até 1.200 caracteres.' using errcode = '22023', hint = 'comentario_longo';
  end if;
  update public.reports set comment = v where id = r.id;
  return jsonb_build_object('id', r.id, 'comment', v);
end
$$;

-- Tira um cenário da conversa do mês.
create function public.remove_report_scenario(p_report uuid, p_scenario text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.reports := app.open_report(p_report, array['rascunho']::public.report_status[], true, 'mudar os cenários');
  v jsonb;
begin
  if not exists (select 1 from jsonb_array_elements(coalesce(r.scenarios, '[]'::jsonb)) s where s ->> 'id' = p_scenario) then
    raise exception 'Cenário não encontrado no relatório.' using errcode = 'P0002', hint = 'cenario_inexistente';
  end if;
  select coalesce(jsonb_agg(s order by ord), '[]'::jsonb) into v
    from jsonb_array_elements(r.scenarios) with ordinality e(s, ord) where s ->> 'id' <> p_scenario;
  update public.reports set scenarios = v where id = r.id;
  return jsonb_build_object('id', r.id, 'scenarios', v);
end
$$;

-- Quem prepara envia para a aprovação, com o comentário escrito.
create function public.submit_report(p_report uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare r public.reports := app.open_report(p_report, array['rascunho']::public.report_status[], true, 'enviar o relatório');
begin
  if r.comment is null then
    raise exception 'Escreva o comentário da gestão antes de enviar.' using errcode = 'P0001', hint = 'sem_comentario';
  end if;
  update public.reports set status = 'em_revisao' where id = r.id;
  perform app.audit('enviar_relatorio', 'reports', r.id::text, r.household_id, jsonb_build_object('mes', r.ref_date, 'versao', r.version));
  return jsonb_build_object('id', r.id, 'status', 'em_revisao');
end
$$;

-- Volta para rascunho: outra pessoa da gestão devolve, com observação; quem preparou pode retirar para mudar.
create function public.return_report(p_report uuid, p_note text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.reports := app.open_report(p_report, array['em_revisao']::public.report_status[], false, 'devolver o relatório');
  v text := nullif(trim(coalesce(p_note, '')), '');
begin
  if r.prepared_by <> auth.uid() and (v is null or length(v) < 3) then
    raise exception 'Diga o que precisa mudar ao devolver.' using errcode = '22023', hint = 'sem_observacao';
  end if;
  if length(v) > 500 then
    raise exception 'A observação tem até 500 caracteres.' using errcode = '22023', hint = 'observacao_longa';
  end if;
  update public.reports set status = 'rascunho', review_note = coalesce(v, review_note) where id = r.id;
  perform app.audit('devolver_relatorio', 'reports', r.id::text, r.household_id,
                    jsonb_build_object('mes', r.ref_date, 'versao', r.version, 'observacao', v));
  return jsonb_build_object('id', r.id, 'status', 'rascunho');
end
$$;

-- Descarta a versão aberta, com motivo (número estranho: volte para a conferência, rode de novo e prepare outra).
create function public.discard_report(p_report uuid, p_reason text)
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
  return jsonb_build_object('id', r.id, 'status', 'descartado');
end
$$;

-- Aprovação por outra pessoa da gestão: família fechada no mês, rodada e textos legais do rascunho ainda em vigor. O
-- comentário e os cenários entram no snapshot; a versão anterior aprovada vira "substituída".
create function public.approve_report(p_report uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.reports := app.open_report(p_report, array['em_revisao']::public.report_status[], false, 'aprovar o relatório');
  v_snapshot jsonb;
begin
  if r.prepared_by = auth.uid() then
    raise exception 'Quem prepara o relatório não pode aprová-lo.' using errcode = '42501', hint = 'quatro_olhos';
  end if;
  if not exists (select 1 from public.household_months m
                  where m.household_id = r.household_id and m.ref_date = r.ref_date and m.status = 'fechado') then
    raise exception 'Feche o mês da família antes de aprovar: só família fechada alimenta o relatório.'
      using errcode = 'P0001', hint = 'mes_aberto';
  end if;
  if r.run_id is distinct from (select s.run_id from public.monthly_snapshots s where s.household_id = r.household_id and s.ref_date = r.ref_date) then
    raise exception 'A rodada do mês mudou depois do rascunho: descarte e prepare uma nova versão.' using errcode = 'P0001', hint = 'rodada_mudou';
  end if;
  if not app.report_texts_current(r.snapshot) then
    raise exception 'Os textos legais mudaram depois do rascunho: descarte e prepare uma nova versão.' using errcode = 'P0001', hint = 'textos_mudaram';
  end if;
  if r.comment is null then
    raise exception 'O relatório não tem o comentário da gestão.' using errcode = 'P0001', hint = 'sem_comentario';
  end if;
  v_snapshot := r.snapshot || jsonb_build_object(
    'comment', jsonb_build_object('text', r.comment, 'example', false),
    'scenarios', (select coalesce(jsonb_agg(jsonb_build_object('id', s ->> 'id', 'name', s ->> 'name', 'probability', s -> 'probability',
                                                                'requiredReturn', s -> 'requiredReturn',
                                                                'requiredReturnStatus', s -> 'requiredReturnStatus') order by ord), '[]'::jsonb)
                    from jsonb_array_elements(coalesce(r.scenarios, '[]'::jsonb)) with ordinality e(s, ord)));
  update public.reports set status = 'aprovado', approved_by = auth.uid(), approved_at = now(), snapshot = v_snapshot where id = r.id;
  update public.reports set status = 'substituido'
   where household_id = r.household_id and ref_date = r.ref_date and id <> r.id and status in ('aprovado', 'apresentado');
  perform app.audit('aprovar_relatorio', 'reports', r.id::text, r.household_id, jsonb_build_object('mes', r.ref_date, 'versao', r.version));
  return jsonb_build_object('id', r.id, 'status', 'aprovado', 'version', r.version);
end
$$;

-- Apresentação: data (da aprovação até hoje, no horário de Brasília) e forma, uma vez, com o PDF guardado.
create function public.present_report(p_report uuid, p_how text, p_date date)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.reports := app.open_report(p_report, array['aprovado']::public.report_status[], false, 'registrar a apresentação');
  v_from date := (r.approved_at at time zone 'America/Sao_Paulo')::date;
begin
  if r.pdf_path is null then
    raise exception 'Guarde o PDF antes de registrar a apresentação.' using errcode = 'P0001', hint = 'sem_pdf';
  end if;
  if p_how is null or p_how not in ('reuniao', 'pdf') then
    raise exception 'Escolha a forma: reunião ou PDF enviado.' using errcode = '22023', hint = 'forma_invalida';
  end if;
  if p_date is null or p_date < v_from or p_date > app.today_brazil() then
    raise exception 'A data vai de % (aprovação) até hoje.', to_char(v_from, 'DD/MM/YYYY') using errcode = '22023', hint = 'data_invalida';
  end if;
  update public.reports
     set status = 'apresentado', presented_how = p_how, presented_at = (p_date + time '12:00') at time zone 'America/Sao_Paulo'
   where id = r.id;
  perform app.audit('apresentar_relatorio', 'reports', r.id::text, r.household_id,
                    jsonb_build_object('mes', r.ref_date, 'versao', r.version, 'forma', p_how, 'data', p_date));
  return jsonb_build_object('id', r.id, 'status', 'apresentado');
end
$$;

-- Download do PDF (a função do servidor chama com o token de quem pede e gera o link assinado): registra o download.
create function public.report_pdf_access(p_report uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.reports;
  h public.households;
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para baixar o relatório.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  select * into r from public.reports where id = p_report;
  if not found or not app.can_read_report(r.household_id, r.status) then
    raise exception 'Relatório não encontrado.' using errcode = 'P0002', hint = 'relatorio_inexistente';
  end if;
  if not app.can_see_amounts() then
    raise exception 'Sem permissão para ver os valores desta família.' using errcode = '42501', hint = 'sem_valores';
  end if;
  if r.pdf_path is null then
    raise exception 'O PDF deste relatório ainda não foi guardado.' using errcode = 'P0001', hint = 'sem_pdf';
  end if;
  select * into h from public.households where id = r.household_id;
  perform app.audit('baixar_relatorio', 'reports', r.id::text, r.household_id, jsonb_build_object('mes', r.ref_date, 'versao', r.version));
  return jsonb_build_object('path', r.pdf_path, 'sha256', r.pdf_sha256,
                            'file_name', format('relatorio-%s-%s-v%s.pdf', lower(h.code), to_char(r.ref_date, 'YYYY-MM'), r.version));
end
$$;

-- Função do servidor `report` ---------------------------------------------------------------------------------------

-- Quem pede rascunho, cenário ou PDF: a gestão, com segundo fator (a função chama com o token de quem pede).
create function public.report_permission()
returns uuid
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.require_role('gestao', 'preparar relatórios');
  return auth.uid();
end
$$;

-- Família e mês prontos para um rascunho (o mesmo vale ao gravar).
create function app.check_report_month(p_household uuid, p_ref_date date) returns public.monthly_snapshots
language plpgsql security definer
set search_path = ''
as $$
declare
  h public.households;
  m public.household_months;
  s public.monthly_snapshots;
begin
  select * into h from public.households where id = p_household;
  if not found or h.channel <> 'cadm' then
    raise exception 'Relatório mensal só para família CADM.' using errcode = 'P0001', hint = 'so_cadm';
  end if;
  if h.status <> 'ativa' then
    raise exception 'Família encerrada não recebe relatório novo.' using errcode = 'P0001', hint = 'familia_encerrada';
  end if;
  if h.manager_name is null then
    raise exception 'Informe o gestor responsável no cadastro da família.' using errcode = 'P0001', hint = 'sem_gestor';
  end if;
  select * into m from public.household_months where household_id = p_household and ref_date = p_ref_date;
  if not found or m.status not in ('rodado', 'fechado') then
    raise exception 'O relatório sai do mês rodado (situação: %).', coalesce(m.status::text, 'sem importação')
      using errcode = 'P0001', hint = 'mes_status';
  end if;
  select * into s from public.monthly_snapshots where household_id = p_household and ref_date = p_ref_date;
  if not found then
    raise exception 'Falta a rodada publicada do mês.' using errcode = 'P0001', hint = 'sem_rodada';
  end if;
  if not app.report_texts_ready() then
    raise exception 'A compliance ainda não aprovou todos os textos legais do relatório.' using errcode = 'P0001', hint = 'textos_pendentes';
  end if;
  if exists (select 1 from public.reports where household_id = p_household and ref_date = p_ref_date and status in ('rascunho', 'em_revisao')) then
    raise exception 'Já há uma versão aberta deste relatório: envie, aprove ou descarte antes.' using errcode = 'P0001', hint = 'versao_aberta';
  end if;
  return s;
end
$$;

-- Entradas do rascunho, no formato de src/report (ReportAssembly): os meses acompanhados até o mês do relatório (o
-- pacote e a rodada publicada de cada um), a ponte do mês, o IPCA, o CDI do período, os textos legais aprovados e o
-- gestor responsável.
create function public.report_inputs(p_household uuid, p_ref_date date, p_actor uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  s public.monthly_snapshots;
  v_first date;
  v_latest public.reports;
begin
  perform app.act_as(p_actor, 'o relatório');
  s := app.check_report_month(p_household, p_ref_date);
  select min(ref_date) into v_first from public.monthly_snapshots where household_id = p_household and ref_date <= p_ref_date;
  select * into v_latest from public.reports where household_id = p_household and ref_date = p_ref_date order by version desc limit 1;
  perform app.audit('ler_entradas_do_relatorio', 'households', p_household::text, p_household, jsonb_build_object('mes', p_ref_date));
  return jsonb_build_object(
    'run_id', s.run_id,
    'manager', (select manager_name from public.households where id = p_household),
    'months', (select jsonb_agg(jsonb_build_object('pkg', r.inputs -> 'pkg', 'run', r.summary) order by ms.ref_date)
                 from public.monthly_snapshots ms join public.simulation_runs r on r.id = ms.run_id
                where ms.household_id = p_household and ms.ref_date <= p_ref_date),
    'bridge', s.attribution,
    'ipca', (select coalesce(jsonb_object_agg(to_char(date, 'YYYY-MM'), value / 100), '{}'::jsonb)
               from public.market_series where series_code = 'ipca'),
    'cdi', (select coalesce(jsonb_object_agg(to_char(date, 'YYYY-MM-DD'), value), '{}'::jsonb)
              from public.market_series where series_code = 'cdi' and date >= date_trunc('month', v_first)::date and date <= p_ref_date),
    'legal', (select jsonb_object_agg(t.key, jsonb_build_object('version', t.version, 'body', t.body))
                from public.legal_texts t where t.status = 'aprovado' and t.key = any (app.report_legal_keys())),
    'latest', case when v_latest.id is null then null
                   else jsonb_build_object('id', v_latest.id, 'version', v_latest.version, 'status', v_latest.status) end);
end
$$;

-- Grava o rascunho montado pela função do servidor: confere de novo o mês, a rodada, os textos e a ligação do snapshot
-- com a rodada; a versão nova substitui a última (com motivo).
create function public.record_report_draft(p_household uuid, p_ref_date date, p_actor uuid, p_run_id uuid, p_snapshot jsonb, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  s public.monthly_snapshots;
  v_latest public.reports;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_id uuid;
begin
  perform app.act_as(p_actor, 'o relatório');
  s := app.check_report_month(p_household, p_ref_date);
  if p_run_id is distinct from s.run_id then
    raise exception 'A rodada do mês mudou: peça o rascunho de novo.' using errcode = 'P0001', hint = 'rodada_mudou';
  end if;
  if p_snapshot ->> 'schema' is distinct from '2' or p_snapshot ->> 'refMonth' is distinct from to_char(p_ref_date, 'YYYY-MM')
     or p_snapshot #>> '{family,id}' is distinct from p_household::text
     or p_snapshot #>> '{run,inputsHash}' is distinct from (select inputs_hash from public.simulation_runs where id = p_run_id) then
    raise exception 'O rascunho não é desta família, deste mês ou desta rodada.' using errcode = '22023', hint = 'snapshot_invalido';
  end if;
  if not app.report_texts_current(p_snapshot) then
    raise exception 'Os textos legais mudaram: peça o rascunho de novo.' using errcode = 'P0001', hint = 'textos_mudaram';
  end if;
  select * into v_latest from public.reports where household_id = p_household and ref_date = p_ref_date order by version desc limit 1;
  if v_latest.id is not null and (v_reason is null or length(v_reason) < 3 or length(v_reason) > 500) then
    raise exception 'Diga o motivo da nova versão (de 3 a 500 caracteres).' using errcode = '22023', hint = 'sem_motivo';
  end if;
  insert into public.reports (household_id, ref_date, version, prepared_by, snapshot, run_id, scenarios, supersedes_id, reason)
  values (p_household, p_ref_date, coalesce(v_latest.version, 0) + 1, p_actor, p_snapshot, p_run_id, '[]'::jsonb, v_latest.id,
          case when v_latest.id is null then null else v_reason end)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'version', coalesce(v_latest.version, 0) + 1);
end
$$;

-- Entradas de um cenário: o pacote do mês da rodada do rascunho e o IPCA. Só quem prepara, no rascunho, até três.
create function public.report_scenario_inputs(p_report uuid, p_actor uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare r public.reports;
begin
  perform app.act_as(p_actor, 'o relatório');
  select * into r from public.reports where id = p_report;
  if not found then
    raise exception 'Relatório não encontrado.' using errcode = 'P0002', hint = 'relatorio_inexistente';
  end if;
  if r.status <> 'rascunho' then
    raise exception 'Os cenários mudam só no rascunho.' using errcode = 'P0001', hint = 'relatorio_status';
  end if;
  if r.prepared_by <> p_actor then
    raise exception 'Só quem prepara o relatório escolhe os cenários.' using errcode = '42501', hint = 'quatro_olhos';
  end if;
  if jsonb_array_length(coalesce(r.scenarios, '[]'::jsonb)) >= 3 then
    raise exception 'O relatório já tem três cenários: tire um antes.' using errcode = 'P0001', hint = 'cenarios_cheios';
  end if;
  return jsonb_build_object(
    'pkg', (select inputs -> 'pkg' from public.simulation_runs where id = r.run_id),
    'ipca', (select coalesce(jsonb_object_agg(to_char(date, 'YYYY-MM'), value / 100), '{}'::jsonb)
               from public.market_series where series_code = 'ipca'));
end
$$;

-- Grava um cenário rodado pela função do servidor (hipóteses, nome e resultado com o hash das entradas).
create function public.record_report_scenario(p_report uuid, p_actor uuid, p_scenario jsonb)
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
  if coalesce(p_scenario ->> 'id', '') !~ '^[0-9a-f-]{36}$' or length(coalesce(p_scenario ->> 'name', '')) not between 1 and 200
     or jsonb_typeof(p_scenario -> 'params') is distinct from 'object'
     or jsonb_typeof(p_scenario -> 'probability') is distinct from 'number'
     or (p_scenario ->> 'probability')::numeric not between 0 and 1
     or jsonb_typeof(p_scenario -> 'requiredReturn') not in ('number', 'null')
     or coalesce(p_scenario ->> 'requiredReturnStatus', '') not in ('ok', 'folga_total', 'inviavel')
     or coalesce(p_scenario ->> 'inputsHash', '') = ''
     or (p_scenario ->> 'seed')::bigint is distinct from v_seed
     or coalesce((p_scenario ->> 'paths')::integer, 0) < 1000 then
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

-- Onde guardar o PDF de uma versão aprovada (a função do servidor envia o arquivo para lá antes de anexar).
create function public.report_pdf_target(p_report uuid, p_actor uuid)
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
  return jsonb_build_object('path', format('%s/%s/v%s.pdf', r.household_id, r.ref_date, r.version));
end
$$;

-- Anexa o PDF guardado: confere que o arquivo está na pasta, com o tamanho informado, e grava o hash.
create function public.attach_report_pdf(p_report uuid, p_actor uuid, p_sha256 text, p_size integer)
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
  v_path := format('%s/%s/v%s.pdf', r.household_id, r.ref_date, r.version);
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

-- Textos legais (compliance) ----------------------------------------------------------------------------------------

-- Cada texto: a versão aprovada e o rascunho, se houver. A equipe interna lê; a compliance escreve e aprova.
create function public.legal_texts_overview()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para ver os textos legais.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  if not app.is_internal() then
    raise exception 'Sem permissão para ver os textos legais.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'key', k.key,
      'in_report', k.key = any (app.report_legal_keys()),
      'approved', (select jsonb_build_object('id', t.id, 'version', t.version, 'body', t.body, 'approved_at', t.approved_at,
                                             'approved_by_email', (select email from auth.users where id = t.approved_by))
                     from public.legal_texts t where t.key = k.key and t.status = 'aprovado'),
      'draft', (select jsonb_build_object('id', t.id, 'version', t.version, 'body', t.body, 'created_at', t.created_at,
                                          'created_by_email', (select email from auth.users where id = t.created_by))
                  from public.legal_texts t where t.key = k.key and t.status = 'rascunho')) order by k.key), '[]'::jsonb)
    from (select distinct key from public.legal_texts) k);
end
$$;

-- Rascunho de uma versão nova (ou o rascunho em aberto, reescrito). O rodapé do relatório leva os campos [mês] e [versão].
create function public.save_legal_text(p_key text, p_body text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v text := trim(coalesce(p_body, ''));
  d public.legal_texts;
  v_id uuid;
  v_version integer;
begin
  perform app.require_role('compliance', 'escrever textos legais');
  if not exists (select 1 from public.legal_texts where key = p_key) then
    raise exception 'Texto legal desconhecido: %.', p_key using errcode = 'P0002', hint = 'texto_inexistente';
  end if;
  if length(v) < 10 or length(v) > 3000 then
    raise exception 'O texto tem de 10 a 3.000 caracteres.' using errcode = '22023', hint = 'texto_invalido';
  end if;
  if p_key = 'rodape_relatorio' and (position('[mês]' in v) = 0 or position('[versão]' in v) = 0) then
    raise exception 'O rodapé do relatório precisa dos campos [mês] e [versão].' using errcode = '22023', hint = 'texto_invalido';
  end if;
  if exists (select 1 from public.legal_texts where key = p_key and status = 'aprovado' and body = v) then
    raise exception 'É o texto já aprovado: nada a mudar.' using errcode = '22023', hint = 'texto_igual';
  end if;
  select * into d from public.legal_texts where key = p_key and status = 'rascunho' for update;
  if found then
    update public.legal_texts set body = v where id = d.id;
    v_id := d.id;
    v_version := d.version;
  else
    select coalesce(max(version), 0) + 1 into v_version from public.legal_texts where key = p_key;
    insert into public.legal_texts (key, version, body) values (p_key, v_version, v) returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id, 'key', p_key, 'version', v_version);
end
$$;

-- Aprova o rascunho; a versão aprovada antes fica arquivada.
create function public.approve_legal_text(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare d public.legal_texts;
begin
  perform app.require_role('compliance', 'aprovar textos legais');
  select * into d from public.legal_texts where id = p_id for update;
  if not found or d.status <> 'rascunho' then
    raise exception 'Só um rascunho de texto legal é aprovado.' using errcode = 'P0001', hint = 'texto_status';
  end if;
  update public.legal_texts set status = 'arquivado' where key = d.key and status = 'aprovado';
  update public.legal_texts set status = 'aprovado', approved_by = auth.uid(), approved_at = now() where id = d.id;
  perform app.audit('aprovar_texto_legal', 'legal_texts', d.id::text, null, jsonb_build_object('chave', d.key, 'versao', d.version));
  return jsonb_build_object('id', d.id, 'key', d.key, 'version', d.version, 'status', 'aprovado');
end
$$;

-- Apaga o rascunho de um texto legal (a versão aprovada fica).
create function public.discard_legal_text(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare d public.legal_texts;
begin
  perform app.require_role('compliance', 'descartar textos legais');
  select * into d from public.legal_texts where id = p_id for update;
  if not found or d.status <> 'rascunho' then
    raise exception 'Só um rascunho de texto legal é descartado.' using errcode = 'P0001', hint = 'texto_status';
  end if;
  delete from public.legal_texts where id = d.id;
  return jsonb_build_object('id', d.id, 'key', d.key);
end
$$;

-- Trilha de auditoria (compliance e comitê) ----------------------------------------------------------------------------

-- Registros de um período (datas no horário de Brasília, até um ano), mais recentes primeiro, com quem fez e a família.
-- O snapshot dos relatórios fica de fora (ele está no próprio relatório, que não muda). A leitura também é registrada.
create function public.audit_trail(p_from date, p_to date, p_household uuid default null, p_action text default null,
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
         'details', case when a.target_table = 'reports' then a.details - 'snapshot' else a.details end) as row
         from public.audit_log a
         left join auth.users u on u.id = a.actor_id
         left join public.households h on h.id = a.household_id
        where (a.at at time zone 'America/Sao_Paulo')::date between p_from and p_to
          and (p_household is null or a.household_id = p_household)
          and (p_action is null or a.action = p_action)
        order by a.at desc, a.id desc
        limit p_limit) x),
    'actions', (select coalesce(jsonb_agg(distinct a.action order by a.action), '[]'::jsonb) from public.audit_log a
                 where (a.at at time zone 'America/Sao_Paulo')::date between p_from and p_to));
end
$$;

-- Pasta privada dos PDFs: só a função do servidor (chave do servidor) envia e gera os links de download.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('relatorios', 'relatorios', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Permissões ----------------------------------------------------------------------------------------------------------

revoke all on function app.discard_stale_reports(), app.report_legal_keys(), app.report_texts_ready(), app.report_texts_current(jsonb),
  app.can_read_report(uuid, public.report_status), app.report_summary(public.reports),
  app.open_report(uuid, public.report_status[], boolean, text), app.check_report_month(uuid, date) from public;
revoke all on function public.report_months(date), public.report_detail(uuid), public.save_report_comment(uuid, text),
  public.remove_report_scenario(uuid, text), public.submit_report(uuid), public.return_report(uuid, text),
  public.discard_report(uuid, text), public.approve_report(uuid), public.present_report(uuid, text, date),
  public.report_pdf_access(uuid), public.report_permission(), public.report_inputs(uuid, date, uuid),
  public.record_report_draft(uuid, date, uuid, uuid, jsonb, text), public.report_scenario_inputs(uuid, uuid),
  public.record_report_scenario(uuid, uuid, jsonb), public.report_pdf_target(uuid, uuid), public.attach_report_pdf(uuid, uuid, text, integer),
  public.legal_texts_overview(), public.save_legal_text(text, text), public.approve_legal_text(uuid), public.discard_legal_text(uuid),
  public.audit_trail(date, date, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.report_months(date), public.report_detail(uuid), public.save_report_comment(uuid, text),
  public.remove_report_scenario(uuid, text), public.submit_report(uuid), public.return_report(uuid, text),
  public.discard_report(uuid, text), public.approve_report(uuid), public.present_report(uuid, text, date),
  public.report_pdf_access(uuid), public.report_permission(), public.legal_texts_overview(), public.save_legal_text(text, text),
  public.approve_legal_text(uuid), public.discard_legal_text(uuid), public.audit_trail(date, date, uuid, text, integer) to authenticated;
grant execute on function public.report_inputs(uuid, date, uuid), public.record_report_draft(uuid, date, uuid, uuid, jsonb, text),
  public.report_scenario_inputs(uuid, uuid), public.record_report_scenario(uuid, uuid, jsonb), public.report_pdf_target(uuid, uuid),
  public.attach_report_pdf(uuid, uuid, text, integer) to service_role;
