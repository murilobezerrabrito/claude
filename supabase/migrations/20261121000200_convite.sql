-- AWARE Objective, Fase 3, etapa 3c: convite do cliente AI (SPEC, "1. Entrar": convite do responsável, sem cadastro
-- aberto; D-071: só por e-mail, e quem convida nunca vê o link). A função do servidor `client-invite` confere com o
-- token de quem convida (client_invite_check), manda o convite pelo Auth com a chave do servidor e grava o papel
-- (record_client_invite). Um cliente por família (o titular); o convite pendente pode ser reenviado ou trocado de
-- e-mail; o acesso pode ser tirado. Decisões na D-074.

-- Quem cuida do acesso do cliente: a gestão e o responsável da família AI (as mesmas regras do plano).
create function app.can_manage_client(p_actor uuid, p_household uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.households h
     where h.id = p_household and h.channel = 'ai' and h.status = 'ativa'
       and (app.user_has_role(p_actor, 'gestao') or (h.owner_id = p_actor and app.user_has_role(p_actor, 'responsavel'))))
$$;

-- Situação da conta de um cliente: ativo depois de cadastrar o app autenticador; pendente antes disso.
create function app.client_account_state(p_user uuid) returns text
language sql stable security definer
set search_path = ''
as $$
  select case when exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.status = 'verified') then 'ativo' else 'pendente' end
$$;

-- Confere o convite com o token de quem convida (segundo fator) e diz se é um convite novo ou o reenvio do pendente.
create function public.client_invite_check(p_household uuid, p_email text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user uuid;
  v_other record;
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para convidar o cliente.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  if not app.can_manage_client(auth.uid(), p_household) then
    raise exception 'Só a gestão ou o responsável da família AI ativa convida o cliente.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  if v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' or length(v_email) > 254 then
    raise exception 'Informe um e-mail válido.' using errcode = '22023', hint = 'email_invalido';
  end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is not null and exists (select 1 from public.user_roles where user_id = v_user and role <> 'cliente_ai') then
    raise exception 'Este e-mail é de um usuário interno; o cliente precisa de um e-mail próprio.' using errcode = 'P0001', hint = 'email_interno';
  end if;
  if v_user is not null and exists (select 1 from public.user_roles where user_id = v_user and role = 'cliente_ai' and household_id <> p_household) then
    raise exception 'Este e-mail já é de cliente de outra família.' using errcode = 'P0001', hint = 'email_de_outra_familia';
  end if;
  for v_other in select ur.user_id from public.user_roles ur where ur.household_id = p_household and ur.role = 'cliente_ai' loop
    if app.client_account_state(v_other.user_id) = 'ativo' then
      if v_other.user_id = v_user then
        raise exception 'Este cliente já entrou no app; não precisa de convite.' using errcode = 'P0001', hint = 'cliente_ativo';
      end if;
      raise exception 'A família já tem um cliente com acesso; tire o acesso antes de convidar outro.' using errcode = 'P0001', hint = 'familia_com_cliente';
    end if;
  end loop;
  -- Quem já abriu o convite (e-mail confirmado) e não terminou o cadastro recebe o link de criar senha, não outro convite.
  return jsonb_build_object('actor', auth.uid(), 'email', v_email, 'user_id', v_user,
                            'state', case when v_user is null then 'novo' else 'reenvio' end,
                            'confirmed', coalesce((select email_confirmed_at is not null from auth.users where id = v_user), false));
end
$$;

-- Grava o convite enviado (só a função do servidor): o papel de cliente na família, no lugar de um convite pendente
-- para outro e-mail, e a auditoria. Confere de novo quem convidou.
create function public.record_client_invite(p_actor uuid, p_household uuid, p_user uuid, p_email text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_replaced text[];
begin
  if p_actor is null or not app.can_manage_client(p_actor, p_household) then
    raise exception 'Só a gestão ou o responsável da família AI ativa convida o cliente.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  if not exists (select 1 from auth.users where id = p_user and lower(email) = lower(trim(p_email))) then
    raise exception 'O convite não é deste e-mail.' using errcode = '22023', hint = 'convite_invalido';
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user and (role <> 'cliente_ai' or household_id <> p_household)) then
    raise exception 'Este e-mail já tem outro papel.' using errcode = 'P0001', hint = 'email_com_papel';
  end if;
  if exists (select 1 from public.user_roles ur where ur.household_id = p_household and ur.role = 'cliente_ai' and ur.user_id <> p_user
                and app.client_account_state(ur.user_id) = 'ativo') then
    raise exception 'A família já tem um cliente com acesso; tire o acesso antes de convidar outro.' using errcode = 'P0001', hint = 'familia_com_cliente';
  end if;
  -- O convite pendente para outro e-mail sai: um cliente por família.
  with gone as (
    delete from public.user_roles ur
     where ur.household_id = p_household and ur.role = 'cliente_ai' and ur.user_id <> p_user
    returning ur.user_id
  )
  select array_agg(u.email) into v_replaced from gone join auth.users u on u.id = gone.user_id;
  insert into public.user_roles (user_id, household_id, role) values (p_user, p_household, 'cliente_ai')
  on conflict (user_id, role, household_id) do nothing;
  perform app.audit('convidar_cliente', 'user_roles', p_user::text, p_household,
                    jsonb_build_object('email', lower(trim(p_email)), 'convite_trocado', v_replaced));
  return jsonb_build_object('email', lower(trim(p_email)), 'state', app.client_account_state(p_user));
end
$$;

-- Acesso do cliente na página da família: o e-mail, a data do convite, se já entrou e se cadastrou o autenticador.
create function public.client_access_of(p_household uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not app.can_read_household(p_household) or not (app.is_internal() or app.can_write_plan(p_household)) then
    raise exception 'Sem acesso a esta família.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  perform app.audit('ver_acesso_cliente', 'user_roles', null, p_household, null);
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', u.id, 'email', u.email, 'invited_at', coalesce(u.invited_at, ur.created_at), 'last_sign_in_at', u.last_sign_in_at,
           'state', app.client_account_state(u.id)) order by ur.created_at), '[]'::jsonb)
    into result
    from public.user_roles ur join auth.users u on u.id = ur.user_id
   where ur.household_id = p_household and ur.role = 'cliente_ai';
  return jsonb_build_object('can_manage', app.mfa_ok() and app.can_manage_client(auth.uid(), p_household), 'clients', result);
end
$$;

-- Tira o acesso do cliente (o papel sai; a conta fica sem acesso a nada).
create function public.revoke_client_access(p_household uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not app.mfa_ok() or not app.can_manage_client(auth.uid(), p_household) then
    raise exception 'Só a gestão ou o responsável da família AI ativa cuida do acesso do cliente.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  delete from public.user_roles where user_id = p_user and household_id = p_household and role = 'cliente_ai';
  if not found then
    raise exception 'Este cliente não tem acesso a esta família.' using errcode = 'P0002', hint = 'cliente_inexistente';
  end if;
  perform app.audit('tirar_acesso_cliente', 'user_roles', p_user::text, p_household,
                    jsonb_build_object('email', (select email from auth.users where id = p_user)));
end
$$;

revoke all on function app.can_manage_client(uuid, uuid), app.client_account_state(uuid) from public;
revoke all on function public.client_invite_check(uuid, text), public.record_client_invite(uuid, uuid, uuid, text),
  public.client_access_of(uuid), public.revoke_client_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.client_invite_check(uuid, text), public.client_access_of(uuid), public.revoke_client_access(uuid, uuid)
  to authenticated;
grant execute on function public.record_client_invite(uuid, uuid, uuid, text) to service_role;
