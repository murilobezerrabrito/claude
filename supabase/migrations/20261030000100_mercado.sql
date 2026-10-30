-- AWARE Objective, Fase 2, etapa 3d: séries do Banco Central (SPEC, "Dados de mercado"). A função do servidor
-- `market-sync` busca o CDI (série 12), o IPCA (433) e o dólar de venda (1) no SGS e grava aqui; o agendamento diário
-- entra na etapa da nuvem. Regras:
-- - Só a função do servidor grava (service_role), de forma idempotente: a mesma data não duplica; um valor diferente
--   do gravado atualiza e fica contado.
-- - Cada busca fica registrada: série, janela, linhas recebidas, novas e atualizadas, erro e quem pediu.
-- - Quem pede a busca: o agendamento (com a chave do servidor) ou alguém da gestão ou do comitê, com segundo fator.
-- - A situação das séries (último dado e última busca) é para a equipe interna; o atraso é calculado no console, com
--   o calendário de dias úteis de src/market (assim, o aviso aparece mesmo se o agendamento parar).

-- Registro das buscas ------------------------------------------------------------------------------------------------

create table public.market_syncs (
  id uuid primary key default gen_random_uuid(),
  series_code text not null check (series_code in ('cdi', 'ipca', 'dolar')),
  requested_from date not null,
  requested_to date not null,
  received integer not null default 0 check (received >= 0),
  inserted integer not null default 0 check (inserted >= 0),
  updated integer not null default 0 check (updated >= 0),
  error text,
  -- Nulo: o agendamento.
  requested_by uuid references auth.users (id),
  -- Hora do relógio (e não da transação): várias buscas na mesma transação ficam em ordem.
  created_at timestamptz not null default clock_timestamp(),
  check (requested_from <= requested_to),
  check (error is null or (received = 0 and inserted = 0 and updated = 0))
);
create index market_syncs_series_idx on public.market_syncs (series_code, created_at desc);
alter table public.market_syncs enable row level security;
revoke all on public.market_syncs from anon;
-- A equipe interna lê; ninguém escreve pela API (só a função do servidor, com a chave do servidor).
create policy interna_le_buscas on public.market_syncs
  for select to authenticated using (app.mfa_ok() and app.is_internal());

-- Quem pede a busca --------------------------------------------------------------------------------------------------

create function public.market_sync_permission()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' then
    return jsonb_build_object('actor', null, 'via', 'agendamento');
  end if;
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para buscar as séries.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  if not (app.has_role('gestao') or app.has_role('comite')) then
    raise exception 'Sem permissão para buscar as séries do Banco Central.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  return jsonb_build_object('actor', auth.uid(), 'via', 'console');
end
$$;

-- Último dado de cada série: de onde a próxima busca começa.
create function public.market_last_dates()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_object_agg(c.code, (select max(s.date) from public.market_series s where s.series_code = c.code))
    from unnest(array['cdi', 'ipca', 'dolar']) c(code)
$$;

-- Gravação -----------------------------------------------------------------------------------------------------------

-- Grava a busca de uma série: as linhas (idempotente) e o registro da busca. Confere de novo cada linha com as regras
-- da leitura (src/market/sgs.ts): data válida até o fim da busca, IPCA no dia 1, valor dentro da faixa plausível e
-- nenhuma data repetida. Busca com erro não grava linhas, só o registro.
create function public.record_market_sync(p_series text, p_from date, p_to date, p_rows jsonb, p_error text, p_actor uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_date date;
  v_value numeric;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_last date;
begin
  if p_series is null or p_series not in ('cdi', 'ipca', 'dolar') then
    raise exception 'Série desconhecida: %.', p_series using errcode = '22023', hint = 'serie_desconhecida';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Janela da busca inválida.' using errcode = '22023', hint = 'janela_invalida';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'As linhas da série precisam vir numa lista.' using errcode = '22023', hint = 'linhas_invalidas';
  end if;
  if p_error is not null and jsonb_array_length(p_rows) > 0 then
    raise exception 'Busca com erro não grava linhas.' using errcode = '22023', hint = 'linhas_com_erro';
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_date := app.try_date(r ->> 'date');
    v_value := app.jnum(r -> 'value');
    if v_date is null or v_value is null or v_date > p_to then
      raise exception 'Linha inválida na série %: %.', p_series, r using errcode = '22023', hint = 'linha_invalida';
    end if;
    if p_series = 'ipca' and extract(day from v_date) <> 1 then
      raise exception 'O IPCA fica no dia 1 do mês: %.', r using errcode = '22023', hint = 'linha_invalida';
    end if;
    -- Entre parênteses: no PL/pgSQL, a condição do IF termina no primeiro THEN fora deles.
    if not (case p_series
              when 'cdi' then v_value > 0 and v_value < 1
              when 'ipca' then v_value > -5 and v_value < 10
              else v_value > 0.5 and v_value < 50
            end) then
      raise exception 'Valor fora da faixa esperada na série %: %.', p_series, r using errcode = '22023', hint = 'valor_implausivel';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_rows)) <> (select count(distinct x ->> 'date') from jsonb_array_elements(p_rows) x) then
    raise exception 'Data repetida na série %.', p_series using errcode = '22023', hint = 'data_repetida';
  end if;

  -- Nova data entra; valor diferente do gravado atualiza; valor igual não mexe (xmax = 0 marca a linha nova).
  with incoming as (
    select (x ->> 'date')::date as date, (x ->> 'value')::numeric as value from jsonb_array_elements(p_rows) x
  ), written as (
    insert into public.market_series (series_code, date, value, source)
    select p_series, i.date, i.value, 'bcb_sgs' from incoming i
    on conflict (series_code, date) do update set value = excluded.value, source = excluded.source
      where public.market_series.value is distinct from excluded.value
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new), count(*) filter (where not is_new) into v_inserted, v_updated from written;

  select max(date) into v_last from public.market_series where series_code = p_series;
  insert into public.market_syncs (series_code, requested_from, requested_to, received, inserted, updated, error, requested_by)
  values (p_series, p_from, p_to, jsonb_array_length(p_rows), v_inserted, v_updated, p_error, p_actor);
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'last_date', v_last);
end
$$;

-- Situação das séries ------------------------------------------------------------------------------------------------

-- Último dado (data, valor e origem), a última busca (quando, quem pediu, o que entrou e o erro) e a última busca sem
-- erro de cada série, na ordem CDI, IPCA e dólar. Só a equipe interna, com segundo fator.
create function public.market_status()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para ver as séries.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  if not app.is_internal() then
    raise exception 'Sem permissão para ver as séries do Banco Central.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  return (
    select jsonb_agg(jsonb_build_object(
             'code', c.code,
             'last', (select jsonb_build_object('date', s.date, 'value', s.value, 'source', s.source)
                        from public.market_series s where s.series_code = c.code order by s.date desc limit 1),
             'last_sync', (select jsonb_build_object('at', m.created_at, 'from', m.requested_from, 'to', m.requested_to,
                                                     'received', m.received, 'inserted', m.inserted, 'updated', m.updated,
                                                     'error', m.error, 'requested_by_email', u.email)
                             from public.market_syncs m left join auth.users u on u.id = m.requested_by
                            where m.series_code = c.code order by m.created_at desc limit 1),
             'last_success_at', (select max(m.created_at) from public.market_syncs m where m.series_code = c.code and m.error is null))
           order by c.ord)
      from unnest(array['cdi', 'ipca', 'dolar']) with ordinality c(code, ord));
end
$$;

revoke all on function public.market_sync_permission(), public.market_last_dates(),
  public.record_market_sync(text, date, date, jsonb, text, uuid), public.market_status() from public, anon, authenticated;
grant execute on function public.market_sync_permission(), public.market_status() to authenticated;
grant execute on function public.market_sync_permission(), public.market_last_dates(),
  public.record_market_sync(text, date, date, jsonb, text, uuid) to service_role;
