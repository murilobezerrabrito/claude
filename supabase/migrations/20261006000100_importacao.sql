-- AWARE Objective, Fase 2, etapa 2: importação das posições e dos aportes e resgates do mês (SPEC, "Importação
-- mensal das posições", "Aportes e resgates" e "Dados mensais por canal").
-- Regras:
-- - A planilha é lida no navegador do console (src/import) e chega aqui como linhas; o banco valida tudo de novo.
-- - Prévia antes de confirmar: a prévia fica numa área fechada (app.import_staging) e a confirmação grava exatamente
--   o que foi visto, tudo ou nada. Só a gestão importa, sempre com o segundo fator.
-- - Reimportar substitui só as famílias do arquivo novo, no mesmo mês e tipo; as linhas apagadas ficam na auditoria.
-- - Família fechada no mês não muda mais: posições, movimentos e PL ficam travados por gatilho.
-- - Status da família no mês: importado → conferido ou bloqueado → rodado (etapa 3) → fechado. Reimportar, mudar o
--   PL ou mapear um ativo volta para importado.

-- Colunas novas ---------------------------------------------------------------------------------------------------

-- Conversão para reais na conferência: dólar de venda do Banco Central na data de referência (BRL usa 1).
alter table public.positions
  add column fx_rate numeric(20, 8),
  add column net_value_brl numeric(18, 2);
alter table public.flows
  add column fx_rate numeric(20, 8),
  add column amount_brl numeric(18, 2);

-- Resultado da última conferência e a confirmação da rentabilidade fora da faixa por quem importou.
alter table public.household_months
  add column checks jsonb,
  add column return_confirmed_by uuid references auth.users (id),
  add column return_confirmed_at timestamptz;

-- Quem confirmou a importação (quem fez a prévia fica em uploaded_by).
alter table public.import_batches
  add column confirmed_by uuid references auth.users (id),
  add column confirmed_at timestamptz;

-- Prévia ainda não confirmada: linhas já validadas e o resumo mostrado. Ninguém lê direto; só as funções abaixo.
create table app.import_staging (
  batch_id uuid primary key references public.import_batches (id) on delete cascade,
  rows jsonb not null,
  preview jsonb not null
);
alter table app.import_staging enable row level security;
revoke all on app.import_staging from public, anon, authenticated;

-- Lotes e mapeamento só pela API -----------------------------------------------------------------------------------
-- Os lotes trazem totais em reais: a equipe interna os vê pela API (month_overview), com registro e máscara.
-- O mapeamento de ativos passa por map_asset, que confere a classe nas premissas vigentes e reabre a conferência.
drop policy interna_le_lotes on public.import_batches;
drop policy comite_mapeia_ativos on public.assets;

-- Funções auxiliares -----------------------------------------------------------------------------------------------

-- Número decimal com ponto (as linhas chegam normalizadas por src/import); outro formato vira nulo.
create function app.dec(t text) returns numeric
language sql immutable
set search_path = ''
as $$ select case when t ~ '^-?[0-9]+(\.[0-9]+)?$' then t::numeric end $$;

-- Data AAAA-MM-DD válida no calendário; outro formato vira nulo.
create function app.try_date(t text) returns date
language plpgsql immutable
set search_path = ''
as $$
begin
  if t is null or t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  return t::date;
exception when others then
  return null;
end
$$;

-- Último dia do mês da data.
create function app.month_end_of(d date) returns date
language sql immutable
set search_path = ''
as $$ select (date_trunc('month', d) + interval '1 month - 1 day')::date $$;

-- Dólar de venda do Banco Central (série 1, `dolar` em market_series) na data ou no último dia com cotação até 5
-- dias antes (fim de semana e feriado). Nulo se não houver.
create function app.usd_rate(p_date date, out rate numeric, out rate_date date)
language sql stable
set search_path = ''
as $$
  select s.value, s.date from public.market_series s
   where s.series_code = 'dolar' and s.date between p_date - 5 and p_date
   order by s.date desc limit 1
$$;

-- Exige o segundo fator e o papel; sem eles, a função da API recusa com permissão negada.
create function app.require_role(r public.app_role, p_what text) returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para %.', p_what using errcode = '42501', hint = 'segundo_fator';
  end if;
  if not app.has_role(r) then
    raise exception 'Sem permissão para %.', p_what using errcode = '42501', hint = 'sem_acesso';
  end if;
end
$$;

-- Valores em reais que somem para quem não pode vê-los: acrescenta os campos da importação e da conferência.
create or replace function app.mask_amounts(j jsonb) returns jsonb
language plpgsql immutable
set search_path = ''
as $$
declare
  hidden constant text[] := array['value', 'annual_income', 'net_sale_value', 'annual_amount_real', 'amount_real', 'amount',
                                  'wealth', 'official_pl', 'snapshot', 'attribution', 'net_by_currency', 'contributions',
                                  'withdrawals', 'total_value', 'official_total', 'positions_total', 'difference',
                                  'start_value', 'gross_value', 'net_value', 'net_value_brl', 'amount_brl', 'quantity',
                                  'unit_price'];
  result jsonb;
begin
  case jsonb_typeof(j)
    when 'object' then
      select coalesce(jsonb_object_agg(e.key, app.mask_amounts(e.value)), '{}'::jsonb) into result
        from jsonb_each(j) e where e.key <> all (hidden);
      return result;
    when 'array' then
      select coalesce(jsonb_agg(app.mask_amounts(e.value) order by e.ord), '[]'::jsonb) into result
        from jsonb_array_elements(j) with ordinality e(value, ord);
      return result;
    else
      return j;
  end case;
end
$$;

-- Gatilhos: status da família no mês e mês fechado -----------------------------------------------------------------

create function app.guard_household_month() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'fechado' then
      raise exception 'Mês fechado da família não é apagado.' using errcode = 'P0001', hint = 'mes_fechado';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'importado' then
      raise exception 'O mês da família começa como importado.' using errcode = 'P0001', hint = 'mes_status';
    end if;
    return new;
  end if;
  if old.status = 'fechado' then
    raise exception 'Mês fechado da família não muda.' using errcode = 'P0001', hint = 'mes_fechado';
  end if;
  if new.status is distinct from old.status and not (
       (old.status in ('importado', 'conferido', 'bloqueado') and new.status in ('importado', 'conferido', 'bloqueado'))
       or (old.status = 'conferido' and new.status = 'rodado')
       or (old.status = 'rodado' and new.status in ('importado', 'fechado'))) then
    raise exception 'Mudança de status do mês não permitida: % para %.', old.status, new.status
      using errcode = 'P0001', hint = 'mes_status';
  end if;
  return new;
end
$$;

create trigger status_do_mes
  before insert or update or delete on public.household_months
  for each row execute function app.guard_household_month();

-- Posições e movimentos de família fechada no mês não mudam.
create function app.guard_closed_month_rows() returns trigger
language plpgsql
set search_path = ''
as $$
declare r record;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if exists (select 1 from public.household_months m
              where m.household_id = r.household_id and m.ref_date = r.ref_date and m.status = 'fechado')
     or (tg_op = 'UPDATE' and exists (select 1 from public.household_months m
              where m.household_id = old.household_id and m.ref_date = old.ref_date and m.status = 'fechado')) then
    raise exception 'O mês desta família está fechado: posições e movimentos não mudam.' using errcode = 'P0001', hint = 'mes_fechado';
  end if;
  return r;
end
$$;

create trigger mes_fechado
  before insert or update or delete on public.positions
  for each row execute function app.guard_closed_month_rows();
create trigger mes_fechado
  before insert or update or delete on public.flows
  for each row execute function app.guard_closed_month_rows();

-- Fechamento do canal: nasce aberto e, fechado, não reabre nem é apagado.
create function app.guard_month_closing() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'aberto' or new.closed_by is not null or new.closed_at is not null then
      raise exception 'O mês do canal começa aberto.' using errcode = 'P0001', hint = 'fechamento_status';
    end if;
    return new;
  end if;
  if old.status = 'fechado' then
    raise exception 'O mês do canal já está fechado e não reabre.' using errcode = 'P0001', hint = 'mes_fechado';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.status = 'fechado' and (new.closed_by is null or new.closed_at is null) then
    raise exception 'Fechamento sem quem fechou.' using errcode = 'P0001', hint = 'fechamento_status';
  end if;
  return new;
end
$$;

create trigger fechamento_do_canal
  before insert or update or delete on public.month_closings
  for each row execute function app.guard_month_closing();

-- Prévia ----------------------------------------------------------------------------------------------------------

-- Valida as linhas (posições ou movimentos) e devolve as linhas normalizadas, os erros (linha e mensagem, no máximo
-- 100) e a data de referência. Não grava nada.
create function app.validate_import_rows(p_kind text, p_rows jsonb, out clean_rows jsonb, out errors jsonb, out ref_month_end date)
language plpgsql stable
set search_path = ''
as $$
declare
  e record;
  v_line integer;
  v_ref date;
  v_refs date[] := '{}';
  v_code text;
  h record;
  v_clean jsonb[] := '{}';
  v_errs jsonb[] := '{}';
  v_extra integer := 0;
  v_qty numeric;
  v_price numeric;
  v_gross numeric;
  v_net numeric;
  v_amount numeric;
  v_currency text;
  v_custodian text;
  v_asset text;
  v_name text;
  v_isin text;
  v_cnpj text;
  v_kind text;
  v_date date;
  v_status public.month_status;
  v_ok boolean;
  d record;
begin
  for e in select j, ord from jsonb_array_elements(p_rows) with ordinality as t(j, ord) loop
    v_ok := true;
    v_line := coalesce(app.dec(e.j ->> 'linha')::integer, e.ord::integer + 1);
    v_ref := app.try_date(e.j ->> 'data_referencia');
    if v_ref is null then
      v_errs := v_errs || jsonb_build_object('line', v_line, 'message', 'data_referencia: data inválida (use AAAA-MM-DD).');
      v_ok := false;
    elsif v_ref <> app.month_end_of(v_ref) then
      v_errs := v_errs || jsonb_build_object('line', v_line, 'message', format('data_referencia: %s precisa ser o último dia do mês.', v_ref));
      v_ok := false;
    elsif not v_ref = any (v_refs) then
      v_refs := v_refs || v_ref;
    end if;

    v_code := upper(btrim(coalesce(e.j ->> 'codigo_cliente', '')));
    select hh.id, hh.status, hh.channel into h from public.households hh where hh.code = v_code;
    if v_code = '' then
      v_errs := v_errs || jsonb_build_object('line', v_line, 'message', 'codigo_cliente: obrigatório.');
      v_ok := false;
    elsif h.id is null then
      v_errs := v_errs || jsonb_build_object('line', v_line, 'message', format('codigo_cliente: %s não é uma família cadastrada.', v_code));
      v_ok := false;
    elsif h.status <> 'ativa' then
      v_errs := v_errs || jsonb_build_object('line', v_line, 'message', format('codigo_cliente: a família %s está encerrada.', v_code));
      v_ok := false;
    end if;

    v_custodian := btrim(coalesce(e.j ->> 'custodiante', ''));
    if v_custodian = '' then
      v_errs := v_errs || jsonb_build_object('line', v_line, 'message', 'custodiante: obrigatório.');
      v_ok := false;
    end if;
    v_currency := upper(btrim(coalesce(e.j ->> 'moeda', '')));
    if v_currency not in ('BRL', 'USD') then
      v_errs := v_errs || jsonb_build_object('line', v_line, 'message', format('moeda: "%s" não aceita na v1 (use BRL ou USD).', v_currency));
      v_ok := false;
    end if;

    if p_kind = 'posicoes' then
      v_asset := upper(btrim(coalesce(e.j ->> 'codigo_ativo', '')));
      v_name := btrim(coalesce(e.j ->> 'nome_ativo', ''));
      v_isin := nullif(upper(btrim(coalesce(e.j ->> 'isin', ''))), '');
      v_cnpj := nullif(regexp_replace(upper(btrim(coalesce(e.j ->> 'cnpj', ''))), '[./-]', '', 'g'), '');
      v_qty := app.dec(e.j ->> 'quantidade');
      v_price := app.dec(e.j ->> 'preco_unitario');
      v_gross := app.dec(e.j ->> 'valor_bruto');
      v_net := app.dec(e.j ->> 'valor_liquido');
      if v_asset = '' or v_name = '' then
        v_errs := v_errs || jsonb_build_object('line', v_line, 'message', 'codigo_ativo e nome_ativo: obrigatórios.');
        v_ok := false;
      end if;
      if v_isin is not null and v_isin !~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$' then
        v_errs := v_errs || jsonb_build_object('line', v_line, 'message', format('isin: "%s" inválido.', v_isin));
        v_ok := false;
      end if;
      if v_cnpj is not null and v_cnpj !~ '^[0-9A-Z]{12}[0-9]{2}$' then
        v_errs := v_errs || jsonb_build_object('line', v_line, 'message', format('cnpj: "%s" inválido.', v_cnpj));
        v_ok := false;
      end if;
      if v_qty is null or v_price is null or v_gross is null or v_net is null
         or v_qty < 0 or v_price < 0 or v_gross < 0 or v_net < 0
         or v_qty >= 1e16 or v_price >= 1e16 or v_gross >= 1e16 or v_net >= 1e16 then
        v_errs := v_errs || jsonb_build_object('line', v_line, 'message',
                    'quantidade, preco_unitario, valor_bruto e valor_liquido: números maiores ou iguais a zero.');
        v_ok := false;
      end if;
      if v_ok then
        v_clean := v_clean || jsonb_build_object(
          'linha', v_line, 'household_id', h.id, 'codigo_cliente', v_code, 'custodiante', v_custodian,
          'codigo_ativo', v_asset, 'isin', v_isin, 'cnpj', v_cnpj, 'nome_ativo', v_name,
          'quantidade', round(v_qty, 8), 'preco_unitario', round(v_price, 8), 'valor_bruto', round(v_gross, 2),
          'valor_liquido', round(v_net, 2), 'moeda', v_currency);
      end if;
    else
      v_kind := lower(btrim(coalesce(e.j ->> 'tipo', '')));
      v_amount := app.dec(e.j ->> 'valor');
      v_date := null;
      if coalesce(btrim(e.j ->> 'data_movimento'), '') <> '' then
        v_date := app.try_date(e.j ->> 'data_movimento');
        if v_date is null then
          v_errs := v_errs || jsonb_build_object('line', v_line, 'message', 'data_movimento: data inválida (use AAAA-MM-DD).');
          v_ok := false;
        elsif v_ref is not null and date_trunc('month', v_date) <> date_trunc('month', v_ref) then
          v_errs := v_errs || jsonb_build_object('line', v_line, 'message',
                      format('data_movimento: %s fora do mês da data de referência.', v_date));
          v_ok := false;
        end if;
      end if;
      if v_kind not in ('aporte', 'resgate') then
        v_errs := v_errs || jsonb_build_object('line', v_line, 'message', format('tipo: "%s" não é aporte nem resgate.', v_kind));
        v_ok := false;
      end if;
      if v_amount is null or v_amount <= 0 or v_amount >= 1e16 then
        v_errs := v_errs || jsonb_build_object('line', v_line, 'message', 'valor: número maior que zero.');
        v_ok := false;
      end if;
      if v_ok then
        v_clean := v_clean || jsonb_build_object(
          'linha', v_line, 'household_id', h.id, 'codigo_cliente', v_code, 'custodiante', v_custodian,
          'data_movimento', v_date, 'tipo', v_kind, 'valor', round(v_amount, 2), 'moeda', v_currency,
          'descricao', nullif(btrim(coalesce(e.j ->> 'descricao', '')), ''));
      end if;
    end if;
  end loop;

  if cardinality(v_refs) > 1 then
    v_errs := v_errs || jsonb_build_object('message',
                format('O arquivo tem mais de uma data de referência (%s): importe um mês por vez.', array_to_string(v_refs, ', ')));
  end if;
  ref_month_end := case when cardinality(v_refs) = 1 then v_refs[1] end;

  -- Linha duplicada: o mesmo ativo duas vezes no mesmo custodiante da mesma família.
  if p_kind = 'posicoes' then
    for d in
      select r ->> 'codigo_cliente' as code, r ->> 'codigo_ativo' as asset,
             (array_agg(r ->> 'custodiante' order by (r ->> 'linha')::integer))[1] as custodian,
             array_agg((r ->> 'linha')::integer order by (r ->> 'linha')::integer) as lines
        from unnest(v_clean) r
       group by r ->> 'codigo_cliente', r ->> 'codigo_ativo', upper(r ->> 'custodiante')
      having count(*) > 1
    loop
      v_errs := v_errs || jsonb_build_object('line', d.lines[2], 'message',
                  format('O ativo %s aparece de novo para %s em %s (linhas %s).', d.asset, d.code, d.custodian, array_to_string(d.lines, ', ')));
    end loop;
    -- O ativo já cadastrado tem moeda: o arquivo precisa trazer a mesma.
    for d in
      select distinct r ->> 'codigo_ativo' as asset, a.currency, r ->> 'moeda' as currency_file, (r ->> 'linha')::integer as line
        from unnest(v_clean) r join public.assets a on a.asset_code = r ->> 'codigo_ativo'
       where a.currency <> r ->> 'moeda'
    loop
      v_errs := v_errs || jsonb_build_object('line', d.line, 'message',
                  format('O ativo %s está cadastrado em %s e veio em %s.', d.asset, d.currency, d.currency_file));
    end loop;
  end if;

  -- Família fechada no mês não recebe importação.
  if ref_month_end is not null then
    for d in
      select distinct r ->> 'codigo_cliente' as code
        from unnest(v_clean) r
        join public.household_months m on m.household_id = (r ->> 'household_id')::uuid and m.ref_date = ref_month_end
       where m.status = 'fechado'
    loop
      v_errs := v_errs || jsonb_build_object('message', format('O mês de %s já está fechado para %s: não aceita nova importação.', ref_month_end, d.code));
    end loop;
  end if;

  if cardinality(v_errs) = 0 and ref_month_end is null then
    v_errs := v_errs || jsonb_build_object('message', 'O arquivo não tem nenhuma linha de dados.');
  end if;
  v_extra := greatest(cardinality(v_errs) - 100, 0);
  errors := to_jsonb(v_errs[1:100]);
  if v_extra > 0 then
    errors := errors || jsonb_build_array(jsonb_build_object('message', format('E mais %s erros.', v_extra)));
  end if;
  clean_rows := to_jsonb(v_clean);
end
$$;

-- Prévia de uma planilha de posições ("posicoes") ou de aportes e resgates ("movimentos"): valida, guarda a prévia e
-- devolve o resumo por família. Com qualquer erro, não grava nada e devolve a lista de erros.
create function public.import_preview(p_kind text, p_file_name text, p_rows jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v record;
  v_batch uuid;
  v_rate numeric;
  v_families jsonb;
  v_new_assets jsonb;
  v_unmapped jsonb;
  v_warnings jsonb;
  v_total numeric;
  v_official numeric;
  v_preview jsonb;
begin
  perform app.require_role('gestao', 'importar planilhas');
  if p_kind is null or p_kind not in ('posicoes', 'movimentos') then
    raise exception 'Tipo de importação inválido: use posicoes ou movimentos.' using errcode = '22023', hint = 'importacao_tipo';
  end if;
  if coalesce(btrim(p_file_name), '') = '' then
    raise exception 'Falta o nome do arquivo.' using errcode = '22023', hint = 'importacao_arquivo';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'As linhas precisam vir numa lista.' using errcode = '22023', hint = 'importacao_linhas';
  end if;
  if jsonb_array_length(p_rows) > 50000 then
    raise exception 'Arquivo grande demais: no máximo 50.000 linhas por importação.' using errcode = '22023', hint = 'importacao_linhas';
  end if;

  select * into v from app.validate_import_rows(p_kind, p_rows);
  if jsonb_array_length(v.errors) > 0 then
    perform app.audit('previa_recusada', 'import_batches', null, null,
                      jsonb_build_object('tipo', p_kind, 'arquivo', p_file_name, 'erros', jsonb_array_length(v.errors)));
    return jsonb_build_object('ok', false, 'errors', v.errors);
  end if;

  v_rate := (app.usd_rate(v.ref_month_end)).rate;

  if p_kind = 'posicoes' then
    select jsonb_agg(f order by f ->> 'code') into v_families from (
      select jsonb_build_object(
               'household_id', h.id, 'code', h.code, 'name', h.name, 'channel', h.channel,
               'rows', count(*),
               'net_by_currency', (select jsonb_object_agg(c.moeda, c.total) from (
                   select r2 ->> 'moeda' as moeda, sum((r2 ->> 'valor_liquido')::numeric) as total
                     from jsonb_array_elements(v.clean_rows) r2 where (r2 ->> 'household_id')::uuid = h.id group by 1) c),
               'replaces', (select count(*) from public.positions p where p.household_id = h.id and p.ref_date = v.ref_month_end),
               'status', m.status, 'official_pl', m.official_pl) as f
        from jsonb_array_elements(v.clean_rows) r
        join public.households h on h.id = (r ->> 'household_id')::uuid
        left join public.household_months m on m.household_id = h.id and m.ref_date = v.ref_month_end
       group by h.id, h.code, h.name, h.channel, m.status, m.official_pl) s;

    select coalesce(jsonb_agg(distinct jsonb_build_object('asset_code', r ->> 'codigo_ativo', 'name', r ->> 'nome_ativo',
                                                          'isin', r ->> 'isin', 'cnpj', r ->> 'cnpj', 'currency', r ->> 'moeda')), '[]'::jsonb)
      into v_new_assets
      from jsonb_array_elements(v.clean_rows) r
     where not exists (select 1 from public.assets a where a.asset_code = r ->> 'codigo_ativo');

    select coalesce(jsonb_agg(distinct a.asset_code), '[]'::jsonb) into v_unmapped
      from jsonb_array_elements(v.clean_rows) r join public.assets a on a.asset_code = r ->> 'codigo_ativo'
     where a.class_code is null;

    -- Sem a cotação do dólar, o total em reais fica em branco.
    select case when bool_or(r ->> 'moeda' = 'USD') and v_rate is null then null
                else sum(case r ->> 'moeda' when 'BRL' then (r ->> 'valor_liquido')::numeric
                                            else round((r ->> 'valor_liquido')::numeric * v_rate, 2) end) end
      into v_total from jsonb_array_elements(v.clean_rows) r;
    v_warnings := '[]'::jsonb;
  else
    select jsonb_agg(f order by f ->> 'code') into v_families from (
      select jsonb_build_object(
               'household_id', h.id, 'code', h.code, 'name', h.name, 'channel', h.channel,
               'rows', count(*),
               'contributions', (select jsonb_object_agg(c.moeda, c.total) from (
                   select r2 ->> 'moeda' as moeda, sum((r2 ->> 'valor')::numeric) as total
                     from jsonb_array_elements(v.clean_rows) r2
                    where (r2 ->> 'household_id')::uuid = h.id and r2 ->> 'tipo' = 'aporte' group by 1) c),
               'withdrawals', (select jsonb_object_agg(c.moeda, c.total) from (
                   select r2 ->> 'moeda' as moeda, sum((r2 ->> 'valor')::numeric) as total
                     from jsonb_array_elements(v.clean_rows) r2
                    where (r2 ->> 'household_id')::uuid = h.id and r2 ->> 'tipo' = 'resgate' group by 1) c),
               'approximate_dates', count(*) filter (where r ->> 'data_movimento' is null),
               'replaces', (select count(*) from public.flows fl where fl.household_id = h.id and fl.ref_date = v.ref_month_end),
               'status', m.status, 'official_pl', m.official_pl) as f
        from jsonb_array_elements(v.clean_rows) r
        join public.households h on h.id = (r ->> 'household_id')::uuid
        left join public.household_months m on m.household_id = h.id and m.ref_date = v.ref_month_end
       group by h.id, h.code, h.name, h.channel, m.status, m.official_pl) s;
    v_new_assets := '[]'::jsonb;
    v_unmapped := '[]'::jsonb;
    v_total := null;
    -- Aporte e resgate do mesmo valor, na mesma data e moeda, na mesma família: parece transferência entre contas.
    select coalesce(jsonb_agg(jsonb_build_object('line', a.linha, 'message',
             format('%s: aporte (linha %s) e resgate (linha %s) do mesmo valor em %s parecem transferência entre contas da família, que não conta como aporte nem resgate. Confira antes de confirmar.',
                    a.code, a.linha, b.linha, a.dia))), '[]'::jsonb)
      into v_warnings
      from (select r ->> 'codigo_cliente' as code, (r ->> 'linha')::integer as linha, r ->> 'data_movimento' as dia,
                   r ->> 'moeda' as moeda, (r ->> 'valor')::numeric as valor
              from jsonb_array_elements(v.clean_rows) r where r ->> 'tipo' = 'aporte' and r ->> 'data_movimento' is not null) a
      join (select r ->> 'codigo_cliente' as code, (r ->> 'linha')::integer as linha, r ->> 'data_movimento' as dia,
                   r ->> 'moeda' as moeda, (r ->> 'valor')::numeric as valor
              from jsonb_array_elements(v.clean_rows) r where r ->> 'tipo' = 'resgate') b
        on a.code = b.code and a.dia = b.dia and a.moeda = b.moeda and a.valor = b.valor;
  end if;

  -- PL oficial somado só se todas as famílias do arquivo já tiverem o PL do mês.
  select case when count(*) = count(m.official_pl) then sum(m.official_pl) end into v_official
    from (select distinct (r ->> 'household_id')::uuid as hid from jsonb_array_elements(v.clean_rows) r) f
    left join public.household_months m on m.household_id = f.hid and m.ref_date = v.ref_month_end;

  -- clock_timestamp, e não now(): a ordem entre prévias e confirmações vale também dentro de uma mesma transação.
  insert into public.import_batches (ref_date, kind, file_name, uploaded_by, row_count, total_value, official_total, status, created_at)
  values (v.ref_month_end, p_kind, btrim(p_file_name), auth.uid(), jsonb_array_length(v.clean_rows), v_total, v_official, 'previa',
          clock_timestamp())
  returning id into v_batch;

  v_preview := jsonb_build_object(
    'ok', true, 'batch_id', v_batch, 'kind', p_kind, 'file_name', btrim(p_file_name), 'ref_date', v.ref_month_end,
    'rows', jsonb_array_length(v.clean_rows), 'families', v_families, 'new_assets', v_new_assets,
    'unmapped_assets', v_unmapped, 'warnings', v_warnings, 'total_value', v_total, 'official_total', v_official);
  insert into app.import_staging (batch_id, rows, preview) values (v_batch, v.clean_rows, v_preview);

  perform app.audit('previa_importacao', 'import_batches', v_batch::text, null,
                    jsonb_build_object('tipo', p_kind, 'arquivo', btrim(p_file_name), 'linhas', jsonb_array_length(v.clean_rows)));
  return case when app.can_see_amounts() then v_preview else app.mask_amounts(v_preview) end;
end
$$;

-- Confirma a prévia: substitui os dados das famílias do arquivo no mês, cadastra os ativos novos (sem classe, na fila
-- do comitê) e volta o mês dessas famílias para "importado". Tudo ou nada.
create function public.import_confirm(p_batch uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  b public.import_batches;
  s app.import_staging;
  v_households uuid[];
  v_closed text;
  v_newer text;
  v_replaced integer;
  v_inserted integer;
  v_new_assets integer;
begin
  perform app.require_role('gestao', 'confirmar importações');
  select * into b from public.import_batches where id = p_batch for update;
  if not found then
    raise exception 'Prévia não encontrada.' using errcode = 'P0002', hint = 'importacao_previa';
  end if;
  if b.status <> 'previa' then
    raise exception 'Esta importação já foi confirmada.' using errcode = 'P0001', hint = 'importacao_previa';
  end if;
  select * into s from app.import_staging where batch_id = p_batch;
  if s.rows is null then
    raise exception 'Prévia sem linhas: refaça a prévia.' using errcode = 'P0002', hint = 'importacao_previa';
  end if;
  select array_agg(distinct (r ->> 'household_id')::uuid) into v_households from jsonb_array_elements(s.rows) r;

  -- O que mudou desde a prévia: família fechada ou importação mais nova das mesmas famílias.
  select string_agg(h.code, ', ' order by h.code) into v_closed
    from public.household_months m join public.households h on h.id = m.household_id
   where m.household_id = any (v_households) and m.ref_date = b.ref_date and m.status = 'fechado';
  if v_closed is not null then
    raise exception 'O mês já foi fechado para %: refaça a prévia sem essas famílias.', v_closed using errcode = 'P0001', hint = 'mes_fechado';
  end if;
  select string_agg(distinct h.code, ', ') into v_newer
    from public.import_batches o
    join (select batch_id, household_id from public.positions where ref_date = b.ref_date
          union all select batch_id, household_id from public.flows where ref_date = b.ref_date) x on x.batch_id = o.id
    join public.households h on h.id = x.household_id
   where o.kind = b.kind and o.confirmed_at > b.created_at and x.household_id = any (v_households);
  if v_newer is not null then
    raise exception 'Há uma importação mais nova para %: refaça a prévia.', v_newer using errcode = 'P0001', hint = 'importacao_desatualizada';
  end if;
  if exists (select 1 from public.households h where h.id = any (v_households) and h.status <> 'ativa') then
    raise exception 'Uma família do arquivo foi encerrada depois da prévia: refaça a prévia.' using errcode = 'P0001', hint = 'importacao_desatualizada';
  end if;

  if b.kind = 'posicoes' then
    delete from public.positions p where p.household_id = any (v_households) and p.ref_date = b.ref_date;
    get diagnostics v_replaced = row_count;
    insert into public.assets (asset_code, isin, cnpj, name, currency)
    select distinct on (r ->> 'codigo_ativo') r ->> 'codigo_ativo', r ->> 'isin', r ->> 'cnpj', r ->> 'nome_ativo', r ->> 'moeda'
      from jsonb_array_elements(s.rows) r
     where not exists (select 1 from public.assets a where a.asset_code = r ->> 'codigo_ativo')
     order by r ->> 'codigo_ativo', (r ->> 'linha')::integer;
    get diagnostics v_new_assets = row_count;
    insert into public.positions (household_id, batch_id, ref_date, custodian, asset_id, quantity, unit_price, gross_value, net_value, currency)
    select (r ->> 'household_id')::uuid, p_batch, b.ref_date, r ->> 'custodiante', a.id, (r ->> 'quantidade')::numeric,
           (r ->> 'preco_unitario')::numeric, (r ->> 'valor_bruto')::numeric, (r ->> 'valor_liquido')::numeric, r ->> 'moeda'
      from jsonb_array_elements(s.rows) r join public.assets a on a.asset_code = r ->> 'codigo_ativo';
    get diagnostics v_inserted = row_count;
  else
    delete from public.flows f where f.household_id = any (v_households) and f.ref_date = b.ref_date;
    get diagnostics v_replaced = row_count;
    v_new_assets := 0;
    insert into public.flows (household_id, batch_id, ref_date, custodian, flow_date, kind, amount, currency, description)
    select (r ->> 'household_id')::uuid, p_batch, b.ref_date, r ->> 'custodiante', (r ->> 'data_movimento')::date,
           (r ->> 'tipo')::public.flow_kind, (r ->> 'valor')::numeric, r ->> 'moeda', r ->> 'descricao'
      from jsonb_array_elements(s.rows) r;
    get diagnostics v_inserted = row_count;
  end if;

  -- Lotes anteriores que ficaram sem nenhuma linha foram substituídos.
  update public.import_batches o set status = 'substituida'
   where o.status = 'confirmada' and o.kind = b.kind and o.ref_date = b.ref_date and o.id <> b.id
     and not exists (select 1 from public.positions p where p.batch_id = o.id)
     and not exists (select 1 from public.flows f where f.batch_id = o.id);

  -- O mês dessas famílias volta para "importado": a conferência precisa ser refeita.
  insert into public.household_months (household_id, ref_date, status)
  select hid, b.ref_date, 'importado' from unnest(v_households) hid
  on conflict (household_id, ref_date) do update
    set status = 'importado', checks = null, return_confirmed_by = null, return_confirmed_at = null;

  insert into public.month_closings (ref_date, channel, status, opened_by)
  select distinct b.ref_date, h.channel, 'aberto'::public.closing_status, auth.uid()
    from public.households h where h.id = any (v_households)
  on conflict (ref_date, channel) do nothing;

  update public.import_batches
     set status = 'confirmada', confirmed_by = auth.uid(), confirmed_at = clock_timestamp(), row_count = v_inserted
   where id = p_batch;
  delete from app.import_staging where batch_id = p_batch;

  perform app.audit('confirmar_importacao', 'import_batches', p_batch::text, null,
                    jsonb_build_object('tipo', b.kind, 'mes', b.ref_date, 'familias', cardinality(v_households),
                                       'linhas', v_inserted, 'substituidas', v_replaced, 'ativos_novos', v_new_assets));
  return jsonb_build_object('batch_id', p_batch, 'kind', b.kind, 'ref_date', b.ref_date, 'families', cardinality(v_households),
                            'rows', v_inserted, 'replaced', v_replaced, 'new_assets', v_new_assets);
end
$$;

-- Descarta uma prévia não confirmada.
create function public.import_discard(p_batch uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.require_role('gestao', 'descartar importações');
  delete from public.import_batches where id = p_batch and status = 'previa';
  if not found then
    raise exception 'Prévia não encontrada ou já confirmada.' using errcode = 'P0002', hint = 'importacao_previa';
  end if;
  perform app.audit('descartar_previa', 'import_batches', p_batch::text, null, null);
end
$$;

-- PL oficial por família no mês (extrato do custodiante na CADM, da corretora na AI). Mudar o PL volta o mês para
-- "importado". Linhas: data_referencia, codigo_cliente, pl_oficial (e linha, opcional). Tudo ou nada.
create function public.set_official_pl(p_rows jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  e record;
  v_line integer;
  v_ref date;
  v_code text;
  v_pl numeric;
  h record;
  m public.household_months;
  v_errs jsonb[] := '{}';
  v_clean jsonb[] := '{}';
  v_changed integer := 0;
  r jsonb;
begin
  perform app.require_role('gestao', 'informar o PL oficial');
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'As linhas precisam vir numa lista não vazia.' using errcode = '22023', hint = 'importacao_linhas';
  end if;
  for e in select j, ord from jsonb_array_elements(p_rows) with ordinality as t(j, ord) loop
    v_line := coalesce(app.dec(e.j ->> 'linha')::integer, e.ord::integer + 1);
    v_ref := app.try_date(e.j ->> 'data_referencia');
    v_code := upper(btrim(coalesce(e.j ->> 'codigo_cliente', '')));
    v_pl := app.dec(e.j ->> 'pl_oficial');
    select hh.id, hh.status into h from public.households hh where hh.code = v_code;
    if v_ref is null or v_ref <> app.month_end_of(v_ref) then
      v_errs := v_errs || jsonb_build_object('line', v_line, 'message', 'data_referencia: use o último dia do mês, em AAAA-MM-DD.');
    elsif h.id is null then
      v_errs := v_errs || jsonb_build_object('line', v_line, 'message', format('codigo_cliente: %s não é uma família cadastrada.', v_code));
    elsif h.status <> 'ativa' then
      v_errs := v_errs || jsonb_build_object('line', v_line, 'message', format('codigo_cliente: a família %s está encerrada.', v_code));
    elsif v_pl is null or v_pl <= 0 or v_pl >= 1e16 then
      v_errs := v_errs || jsonb_build_object('line', v_line, 'message', 'pl_oficial: número maior que zero.');
    elsif exists (select 1 from unnest(v_clean) c where c ->> 'household_id' = h.id::text and c ->> 'ref_date' = v_ref::text) then
      v_errs := v_errs || jsonb_build_object('line', v_line, 'message', format('%s aparece de novo no mesmo mês.', v_code));
    elsif exists (select 1 from public.household_months hm where hm.household_id = h.id and hm.ref_date = v_ref and hm.status = 'fechado') then
      v_errs := v_errs || jsonb_build_object('line', v_line, 'message', format('O mês de %s já está fechado para %s.', v_ref, v_code));
    else
      v_clean := v_clean || jsonb_build_object('household_id', h.id, 'ref_date', v_ref, 'pl', round(v_pl, 2), 'code', v_code);
    end if;
  end loop;
  if cardinality(v_errs) > 0 then
    return jsonb_build_object('ok', false, 'errors', to_jsonb(v_errs[1:100]));
  end if;

  foreach r in array v_clean loop
    select * into m from public.household_months where household_id = (r ->> 'household_id')::uuid and ref_date = (r ->> 'ref_date')::date;
    if not found then
      insert into public.household_months (household_id, ref_date, official_pl, status)
      values ((r ->> 'household_id')::uuid, (r ->> 'ref_date')::date, (r ->> 'pl')::numeric, 'importado');
      v_changed := v_changed + 1;
    elsif m.official_pl is distinct from (r ->> 'pl')::numeric then
      update public.household_months
         set official_pl = (r ->> 'pl')::numeric, status = 'importado', checks = null,
             return_confirmed_by = null, return_confirmed_at = null
       where household_id = m.household_id and ref_date = m.ref_date;
      v_changed := v_changed + 1;
    end if;
    insert into public.month_closings (ref_date, channel, status, opened_by)
    select (r ->> 'ref_date')::date, h2.channel, 'aberto'::public.closing_status, auth.uid()
      from public.households h2 where h2.id = (r ->> 'household_id')::uuid
    on conflict (ref_date, channel) do nothing;
  end loop;
  perform app.audit('informar_pl', 'household_months', null, null,
                    jsonb_build_object('familias', cardinality(v_clean), 'alteradas', v_changed));
  return jsonb_build_object('ok', true, 'families', cardinality(v_clean), 'changed', v_changed);
end
$$;

revoke all on function app.dec(text), app.try_date(text), app.month_end_of(date), app.usd_rate(date),
  app.require_role(public.app_role, text), app.validate_import_rows(text, jsonb), app.guard_household_month(),
  app.guard_closed_month_rows(), app.guard_month_closing() from public;
revoke all on function public.import_preview(text, text, jsonb), public.import_confirm(uuid), public.import_discard(uuid),
  public.set_official_pl(jsonb) from public, anon;
grant execute on function public.import_preview(text, text, jsonb), public.import_confirm(uuid), public.import_discard(uuid),
  public.set_official_pl(jsonb) to authenticated;
