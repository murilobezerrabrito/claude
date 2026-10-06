-- AWARE Objective, Fase 2, etapa 2: conferência, mapeamento de ativos e fechamento do mês (SPEC, "Fluxo do mês",
-- "Importação mensal das posições" e "Dados mensais por canal").
-- Conferência, família por família:
-- - bloqueia: sem posições, ativo sem classe (fila do comitê), classe fora das premissas vigentes, falta do dólar,
--   falta do PL oficial, soma das posições fora de 0,01% do PL, família sem plano e rentabilidade real fora de
--   −10% a +10% sem a confirmação de quem importou;
-- - avisa: plano com mais de 12 meses, mês sem aportes nem resgates, possível transferência entre contas, primeiro mês
--   (sem rentabilidade), movimento sem data (datas aproximadas) e falta do IPCA (a faixa é conferida no retorno nominal).
-- Fechamento: o canal fecha as famílias já rodadas; as outras ficam de fora, com aviso, e podem fechar depois.
-- A rentabilidade do mês usa o PL do mês anterior: mudar o mês anterior (importação, PL ou classe) reabre o seguinte.

-- Mês que nasce, ou que volta para "importado", ou cujo PL muda: o mês seguinte da família, se ainda não fechado,
-- volta para "importado" (e assim por diante), porque a rentabilidade dele partia deste.
create function app.reset_next_month() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.official_pl is distinct from old.official_pl
     or (new.status = 'importado' and old.status <> 'importado') then
    update public.household_months
       set status = 'importado', checks = null, return_confirmed_by = null, return_confirmed_at = null
     where household_id = new.household_id and ref_date = app.month_end_of(new.ref_date + 1)
       and status in ('conferido', 'bloqueado', 'rodado');
  end if;
  return null;
end
$$;

create trigger reabre_o_mes_seguinte
  after insert or update on public.household_months
  for each row execute function app.reset_next_month();

-- Porcentagem em português (vírgula decimal e sinal de menos tipográfico).
create function app.pct(x numeric, decimals integer) returns text
language sql immutable
set search_path = ''
as $$
  select replace(replace(to_char(round(x * 100, decimals),
                                 'FM999999990' || case when decimals > 0 then '.' || repeat('0', decimals) else '' end),
                         '.', ','), '-', '−') || '%'
$$;

-- Conferência de uma família no mês. Converte as posições e os movimentos em dólar, grava o resultado em
-- household_months.checks e o status (conferido ou bloqueado). Sem conferir quem chama: só as funções da API a usam.
create function app.check_household_month(p_household uuid, p_ref date) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  m public.household_months;
  h public.households;
  v_items jsonb := '[]'::jsonb;
  v_blocked boolean := false;
  v_count integer;
  v_cma uuid;
  v_list text;
  v_needs_usd boolean;
  v_rate numeric;
  v_rate_date date;
  v_total numeric;
  v_missing_brl boolean;
  v_plan_count integer;
  v_last_revision timestamptz;
  v_prev public.household_months;
  v_days integer := extract(day from p_ref)::integer;
  v_net numeric;
  v_weighted numeric;
  v_approx boolean;
  v_base numeric;
  v_nominal numeric;
  v_real numeric;
  v_ipca numeric;
  v_check numeric;
  v_checks jsonb;
  v_status public.month_status;
begin
  select * into m from public.household_months where household_id = p_household and ref_date = p_ref for update;
  if not found then
    raise exception 'Nada importado para esta família no mês.' using errcode = 'P0002', hint = 'mes_sem_importacao';
  end if;
  if m.status not in ('importado', 'conferido', 'bloqueado') then
    raise exception 'O mês desta família está %; a conferência é antes da rodada.', m.status using errcode = 'P0001', hint = 'mes_status';
  end if;
  select * into h from public.households where id = p_household;

  -- Posições e classes.
  select count(*) into v_count from public.positions where household_id = p_household and ref_date = p_ref;
  if v_count = 0 then
    v_items := v_items || jsonb_build_object('code', 'sem_posicoes', 'level', 'bloqueio', 'message', 'Nenhuma posição importada no mês.');
    v_blocked := true;
  end if;
  select id into v_cma from public.cma_versions where status = 'vigente';
  if v_cma is null then
    v_items := v_items || jsonb_build_object('code', 'sem_premissas', 'level', 'bloqueio', 'message', 'Não há premissas vigentes para conferir as classes.');
    v_blocked := true;
  end if;
  select string_agg(distinct a.asset_code, ', ') into v_list
    from public.positions p join public.assets a on a.id = p.asset_id
   where p.household_id = p_household and p.ref_date = p_ref and a.class_code is null;
  if v_list is not null then
    v_items := v_items || jsonb_build_object('code', 'ativo_sem_classe', 'level', 'bloqueio',
                 'message', format('Ativos sem classe, na fila de mapeamento do comitê: %s.', v_list));
    v_blocked := true;
  end if;
  if v_cma is not null then
    select string_agg(distinct a.asset_code || ' (' || a.class_code || ')', ', ') into v_list
      from public.positions p join public.assets a on a.id = p.asset_id
     where p.household_id = p_household and p.ref_date = p_ref and a.class_code is not null
       and not exists (select 1 from public.cma_classes c where c.cma_version_id = v_cma and c.class_code = a.class_code);
    if v_list is not null then
      v_items := v_items || jsonb_build_object('code', 'classe_fora_das_premissas', 'level', 'bloqueio',
                   'message', format('Ativos com classe que não existe nas premissas vigentes: %s.', v_list));
      v_blocked := true;
    end if;
  end if;

  -- Conversão para reais pelo dólar de venda da data de referência (ou do último dia com cotação até 5 dias antes).
  v_needs_usd := exists (select 1 from public.positions where household_id = p_household and ref_date = p_ref and currency = 'USD')
              or exists (select 1 from public.flows where household_id = p_household and ref_date = p_ref and currency = 'USD');
  select r.rate, r.rate_date into v_rate, v_rate_date from app.usd_rate(p_ref) r;
  if v_needs_usd and v_rate is null then
    v_items := v_items || jsonb_build_object('code', 'sem_dolar', 'level', 'bloqueio',
                 'message', format('Falta o dólar de venda do Banco Central de %s (ou de até 5 dias antes).', to_char(p_ref, 'DD/MM/YYYY')));
    v_blocked := true;
  end if;
  -- Só as linhas que mudam (a auditoria grava cada uma); sem cotação, os valores em dólar ficam sem reais.
  update public.positions p
     set fx_rate = case p.currency when 'BRL' then 1 else v_rate end,
         net_value_brl = round(p.net_value * case p.currency when 'BRL' then 1 else v_rate end, 2)
   where p.household_id = p_household and p.ref_date = p_ref
     and (p.fx_rate is distinct from case p.currency when 'BRL' then 1 else v_rate end
          or p.net_value_brl is distinct from round(p.net_value * case p.currency when 'BRL' then 1 else v_rate end, 2));
  update public.flows f
     set fx_rate = case f.currency when 'BRL' then 1 else v_rate end,
         amount_brl = round(f.amount * case f.currency when 'BRL' then 1 else v_rate end, 2)
   where f.household_id = p_household and f.ref_date = p_ref
     and (f.fx_rate is distinct from case f.currency when 'BRL' then 1 else v_rate end
          or f.amount_brl is distinct from round(f.amount * case f.currency when 'BRL' then 1 else v_rate end, 2));

  -- PL oficial e a soma das posições, com tolerância de 0,01%.
  select sum(net_value_brl), bool_or(net_value_brl is null) into v_total, v_missing_brl
    from public.positions where household_id = p_household and ref_date = p_ref;
  if v_missing_brl then
    v_total := null;
  end if;
  if m.official_pl is null then
    v_items := v_items || jsonb_build_object('code', 'sem_pl', 'level', 'bloqueio', 'message', 'Falta o PL oficial do extrato do mês.');
    v_blocked := true;
  elsif v_total is not null and abs(v_total - m.official_pl) > 0.0001 * m.official_pl then
    v_items := v_items || jsonb_build_object('code', 'pl_nao_confere', 'level', 'bloqueio',
                 'message', format('A soma das posições não bate com o PL oficial: diferença de %s, acima da tolerância de 0,01%%. A família fica fora do fechamento até a diferença ser resolvida.',
                                   app.pct(abs(v_total - m.official_pl) / m.official_pl, 3)));
    v_blocked := true;
  end if;

  -- Plano: precisa existir; revisado nos últimos 12 meses (se não, só aviso).
  select count(*) filter (where base_month <= date_trunc('month', p_ref)), max(created_at)
    into v_plan_count, v_last_revision
    from public.plan_versions where household_id = p_household;
  if v_plan_count = 0 then
    v_items := v_items || jsonb_build_object('code', 'sem_plano', 'level', 'bloqueio', 'message', 'A família não tem plano em vigor no mês.');
    v_blocked := true;
  elsif v_last_revision < p_ref - interval '12 months' then
    v_items := v_items || jsonb_build_object('code', 'plano_antigo', 'level', 'aviso',
                 'message', format('O plano não é revisado desde %s: mais de 12 meses.', to_char(v_last_revision, 'DD/MM/YYYY')));
  end if;

  -- Aportes e resgates.
  if not exists (select 1 from public.flows where household_id = p_household and ref_date = p_ref) then
    v_items := v_items || jsonb_build_object('code', 'sem_movimentos', 'level', 'aviso', 'message', 'Nenhum aporte ou resgate importado no mês. Confira se é isso mesmo.');
  end if;
  select string_agg(distinct to_char(a.flow_date, 'DD/MM/YYYY'), ', ') into v_list
    from public.flows a join public.flows b
      on b.household_id = a.household_id and b.ref_date = a.ref_date and b.flow_date = a.flow_date
     and b.currency = a.currency and b.amount = a.amount and b.kind = 'resgate'
   where a.household_id = p_household and a.ref_date = p_ref and a.kind = 'aporte';
  if v_list is not null then
    v_items := v_items || jsonb_build_object('code', 'possivel_transferencia', 'level', 'aviso',
                 'message', format('Aporte e resgate do mesmo valor em %s: parece transferência entre contas da família, que não conta como aporte nem resgate.', v_list));
  end if;

  -- Rentabilidade do mês (Dietz modificado, como monthReturn em src/report): precisa do mês anterior conferido. Sem
  -- mês anterior, é o primeiro mês (aviso); com o mês anterior ainda não conferido, a faixa não pode ser conferida.
  select * into v_prev from public.household_months
   where household_id = p_household and ref_date = (date_trunc('month', p_ref) - interval '1 day')::date;
  if v_prev.household_id is null then
    v_items := v_items || jsonb_build_object('code', 'primeiro_mes', 'level', 'aviso',
                 'message', 'Primeiro mês importado: a rentabilidade do mês não é calculada.');
  elsif v_prev.status not in ('conferido', 'rodado', 'fechado') or v_prev.official_pl is null then
    v_items := v_items || jsonb_build_object('code', 'mes_anterior_pendente', 'level', 'bloqueio',
                 'message', format('O mês anterior (%s) ainda não foi conferido: confira-o antes, para calcular a rentabilidade deste mês.',
                                   to_char(v_prev.ref_date, 'MM/YYYY')));
    v_blocked := true;
    v_prev := null;
  elsif m.official_pl is not null and not exists (
          select 1 from public.flows where household_id = p_household and ref_date = p_ref and amount_brl is null) then
    select coalesce(sum(case kind when 'aporte' then amount_brl else -amount_brl end), 0),
           coalesce(sum(case kind when 'aporte' then amount_brl else -amount_brl end
                        * case when flow_date is null then 0.5
                               else (v_days - extract(day from flow_date))::numeric / v_days end), 0),
           coalesce(bool_or(flow_date is null), false)
      into v_net, v_weighted, v_approx
      from public.flows where household_id = p_household and ref_date = p_ref;
    if v_approx then
      v_items := v_items || jsonb_build_object('code', 'datas_aproximadas', 'level', 'aviso',
                   'message', 'Movimento sem data: a rentabilidade conta no meio do mês e sai marcada como "datas aproximadas".');
    end if;
    v_base := v_prev.official_pl + v_weighted;
    if v_base <= 0 then
      v_items := v_items || jsonb_build_object('code', 'sem_base', 'level', 'aviso',
                   'message', 'O patrimônio médio do mês não é positivo: a rentabilidade não é calculada.');
    else
      v_nominal := (m.official_pl - v_prev.official_pl - v_net) / v_base;
      select s.value / 100 into v_ipca from public.market_series s
       where s.series_code = 'ipca' and s.date = date_trunc('month', p_ref)::date;
      if v_ipca is null then
        v_items := v_items || jsonb_build_object('code', 'sem_ipca', 'level', 'aviso',
                     'message', 'Falta o IPCA do mês: a faixa de −10% a +10% foi conferida no retorno nominal.');
        v_check := v_nominal;
      else
        v_real := (1 + v_nominal) / (1 + v_ipca) - 1;
        v_check := v_real;
      end if;
      if v_check < -0.10 or v_check > 0.10 then
        if m.return_confirmed_by is not null then
          v_items := v_items || jsonb_build_object('code', 'rentabilidade_confirmada', 'level', 'aviso',
                       'message', format('Rentabilidade de %s no mês, fora da faixa de −10%% a +10%%, confirmada por quem importou.', app.pct(v_check, 2)));
        else
          v_items := v_items || jsonb_build_object('code', 'rentabilidade_fora_da_faixa', 'level', 'bloqueio',
                       'message', format('Rentabilidade de %s no mês, fora da faixa de −10%% a +10%%: quem importou precisa confirmar os números.', app.pct(v_check, 2)));
          v_blocked := true;
        end if;
      end if;
    end if;
  end if;

  v_status := case when v_blocked then 'bloqueado' else 'conferido' end;
  v_checks := jsonb_build_object(
    'items', v_items, 'positions_total', v_total, 'official_pl', m.official_pl,
    'difference', case when v_total is not null and m.official_pl is not null then v_total - m.official_pl end,
    'usd_rate', v_rate, 'usd_rate_date', v_rate_date, 'start_value', v_prev.official_pl,
    'nominal_return', v_nominal, 'real_return', v_real, 'ipca', v_ipca, 'approximate_dates', v_approx,
    'checked_at', now(), 'checked_by', auth.uid());
  update public.household_months set status = v_status, checks = v_checks
   where household_id = p_household and ref_date = p_ref;
  return jsonb_build_object('household_id', p_household, 'code', h.code, 'name', h.name, 'channel', h.channel,
                            'status', v_status, 'checks', v_checks);
end
$$;

-- Conferência do mês: todas as famílias importadas que ainda não rodaram, ou só uma. Só a gestão confere.
create function public.check_month(p_ref_date date, p_household uuid default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_results jsonb := '[]'::jsonb;
  hm record;
begin
  perform app.require_role('gestao', 'conferir o mês');
  if p_ref_date is null or p_ref_date <> app.month_end_of(p_ref_date) then
    raise exception 'Use o último dia do mês como data de referência.' using errcode = '22023', hint = 'data_referencia';
  end if;
  for hm in
    select m.household_id from public.household_months m join public.households h on h.id = m.household_id
     where m.ref_date = p_ref_date and (p_household is null or m.household_id = p_household)
       and (p_household is not null or m.status in ('importado', 'conferido', 'bloqueado'))
     order by h.code
  loop
    v_results := v_results || app.check_household_month(hm.household_id, p_ref_date);
  end loop;
  if p_household is not null and jsonb_array_length(v_results) = 0 then
    raise exception 'Nada importado para esta família no mês.' using errcode = 'P0002', hint = 'mes_sem_importacao';
  end if;
  perform app.audit('conferir_mes', 'household_months', p_ref_date::text, p_household,
                    jsonb_build_object('familias', jsonb_array_length(v_results),
                                       'bloqueadas', (select count(*) from jsonb_array_elements(v_results) r where r ->> 'status' = 'bloqueado')));
  return case when app.can_see_amounts() then v_results else app.mask_amounts(v_results) end;
end
$$;

-- Quem importou confirma a rentabilidade fora da faixa (SPEC, "Dados mensais por canal"); a conferência é refeita.
create function public.confirm_return(p_household uuid, p_ref_date date)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  m public.household_months;
  v_result jsonb;
begin
  perform app.require_role('gestao', 'confirmar a rentabilidade');
  select * into m from public.household_months where household_id = p_household and ref_date = p_ref_date for update;
  if not found or m.status <> 'bloqueado'
     or not coalesce(m.checks -> 'items' @> '[{"code": "rentabilidade_fora_da_faixa"}]'::jsonb, false) then
    raise exception 'Não há rentabilidade fora da faixa para confirmar nesta família e mês.' using errcode = 'P0001', hint = 'sem_rentabilidade_para_confirmar';
  end if;
  if not exists (
       select 1 from public.import_batches b
        where b.id in (select batch_id from public.positions where household_id = p_household and ref_date = p_ref_date
                       union select batch_id from public.flows where household_id = p_household and ref_date = p_ref_date)
          and auth.uid() in (b.uploaded_by, b.confirmed_by)) then
    raise exception 'Só quem importou o mês desta família confirma a rentabilidade fora da faixa.' using errcode = '42501', hint = 'quem_importou';
  end if;
  update public.household_months set return_confirmed_by = auth.uid(), return_confirmed_at = now()
   where household_id = p_household and ref_date = p_ref_date;
  perform app.audit('confirmar_rentabilidade', 'household_months', p_ref_date::text, p_household,
                    jsonb_build_object('retorno', coalesce(m.checks -> 'real_return', m.checks -> 'nominal_return')));
  v_result := app.check_household_month(p_household, p_ref_date);
  return case when app.can_see_amounts() then v_result else app.mask_amounts(v_result) end;
end
$$;

-- Fila de mapeamento: ativos sem classe, com o número de famílias à espera e uma sugestão quando o ISIN ou o CNPJ é
-- igual ao de um ativo já mapeado (nunca aplicada sozinha). Traz as classes das premissas vigentes.
create function public.unmapped_assets()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para ver a fila de mapeamento.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  if not app.is_internal() then
    raise exception 'Sem permissão para ver a fila de mapeamento.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  return jsonb_build_object(
    'assets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'asset_code', a.asset_code, 'name', a.name, 'isin', a.isin, 'cnpj', a.cnpj, 'currency', a.currency,
               'families_waiting', (select count(distinct p.household_id) from public.positions p
                                      join public.household_months m on m.household_id = p.household_id and m.ref_date = p.ref_date
                                     where p.asset_id = a.id and m.status <> 'fechado'),
               'suggestion', (select jsonb_build_object('asset_code', b.asset_code, 'class_code', b.class_code,
                                                        'by', case when a.isin is not null and b.isin = a.isin then 'isin' else 'cnpj' end)
                                from public.assets b
                               where b.id <> a.id and b.class_code is not null
                                 and ((a.isin is not null and b.isin = a.isin) or (a.cnpj is not null and b.cnpj = a.cnpj))
                               order by b.asset_code limit 1))
             order by a.asset_code)
        from public.assets a where a.class_code is null), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object('class_code', c.class_code, 'name', c.name) order by c.class_code)
        from public.cma_classes c join public.cma_versions v on v.id = c.cma_version_id where v.status = 'vigente'), '[]'::jsonb));
end
$$;

-- O comitê dá (ou corrige) a classe de um ativo. A classe precisa existir nas premissas vigentes. As famílias com o
-- ativo em meses ainda não fechados voltam para "importado".
create function public.map_asset(p_asset uuid, p_class_code text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  a public.assets;
  v_reset integer;
begin
  perform app.require_role('comite', 'mapear ativos');
  select * into a from public.assets where id = p_asset for update;
  if not found then
    raise exception 'Ativo não encontrado.' using errcode = 'P0002', hint = 'ativo';
  end if;
  if not exists (select 1 from public.cma_classes c join public.cma_versions v on v.id = c.cma_version_id
                  where v.status = 'vigente' and c.class_code = p_class_code) then
    raise exception 'A classe % não existe nas premissas vigentes.', p_class_code using errcode = 'P0001', hint = 'classe';
  end if;
  update public.assets set class_code = p_class_code, mapped_by = auth.uid(), mapped_at = now() where id = p_asset;
  with affected as (
    select distinct p.household_id, p.ref_date from public.positions p where p.asset_id = p_asset
  )
  update public.household_months m set status = 'importado', checks = null
    from affected x
   where m.household_id = x.household_id and m.ref_date = x.ref_date
     and m.status in ('conferido', 'bloqueado', 'rodado');
  get diagnostics v_reset = row_count;
  perform app.audit('mapear_ativo', 'assets', p_asset::text, null,
                    jsonb_build_object('ativo', a.asset_code, 'antes', a.class_code, 'depois', p_class_code, 'meses_reabertos', v_reset));
  return jsonb_build_object('asset_code', a.asset_code, 'class_code', p_class_code, 'months_reset', v_reset);
end
$$;

-- Situação do mês: famílias (com as que ainda não chegaram), conferência, fechamento do canal e lotes. Gestão,
-- comitê e compliance veem todas; banker e responsável, as suas. Grava a leitura e esconde valores de quem não os vê.
create function public.month_overview(p_ref_date date, p_channel public.channel default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para ver o mês.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  if not (app.is_internal() or app.has_role('banker') or app.has_role('responsavel')) then
    raise exception 'Sem permissão para ver o mês.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  perform app.audit('ver_mes', 'household_months', p_ref_date::text, null, jsonb_build_object('canal', p_channel));
  select jsonb_build_object(
    'ref_date', p_ref_date,
    'families', coalesce((
      select jsonb_agg(jsonb_build_object(
               'household_id', h.id, 'code', h.code, 'name', h.name, 'channel', h.channel,
               'status', coalesce(m.status::text, 'pendente'), 'official_pl', m.official_pl, 'checks', m.checks,
               'return_confirmed_by', m.return_confirmed_by,
               'positions', (select count(*) from public.positions p where p.household_id = h.id and p.ref_date = p_ref_date),
               'flows', (select count(*) from public.flows f where f.household_id = h.id and f.ref_date = p_ref_date))
             order by h.channel, h.code)
        from public.households h
        left join public.household_months m on m.household_id = h.id and m.ref_date = p_ref_date
       where (p_channel is null or h.channel = p_channel) and app.can_read_household(h.id)
         and (h.status = 'ativa' or m.household_id is not null)), '[]'::jsonb),
    'closings', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.channel) from public.month_closings c
       where c.ref_date = p_ref_date and (p_channel is null or c.channel = p_channel)), '[]'::jsonb),
    'batches', case when app.is_internal() then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'kind', b.kind, 'file_name', b.file_name, 'status', b.status, 'rows', b.row_count,
               'total_value', b.total_value, 'official_total', b.official_total, 'uploaded_by', b.uploaded_by,
               'created_at', b.created_at, 'confirmed_by', b.confirmed_by, 'confirmed_at', b.confirmed_at)
             order by b.created_at)
        from public.import_batches b where b.ref_date = p_ref_date), '[]'::jsonb) else '[]'::jsonb end)
    into result;
  return case when app.can_see_amounts() then result else app.mask_amounts(result) end;
end
$$;

-- Fecha o mês de um canal: as famílias já rodadas passam a fechadas; as outras ficam de fora, com aviso.
create function public.close_month(p_ref_date date, p_channel public.channel)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.month_closings;
  v_closed jsonb;
  v_left jsonb;
begin
  perform app.require_role('gestao', 'fechar o mês');
  select * into c from public.month_closings where ref_date = p_ref_date and channel = p_channel for update;
  if not found then
    raise exception 'Nada importado neste mês para o canal.' using errcode = 'P0002', hint = 'mes_sem_importacao';
  end if;
  if c.status = 'fechado' then
    raise exception 'O mês já está fechado para o canal.' using errcode = 'P0001', hint = 'mes_fechado';
  end if;
  with closed as (
    update public.household_months m set status = 'fechado'
      from public.households h
     where h.id = m.household_id and h.channel = p_channel and m.ref_date = p_ref_date and m.status = 'rodado'
    returning h.code
  )
  select jsonb_agg(code order by code) into v_closed from closed;
  if v_closed is null then
    raise exception 'Nenhuma família rodada para fechar no canal.' using errcode = 'P0001', hint = 'nada_para_fechar';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('code', h.code, 'status', coalesce(m.status::text, 'pendente')) order by h.code), '[]'::jsonb)
    into v_left
    from public.households h
    left join public.household_months m on m.household_id = h.id and m.ref_date = p_ref_date
   where h.channel = p_channel and coalesce(m.status::text, 'pendente') <> 'fechado'
     and (h.status = 'ativa' or m.household_id is not null);
  update public.month_closings set status = 'fechado', closed_by = auth.uid(), closed_at = now()
   where ref_date = p_ref_date and channel = p_channel;
  perform app.audit('fechar_mes', 'month_closings', p_ref_date::text, null,
                    jsonb_build_object('canal', p_channel, 'fechadas', v_closed, 'de_fora', v_left));
  return jsonb_build_object('ref_date', p_ref_date, 'channel', p_channel, 'closed', v_closed, 'left_out', v_left);
end
$$;

-- Fecha uma família já rodada, inclusive depois do fechamento do canal (família que atrasou).
create function public.close_household_month(p_household uuid, p_ref_date date)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare m public.household_months;
begin
  perform app.require_role('gestao', 'fechar o mês');
  select * into m from public.household_months where household_id = p_household and ref_date = p_ref_date for update;
  if not found or m.status <> 'rodado' then
    raise exception 'Só família rodada no mês pode ser fechada.' using errcode = 'P0001', hint = 'mes_status';
  end if;
  update public.household_months set status = 'fechado' where household_id = p_household and ref_date = p_ref_date;
  perform app.audit('fechar_mes_familia', 'household_months', p_ref_date::text, p_household, null);
  return jsonb_build_object('household_id', p_household, 'ref_date', p_ref_date, 'status', 'fechado');
end
$$;

revoke all on function app.pct(numeric, integer), app.check_household_month(uuid, date), app.reset_next_month() from public;
revoke all on function public.check_month(date, uuid), public.confirm_return(uuid, date), public.unmapped_assets(),
  public.map_asset(uuid, text), public.month_overview(date, public.channel), public.close_month(date, public.channel),
  public.close_household_month(uuid, date) from public, anon;
grant execute on function public.check_month(date, uuid), public.confirm_return(uuid, date), public.unmapped_assets(),
  public.map_asset(uuid, text), public.month_overview(date, public.channel), public.close_month(date, public.channel),
  public.close_household_month(uuid, date) to authenticated;
