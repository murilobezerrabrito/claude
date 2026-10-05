-- AWARE Objective, Fase 2, etapa 1: bloqueio após 5 tentativas erradas de senha ou de segundo fator (SPEC,
-- "Segurança"). Os ganchos do Auth chamam estas funções a cada tentativa; o bloqueio vale até o comitê desbloquear
-- (D-042). O bloqueio e o desbloqueio vão para a auditoria.
-- Senha e segundo fator têm contadores separados: a senha certa zera só o da senha, para que quem sabe a senha não
-- consiga tentar códigos do autenticador sem limite (entrando de novo a cada 4 erros). O segundo fator certo conclui
-- o login e zera os dois.

create table app.login_failures (
  user_id uuid primary key references auth.users (id) on delete cascade,
  password_failures integer not null default 0 check (password_failures >= 0),
  mfa_failures integer not null default 0 check (mfa_failures >= 0),
  locked_at timestamptz,
  last_failure_at timestamptz
);
revoke all on app.login_failures from public, anon, authenticated;

-- Limite de tentativas erradas seguidas.
create function app.max_login_failures() returns integer language sql immutable as $$ select 5 $$;

-- Registra uma tentativa ('senha' ou 'segundo_fator') e decide: continuar ou recusar (usuário bloqueado).
create function app.register_login_attempt(p_user uuid, p_valid boolean, p_kind text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  row app.login_failures;
  blocked constant jsonb := jsonb_build_object(
    'decision', 'reject',
    'message', 'Acesso bloqueado depois de 5 tentativas erradas. Peça o desbloqueio ao comitê.',
    'should_logout_user', true);
begin
  if p_kind not in ('senha', 'segundo_fator') then
    raise exception 'Tipo de tentativa desconhecido: %', p_kind;
  end if;
  select * into row from app.login_failures where user_id = p_user for update;
  if found and row.locked_at is not null then
    return blocked;
  end if;
  if p_valid then
    if p_kind = 'senha' then
      update app.login_failures set password_failures = 0 where user_id = p_user;
    else
      delete from app.login_failures where user_id = p_user;
    end if;
    return jsonb_build_object('decision', 'continue');
  end if;
  insert into app.login_failures as f (user_id, password_failures, mfa_failures, last_failure_at)
  values (p_user, case when p_kind = 'senha' then 1 else 0 end, case when p_kind = 'segundo_fator' then 1 else 0 end, now())
  on conflict (user_id) do update
    set password_failures = f.password_failures + case when p_kind = 'senha' then 1 else 0 end,
        mfa_failures = f.mfa_failures + case when p_kind = 'segundo_fator' then 1 else 0 end,
        last_failure_at = now()
  returning * into row;
  if greatest(row.password_failures, row.mfa_failures) >= app.max_login_failures() then
    update app.login_failures set locked_at = now() where user_id = p_user;
    insert into public.audit_log (actor_id, action, target_table, target_id, details)
    values (p_user, 'bloqueio', 'auth.users', p_user::text,
            jsonb_build_object('tipo', p_kind, 'senha', row.password_failures, 'segundo_fator', row.mfa_failures));
    return blocked;
  end if;
  return jsonb_build_object('decision', 'continue');
end
$$;

-- Gancho de tentativa de senha. Evento: {"user_id": "...", "valid": true|false}.
create function public.hook_password_verification_attempt(event jsonb)
returns jsonb
language sql security definer
set search_path = ''
as $$ select app.register_login_attempt((event ->> 'user_id')::uuid, (event ->> 'valid')::boolean, 'senha') $$;

-- Gancho de tentativa do segundo fator. Evento: {"factor_id": "...", "user_id": "...", "valid": true|false}.
create function public.hook_mfa_verification_attempt(event jsonb)
returns jsonb
language sql security definer
set search_path = ''
as $$ select app.register_login_attempt((event ->> 'user_id')::uuid, (event ->> 'valid')::boolean, 'segundo_fator') $$;

revoke all on function app.register_login_attempt(uuid, boolean, text), app.max_login_failures() from public;
revoke all on function public.hook_password_verification_attempt(jsonb), public.hook_mfa_verification_attempt(jsonb)
  from public, anon, authenticated;
grant usage on schema app to supabase_auth_admin;
grant execute on function public.hook_password_verification_attempt(jsonb), public.hook_mfa_verification_attempt(jsonb)
  to supabase_auth_admin;

-- Desbloqueio pelo comitê (gerenciar usuários), com segundo fator; grava na auditoria.
create function public.unlock_user(p_user uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not (app.mfa_ok() and app.has_role('comite')) then
    raise exception 'Só o comitê desbloqueia usuários.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  delete from app.login_failures where user_id = p_user;
  perform app.audit('desbloqueio', 'auth.users', p_user::text, null, null);
end
$$;

revoke all on function public.unlock_user(uuid) from public, anon;
grant execute on function public.unlock_user(uuid) to authenticated;
