-- AWARE Objective, Fase 2, etapa 3c: cadastro da família e versões do plano (SPEC, "Console interno": "Cadastro e
-- plano"). Regras:
-- - O cadastro (código, nome, canal, banker ou responsável, intermediário, perfil, suitability, custo, idade-limite,
--   semente e situação) é só da gestão, com segundo fator. O canal não muda depois de criado; a semente não muda
--   depois da primeira rodada (D-030).
-- - O plano é da gestão ou do responsável nas suas famílias AI, com segundo fator e vendo os valores em reais.
-- - Cada gravação do plano é uma versão nova, com mês-base: nunca no futuro, sempre depois do último mês fechado da
--   família e nunca antes da versão mais recente. No mesmo mês-base, a versão nova substitui a anterior (uma versão
--   por mês-base, D-043); o conteúdo anterior fica na auditoria.
-- - O banco confere a versão de novo (o navegador já confere com o esquema de src/lib/planSchema.ts), espelha o plano
--   nas tabelas da família (pessoas, bens, fluxos, eventos e metas) e volta para "importado" os meses a partir do
--   mês-base que já estavam conferidos, bloqueados ou rodados: a conferência e a rodada precisam do plano novo.

-- Quem edita ---------------------------------------------------------------------------------------------------------

-- Quem muda o plano (app.can_write_plan, da etapa 1) e, além disso, vê os valores em reais.
create function app.can_edit_plan(p_household uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$ select app.can_write_plan(p_household) and app.can_see_amounts() $$;

-- Hoje no horário de Brasília (o banco roda em UTC): é o dia que vale para "no futuro".
create function app.today_brazil() returns date
language sql stable
set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Opções dos formulários ---------------------------------------------------------------------------------------------

-- Perfis, classes das premissas vigentes e, para a gestão, os bankers e responsáveis que podem ser escolhidos.
create function public.plan_options()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_cma uuid;
  v_gestao boolean := app.has_role('gestao');
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para ver o cadastro.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  if not (app.is_internal() or app.has_role('banker') or app.has_role('responsavel')) then
    raise exception 'Sem permissão para ver o cadastro.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  select id into v_cma from public.cma_versions where status = 'vigente';
  return jsonb_build_object(
    'profiles', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.profiles),
    'classes', (select coalesce(jsonb_agg(jsonb_build_object('class_code', class_code, 'name', name) order by class_code), '[]'::jsonb)
                  from public.cma_classes where cma_version_id = v_cma),
    'bankers', case when v_gestao then (
                 select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email) order by u.email), '[]'::jsonb)
                   from auth.users u where exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'banker'))
               else '[]'::jsonb end,
    'owners', case when v_gestao then (
                select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email) order by u.email), '[]'::jsonb)
                  from auth.users u where exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'responsavel'))
              else '[]'::jsonb end);
end
$$;

-- Leitura para o editor ----------------------------------------------------------------------------------------------

-- Cadastro, versões do plano (sem o conteúdo), a versão mais recente com o conteúdo, o último mês fechado e o que
-- quem pede pode mudar. Só a equipe (o cliente AI vê o plano no app); a leitura vai para a auditoria.
create function public.household_editor(p_household uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para ver o cadastro.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  if not (app.is_internal() or app.has_role('banker') or app.has_role('responsavel')) or not app.can_read_household(p_household) then
    raise exception 'Sem acesso a esta família.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  if not exists (select 1 from public.households where id = p_household) then
    raise exception 'Família não encontrada.' using errcode = 'P0002', hint = 'familia_inexistente';
  end if;
  perform app.audit('ler_plano', 'households', p_household::text, p_household, jsonb_build_object('valores', app.can_see_amounts()));
  select jsonb_build_object(
           'household', to_jsonb(h) || jsonb_build_object(
              'banker_email', (select u.email from auth.users u where u.id = h.banker_id),
              'owner_email', (select u.email from auth.users u where u.id = h.owner_id)),
           'versions', (select coalesce(jsonb_agg(jsonb_build_object(
                                 'id', v.id, 'version', v.version, 'base_month', v.base_month, 'note', v.note,
                                 'created_at', v.created_at, 'created_by_email', u.email) order by v.base_month desc), '[]'::jsonb)
                          from public.plan_versions v left join auth.users u on u.id = v.created_by
                         where v.household_id = h.id),
           'latest', (select jsonb_build_object('id', v.id, 'version', v.version, 'base_month', v.base_month, 'snapshot', v.snapshot)
                        from public.plan_versions v where v.household_id = h.id order by v.base_month desc limit 1),
           'last_closed_month', (select max(m.ref_date) from public.household_months m where m.household_id = h.id and m.status = 'fechado'),
           'has_runs', exists (select 1 from public.simulation_runs r where r.household_id = h.id),
           'can_edit_registration', app.has_role('gestao'),
           'can_edit_plan', app.can_edit_plan(h.id))
    into result
    from public.households h
   where h.id = p_household;
  return case when app.can_see_amounts() then result else app.mask_amounts(result) end;
end
$$;

-- Cadastro -----------------------------------------------------------------------------------------------------------

-- Cria (p_household nulo) ou atualiza o cadastro. Erros de preenchimento voltam por campo ({ok: false, errors});
-- permissão e família inexistente são recusadas.
create function public.save_household(p_household uuid, p_fields jsonb)
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
    insert into public.households (code, name, channel, owner_id, intermediary, banker_id, profile_id, weights_source,
                                   suitability, fee_rate, horizon_age, seed, status)
    values (v_code, v_name, v_channel::public.channel, v_owner::uuid, v_intermediary, v_banker::uuid, v_profile,
            case v_channel when 'cadm' then 'perfil' else 'carteira_atual' end::public.weights_source, v_suitability, v_fee,
            v_horizon::integer, coalesce(v_seed, floor(random() * 4294967296))::bigint, v_status)
    returning id into v_id;
  else
    update public.households
       set code = v_code, name = v_name, owner_id = v_owner::uuid, intermediary = v_intermediary, banker_id = v_banker::uuid,
           profile_id = v_profile, suitability = v_suitability, fee_rate = v_fee, horizon_age = v_horizon::integer,
           seed = v_seed::bigint, status = v_status
     where id = h.id;
    v_id := h.id;
  end if;
  return jsonb_build_object('ok', true, 'household_id', v_id, 'code', v_code);
end
$$;

-- Conferência da versão do plano -------------------------------------------------------------------------------------

create function app.plan_error(p_path text, p_message text) returns jsonb
language sql immutable
set search_path = ''
as $$ select jsonb_build_object('path', p_path, 'message', p_message) $$;

-- Número JSON (nulo se não for número).
create function app.jnum(x jsonb) returns numeric
language sql immutable
set search_path = ''
as $$ select case when jsonb_typeof(x) = 'number' then (x #>> '{}')::numeric end $$;

-- Inteiro JSON entre os limites, escrito sem casa decimal (65.0 não serve: o texto vira integer no espelho).
create function app.jint_between(x jsonb, lo numeric, hi numeric) returns boolean
language sql immutable
set search_path = ''
as $$ select coalesce(jsonb_typeof(x) = 'number' and (x #>> '{}') ~ '^-?[0-9]+$' and app.jnum(x) between lo and hi, false) $$;

-- Valor em reais JSON: de zero até o que cabe em numeric(18,2) (o mesmo MAX_MONEY de src/import/values.ts).
create function app.jmoney(x jsonb) returns boolean
language sql immutable
set search_path = ''
as $$ select coalesce(app.jnum(x) >= 0 and app.jnum(x) < 1e16, false) $$;

-- Texto JSON não vazio.
create function app.jtext(x jsonb) returns boolean
language sql immutable
set search_path = ''
as $$ select coalesce(jsonb_typeof(x) = 'string' and trim(x #>> '{}') <> '', false) $$;

-- Campos fora da lista, separados por vírgula (nulo quando não há).
create function app.unknown_keys(x jsonb, allowed text[]) returns text
language sql immutable
set search_path = ''
as $$ select string_agg(k, ', ' order by k) from jsonb_object_keys(x) k where k <> all (allowed) $$;

-- As mesmas regras do esquema do console (src/lib/planSchema.ts), com os caminhos dos campos. Devolve a lista de
-- problemas ({path, message}), vazia quando a versão está boa.
create function app.plan_snapshot_errors(p jsonb, p_classes text[]) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  e jsonb := '[]'::jsonb;
  x jsonb;
  i integer;
  k text;
  path text;
  v_unknown text;
  v_people text[] := '{}';
  v_assets text[] := '{}';
  v_titular integer := 0;
  v_conjuge integer := 0;
  r jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return jsonb_build_array(app.plan_error('', 'A versão do plano precisa ser um objeto.'));
  end if;
  if length(p::text) > 500000 then
    return jsonb_build_array(app.plan_error('', 'A versão do plano passa do tamanho máximo.'));
  end if;
  foreach k in array array['people', 'otherAssets', 'cashFlows', 'events', 'goals'] loop
    if jsonb_typeof(p -> k) is distinct from 'array' then
      e := e || app.plan_error(k, 'Lista ausente.');
    elsif jsonb_array_length(p -> k) > 200 then
      e := e || app.plan_error(k, 'Mais de 200 itens.');
    end if;
  end loop;
  if jsonb_typeof(p -> 'rules') is distinct from 'object' then
    e := e || app.plan_error('rules', 'Regras de gasto flexível ausentes.');
  end if;
  -- Sem as listas, o resto não dá para conferir.
  if jsonb_array_length(e) > 0 then
    return e;
  end if;
  v_unknown := app.unknown_keys(p, array['legacyMin', 'people', 'otherAssets', 'cashFlows', 'events', 'goals', 'rules']);
  if v_unknown is not null then
    e := e || app.plan_error('', format('Campo desconhecido: %s.', v_unknown));
  end if;

  if p ? 'legacyMin' and not app.jmoney(p -> 'legacyMin') then
    e := e || app.plan_error('legacyMin', 'O legado mínimo precisa ser um valor em reais, sem ser negativo.');
  end if;

  -- Pessoas.
  for i in 0 .. jsonb_array_length(p -> 'people') - 1 loop
    x := p -> 'people' -> i;
    path := format('people.%s', i);
    if jsonb_typeof(x) <> 'object' then
      e := e || app.plan_error(path, 'Pessoa inválida.');
      continue;
    end if;
    v_unknown := app.unknown_keys(x, array['id', 'name', 'birthDate', 'sex', 'role', 'retirementAge']);
    if v_unknown is not null then e := e || app.plan_error(path, format('Campo desconhecido: %s.', v_unknown)); end if;
    if not app.jtext(x -> 'id') then
      e := e || app.plan_error(path || '.id', 'Pessoa sem identificador.');
    elsif (x ->> 'id') = any (v_people) then
      e := e || app.plan_error(path || '.id', 'Pessoa repetida.');
    end if;
    v_people := v_people || (x ->> 'id');
    if not app.jtext(x -> 'name') then e := e || app.plan_error(path || '.name', 'Informe o nome.'); end if;
    if jsonb_typeof(x -> 'birthDate') is distinct from 'string' or app.try_date(x ->> 'birthDate') is null then
      e := e || app.plan_error(path || '.birthDate', 'Data de nascimento inválida: use dia, mês e ano.');
    elsif app.try_date(x ->> 'birthDate') > app.today_brazil() then
      e := e || app.plan_error(path || '.birthDate', 'A data de nascimento está no futuro.');
    elsif app.try_date(x ->> 'birthDate') < date '1900-01-01' then
      e := e || app.plan_error(path || '.birthDate', 'A data de nascimento é antes de 1900.');
    end if;
    if jsonb_typeof(x -> 'sex') is distinct from 'string' or (x ->> 'sex') not in ('M', 'F') then
      e := e || app.plan_error(path || '.sex', 'Escolha o sexo.');
    end if;
    if jsonb_typeof(x -> 'role') is distinct from 'string' or (x ->> 'role') not in ('titular', 'conjuge', 'filho') then
      e := e || app.plan_error(path || '.role', 'Escolha o papel na família.');
    elsif x ->> 'role' = 'titular' then
      v_titular := v_titular + 1;
    elsif x ->> 'role' = 'conjuge' then
      v_conjuge := v_conjuge + 1;
    end if;
    if x ? 'retirementAge' and not app.jint_between(x -> 'retirementAge', 30, 100) then
      e := e || app.plan_error(path || '.retirementAge', 'A idade de aposentadoria vai de 30 a 100 anos.');
    end if;
  end loop;
  if v_titular <> 1 then
    e := e || app.plan_error('people', case when v_titular = 0 then 'O plano precisa de um titular.' else 'O plano tem um titular só.' end);
  end if;
  if v_conjuge > 1 then
    e := e || app.plan_error('people', 'O plano tem no máximo um cônjuge.');
  end if;

  -- Bens declarados.
  for i in 0 .. jsonb_array_length(p -> 'otherAssets') - 1 loop
    x := p -> 'otherAssets' -> i;
    path := format('otherAssets.%s', i);
    if jsonb_typeof(x) <> 'object' then
      e := e || app.plan_error(path, 'Bem inválido.');
      continue;
    end if;
    v_unknown := app.unknown_keys(x, array['id', 'kind', 'name', 'value', 'classCode', 'inSimulation', 'canBeSold', 'netSaleValue', 'annualIncome']);
    if v_unknown is not null then e := e || app.plan_error(path, format('Campo desconhecido: %s.', v_unknown)); end if;
    if not app.jtext(x -> 'id') then
      e := e || app.plan_error(path || '.id', 'Bem sem identificador.');
    elsif (x ->> 'id') = any (v_assets) then
      e := e || app.plan_error(path || '.id', 'Bem repetido.');
    end if;
    v_assets := v_assets || (x ->> 'id');
    if jsonb_typeof(x -> 'kind') is distinct from 'string' or (x ->> 'kind') not in ('previdencia', 'imovel', 'empresa', 'exterior') then
      e := e || app.plan_error(path || '.kind', 'Escolha o tipo do bem.');
    end if;
    if not app.jtext(x -> 'name') then e := e || app.plan_error(path || '.name', 'Informe o nome do bem.'); end if;
    if not app.jmoney(x -> 'value') then
      e := e || app.plan_error(path || '.value', 'Informe o valor em reais, sem ser negativo.');
    end if;
    foreach k in array array['netSaleValue', 'annualIncome'] loop
      if x ? k and not app.jmoney(x -> k) then
        e := e || app.plan_error(path || '.' || k, 'Informe um valor em reais, sem ser negativo.');
      end if;
    end loop;
    foreach k in array array['inSimulation', 'canBeSold'] loop
      if x ? k and jsonb_typeof(x -> k) <> 'boolean' then e := e || app.plan_error(path || '.' || k, 'Use sim ou não.'); end if;
    end loop;
    if x ? 'classCode' and not app.jtext(x -> 'classCode') then
      e := e || app.plan_error(path || '.classCode', 'Classe inválida.');
    elsif x ? 'classCode' and not ((x ->> 'classCode') = any (p_classes)) then
      e := e || app.plan_error(path || '.classCode', format('A classe %s não está nas premissas vigentes.', x ->> 'classCode'));
    end if;
    if (x -> 'inSimulation') = 'true'::jsonb and not (x ? 'classCode') then
      e := e || app.plan_error(path || '.classCode', 'O bem que entra na simulação precisa de uma classe.');
    end if;
  end loop;

  -- Renda e gastos.
  for i in 0 .. jsonb_array_length(p -> 'cashFlows') - 1 loop
    x := p -> 'cashFlows' -> i;
    path := format('cashFlows.%s', i);
    if jsonb_typeof(x) <> 'object' then
      e := e || app.plan_error(path, 'Fluxo inválido.');
      continue;
    end if;
    v_unknown := app.unknown_keys(x, array['kind', 'name', 'annualAmountReal', 'startYear', 'endYear', 'otherAssetId']);
    if v_unknown is not null then e := e || app.plan_error(path, format('Campo desconhecido: %s.', v_unknown)); end if;
    if jsonb_typeof(x -> 'kind') is distinct from 'string'
       or (x ->> 'kind') not in ('renda', 'dividendos', 'aluguel', 'gasto_essencial', 'gasto_estilo') then
      e := e || app.plan_error(path || '.kind', 'Escolha o tipo.');
    end if;
    if not app.jtext(x -> 'name') then e := e || app.plan_error(path || '.name', 'Informe o nome.'); end if;
    if not app.jmoney(x -> 'annualAmountReal') then
      e := e || app.plan_error(path || '.annualAmountReal', 'Informe o valor anual em reais, sem ser negativo.');
    end if;
    if not app.jint_between(x -> 'startYear', 1900, 2200) then
      e := e || app.plan_error(path || '.startYear', 'Ano de início inválido.');
    end if;
    if not app.jint_between(x -> 'endYear', 1900, 2200) then
      e := e || app.plan_error(path || '.endYear', 'Ano de fim inválido.');
    elsif app.jint_between(x -> 'startYear', 1900, 2200) and app.jnum(x -> 'endYear') < app.jnum(x -> 'startYear') then
      e := e || app.plan_error(path || '.endYear', 'O ano de fim vem antes do ano de início.');
    end if;
    if x ? 'otherAssetId' and not (app.jtext(x -> 'otherAssetId') and (x ->> 'otherAssetId') = any (v_assets)) then
      e := e || app.plan_error(path || '.otherAssetId', 'O bem ligado a este fluxo não está no plano.');
    end if;
  end loop;

  -- Eventos.
  for i in 0 .. jsonb_array_length(p -> 'events') - 1 loop
    x := p -> 'events' -> i;
    path := format('events.%s', i);
    if jsonb_typeof(x) <> 'object' then
      e := e || app.plan_error(path, 'Evento inválido.');
      continue;
    end if;
    v_unknown := app.unknown_keys(x, array['name', 'direction', 'amountReal', 'year', 'month', 'recurrence', 'everyN', 'endYear']);
    if v_unknown is not null then e := e || app.plan_error(path, format('Campo desconhecido: %s.', v_unknown)); end if;
    if not app.jtext(x -> 'name') then e := e || app.plan_error(path || '.name', 'Informe o nome do evento.'); end if;
    if jsonb_typeof(x -> 'direction') is distinct from 'string' or (x ->> 'direction') not in ('entrada', 'saida') then
      e := e || app.plan_error(path || '.direction', 'Escolha entrada ou saída.');
    end if;
    if not app.jmoney(x -> 'amountReal') then
      e := e || app.plan_error(path || '.amountReal', 'Informe o valor em reais, sem ser negativo.');
    end if;
    if not app.jint_between(x -> 'year', 1900, 2200) then e := e || app.plan_error(path || '.year', 'Ano inválido.'); end if;
    if x ? 'month' and not app.jint_between(x -> 'month', 1, 12) then
      e := e || app.plan_error(path || '.month', 'Use um mês de 1 a 12.');
    end if;
    if jsonb_typeof(x -> 'recurrence') is distinct from 'string' or (x ->> 'recurrence') not in ('unica', 'anual', 'a_cada_n') then
      e := e || app.plan_error(path || '.recurrence', 'Escolha a recorrência.');
    elsif x ->> 'recurrence' <> 'unica' then
      if not app.jint_between(x -> 'endYear', 1900, 2200) then
        e := e || app.plan_error(path || '.endYear', 'O evento recorrente precisa de um ano de fim.');
      elsif app.jint_between(x -> 'year', 1900, 2200) and app.jnum(x -> 'endYear') < app.jnum(x -> 'year') then
        e := e || app.plan_error(path || '.endYear', 'O ano de fim vem antes do primeiro ano.');
      end if;
    end if;
    if x ->> 'recurrence' = 'a_cada_n' and not app.jint_between(x -> 'everyN', 1, 200) then
      e := e || app.plan_error(path || '.everyN', 'Informe a cada quantos anos.');
    elsif x ? 'everyN' and not app.jint_between(x -> 'everyN', 1, 200) then
      e := e || app.plan_error(path || '.everyN', 'O intervalo é de pelo menos 1 ano.');
    end if;
    if x ->> 'recurrence' = 'unica' and x ? 'endYear' and not app.jint_between(x -> 'endYear', 1900, 2200) then
      e := e || app.plan_error(path || '.endYear', 'Ano de fim inválido.');
    end if;
  end loop;

  -- Metas.
  for i in 0 .. jsonb_array_length(p -> 'goals') - 1 loop
    x := p -> 'goals' -> i;
    path := format('goals.%s', i);
    if jsonb_typeof(x) <> 'object' then
      e := e || app.plan_error(path, 'Meta inválida.');
      continue;
    end if;
    v_unknown := app.unknown_keys(x, array['kind', 'personId', 'targetAge', 'amount']);
    if v_unknown is not null then e := e || app.plan_error(path, format('Campo desconhecido: %s.', v_unknown)); end if;
    if jsonb_typeof(x -> 'kind') is distinct from 'string' or (x ->> 'kind') not in ('padrao_de_vida', 'legado') then
      e := e || app.plan_error(path || '.kind', 'Tipo de meta desconhecido.');
    end if;
    -- Os campos valem para os dois tipos, quando vêm; cada tipo exige os seus.
    if x ? 'personId' and not app.jtext(x -> 'personId') then
      e := e || app.plan_error(path || '.personId', 'Escolha a pessoa da meta.');
    elsif x ->> 'kind' = 'padrao_de_vida' and not (x ? 'personId') then
      e := e || app.plan_error(path || '.personId', 'Escolha a pessoa da meta.');
    elsif x ->> 'kind' = 'padrao_de_vida' and not ((x ->> 'personId') = any (v_people)) then
      e := e || app.plan_error(path || '.personId', 'A pessoa da meta não está no plano.');
    end if;
    if (x ? 'targetAge' or x ->> 'kind' = 'padrao_de_vida') and not app.jint_between(x -> 'targetAge', 60, 110) then
      e := e || app.plan_error(path || '.targetAge', 'A idade da meta vai de 60 a 110 anos.');
    end if;
    if (x ? 'amount' or x ->> 'kind' = 'legado') and not app.jmoney(x -> 'amount') then
      e := e || app.plan_error(path || '.amount', 'Informe o legado em reais, sem ser negativo.');
    end if;
  end loop;

  -- Regras de gasto flexível (as faixas do motor).
  r := p -> 'rules';
  v_unknown := app.unknown_keys(r, array['enabled', 'mode', 'lower', 'upper', 'cut', 'raise', 'floor', 'cap', 'noCutLastYears']);
  if v_unknown is not null then e := e || app.plan_error('rules', format('Campo desconhecido: %s.', v_unknown)); end if;
  if jsonb_typeof(r -> 'enabled') is distinct from 'boolean' then e := e || app.plan_error('rules.enabled', 'Use sim ou não.'); end if;
  if jsonb_typeof(r -> 'mode') is distinct from 'string' or (r ->> 'mode') not in ('trajetoria_referencia', 'guyton_klinger') then
    e := e || app.plan_error('rules.mode', 'Escolha o modo das regras.');
  end if;
  if not coalesce(app.jnum(r -> 'lower') > 0, false) then
    e := e || app.plan_error('rules.lower', 'O gatilho inferior precisa ser maior que zero.');
  end if;
  if app.jnum(r -> 'upper') is null or app.jnum(r -> 'upper') > 5 then
    e := e || app.plan_error('rules.upper', 'O gatilho superior vai até 500%.');
  elsif app.jnum(r -> 'lower') is not null and app.jnum(r -> 'upper') <= app.jnum(r -> 'lower') then
    e := e || app.plan_error('rules.upper', 'O gatilho superior precisa ser maior que o inferior.');
  end if;
  if not coalesce(app.jnum(r -> 'cut') >= 0 and app.jnum(r -> 'cut') < 1, false) then
    e := e || app.plan_error('rules.cut', 'O corte vai de 0% a menos de 100%.');
  end if;
  if not coalesce(app.jnum(r -> 'raise') >= 0 and app.jnum(r -> 'raise') <= 1, false) then
    e := e || app.plan_error('rules.raise', 'O aumento vai de 0% a 100%.');
  end if;
  if not coalesce(app.jnum(r -> 'floor') > 0 and app.jnum(r -> 'floor') <= 1, false) then
    e := e || app.plan_error('rules.floor', 'O piso vai de mais de 0% a 100% do estilo de vida inicial.');
  end if;
  if not coalesce(app.jnum(r -> 'cap') >= 1 and app.jnum(r -> 'cap') <= 5, false) then
    e := e || app.plan_error('rules.cap', 'O teto vai de 100% a 500% do estilo de vida inicial.');
  end if;
  if not app.jint_between(r -> 'noCutLastYears', 0, 200) then
    e := e || app.plan_error('rules.noCutLastYears', 'Use um número inteiro de anos.');
  end if;
  return e;
end
$$;

-- Gravação da versão do plano ----------------------------------------------------------------------------------------

create function public.save_plan_version(p_household uuid, p_base_month date, p_snapshot jsonb, p_note text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  h public.households;
  v_closed date;
  v_latest public.plan_versions;
  v_classes text[];
  e jsonb;
  v_note text := trim(coalesce(p_note, ''));
  v_version integer;
  v_id uuid;
  v_reset integer;
  v_people jsonb := '{}'::jsonb;
  v_assets jsonb := '{}'::jsonb;
  x jsonb;
  v_uuid uuid;
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para mudar o plano.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  select * into h from public.households where id = p_household for update;
  if not found or not app.can_edit_plan(p_household) then
    raise exception 'Sem permissão para mudar o plano desta família.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  if p_base_month is null or p_base_month <> date_trunc('month', p_base_month)::date then
    raise exception 'Use o primeiro dia do mês como mês-base.' using errcode = '22023', hint = 'mes_base';
  end if;
  if p_base_month > date_trunc('month', app.today_brazil())::date then
    raise exception 'O mês-base não pode estar no futuro: os valores do plano são em reais do mês-base.' using errcode = 'P0001', hint = 'mes_base';
  end if;
  select max(ref_date) into v_closed from public.household_months where household_id = h.id and status = 'fechado';
  if v_closed is not null and p_base_month <= v_closed then
    raise exception 'O mês de % já está fechado para esta família: o mês-base precisa ser depois dele.', to_char(v_closed, 'MM/YYYY')
      using errcode = 'P0001', hint = 'mes_fechado';
  end if;
  select * into v_latest from public.plan_versions where household_id = h.id order by base_month desc limit 1;
  if v_latest.id is not null and p_base_month < v_latest.base_month then
    raise exception 'A versão % tem mês-base %: a nova versão precisa ter mês-base igual ou depois dele.',
      v_latest.version, to_char(v_latest.base_month, 'MM/YYYY') using errcode = 'P0001', hint = 'mes_base';
  end if;

  select coalesce(array_agg(c.class_code), '{}') into v_classes
    from public.cma_classes c join public.cma_versions v on v.id = c.cma_version_id where v.status = 'vigente';
  e := app.plan_snapshot_errors(p_snapshot, v_classes);
  if v_note = '' or length(v_note) > 500 then
    e := e || app.plan_error('note', 'Diga em poucas palavras o que mudou (até 500 caracteres).');
  end if;
  if jsonb_array_length(e) > 0 then
    return jsonb_build_object('ok', false, 'errors', e);
  end if;

  -- Meses que precisam de nova conferência e nova rodada: a partir do mês-base, os ainda não fechados.
  update public.household_months set status = 'importado', checks = null
   where household_id = h.id and ref_date >= app.month_end_of(p_base_month) and status in ('conferido', 'bloqueado', 'rodado');
  get diagnostics v_reset = row_count;

  select coalesce(max(version), 0) + 1 into v_version from public.plan_versions where household_id = h.id;
  insert into public.plan_versions (household_id, version, snapshot, base_month, note, created_by)
  values (h.id, v_version, p_snapshot, p_base_month, v_note, auth.uid())
  on conflict (household_id, base_month) do update
     set version = excluded.version, snapshot = excluded.snapshot, note = excluded.note, created_by = excluded.created_by,
         created_at = now()
  returning id into v_id;

  -- O plano nas tabelas da família: o da versão mais recente (esta).
  delete from public.goals where household_id = h.id;
  delete from public.cash_flows where household_id = h.id;
  delete from public.events where household_id = h.id;
  delete from public.other_assets where household_id = h.id;
  delete from public.people where household_id = h.id;
  for x in select value from jsonb_array_elements(p_snapshot -> 'people') loop
    insert into public.people (household_id, name, birth_date, sex, role, retirement_age)
    values (h.id, trim(x ->> 'name'), (x ->> 'birthDate')::date, x ->> 'sex', (x ->> 'role')::public.person_role,
            (x ->> 'retirementAge')::integer)
    returning id into v_uuid;
    v_people := v_people || jsonb_build_object(x ->> 'id', v_uuid);
  end loop;
  for x in select value from jsonb_array_elements(p_snapshot -> 'otherAssets') loop
    insert into public.other_assets (household_id, kind, name, value, annual_income, can_be_sold, net_sale_value, class_code, in_simulation)
    values (h.id, (x ->> 'kind')::public.other_asset_kind, trim(x ->> 'name'), (x ->> 'value')::numeric, (x ->> 'annualIncome')::numeric,
            coalesce((x ->> 'canBeSold')::boolean, false), (x ->> 'netSaleValue')::numeric, x ->> 'classCode',
            coalesce((x ->> 'inSimulation')::boolean, false))
    returning id into v_uuid;
    v_assets := v_assets || jsonb_build_object(x ->> 'id', v_uuid);
  end loop;
  insert into public.cash_flows (household_id, kind, name, annual_amount_real, start_year, end_year, other_asset_id)
  select h.id, (c ->> 'kind')::public.cash_flow_kind, trim(c ->> 'name'), (c ->> 'annualAmountReal')::numeric,
         (c ->> 'startYear')::integer, (c ->> 'endYear')::integer, (v_assets ->> (c ->> 'otherAssetId'))::uuid
    from jsonb_array_elements(p_snapshot -> 'cashFlows') c;
  insert into public.events (household_id, name, direction, amount_real, year, month, recurrence, every_n, end_year)
  select h.id, trim(ev ->> 'name'), (ev ->> 'direction')::public.event_direction, (ev ->> 'amountReal')::numeric,
         (ev ->> 'year')::integer, (ev ->> 'month')::integer, (ev ->> 'recurrence')::public.event_recurrence,
         (ev ->> 'everyN')::integer, (ev ->> 'endYear')::integer
    from jsonb_array_elements(p_snapshot -> 'events') ev;
  insert into public.goals (household_id, kind, person_id, target_age, amount)
  select h.id, (g ->> 'kind')::public.goal_kind, (v_people ->> (g ->> 'personId'))::uuid, (g ->> 'targetAge')::integer,
         (g ->> 'amount')::numeric
    from jsonb_array_elements(p_snapshot -> 'goals') g;

  perform app.audit('salvar_plano', 'plan_versions', v_id::text, h.id,
                    jsonb_build_object('versao', v_version, 'mes_base', p_base_month, 'meses_reabertos', v_reset,
                                       'substituiu', v_latest.base_month = p_base_month));
  return jsonb_build_object('ok', true, 'plan_version_id', v_id, 'version', v_version, 'base_month', p_base_month,
                            'months_reset', v_reset);
end
$$;

revoke all on function app.can_edit_plan(uuid), app.today_brazil(), app.plan_error(text, text), app.jnum(jsonb),
  app.jint_between(jsonb, numeric, numeric), app.jmoney(jsonb), app.jtext(jsonb), app.unknown_keys(jsonb, text[]),
  app.plan_snapshot_errors(jsonb, text[]) from public;
revoke all on function public.plan_options(), public.household_editor(uuid), public.save_household(uuid, jsonb),
  public.save_plan_version(uuid, date, jsonb, text) from public, anon;
grant execute on function public.plan_options(), public.household_editor(uuid), public.save_household(uuid, jsonb),
  public.save_plan_version(uuid, date, jsonb, text) to authenticated;
