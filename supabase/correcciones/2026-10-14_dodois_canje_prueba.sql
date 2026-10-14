-- PRUEBA TEMPORAL de la API de Dodo IS: el canje del código por el token se hace desde Supabase, porque Dodo bloquea a Vercel.
-- La llave secreta se guarda en el Vault de Supabase (cifrada) y solo la lee esta función. Solo admin.
-- Córrelo en Supabase → SQL Editor. Antes de correrlo, reemplaza PEGA_AQUI_EL_CLIENT_SECRET por el Client Secret de la app
-- "Dodo MX" (el mismo de DODOIS_CLIENT_SECRET en Vercel). No lo compartas por chat.

create extension if not exists http with schema extensions;

-- 1. La llave secreta, cifrada en el Vault (si ya existe, se actualiza).
do $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'dodois_client_secret';
  if v_id is null then
    perform vault.create_secret('PEGA_AQUI_EL_CLIENT_SECRET', 'dodois_client_secret', 'Client Secret de la app Dodo MX (Dodo IS)');
  else
    perform vault.update_secret(v_id, 'PEGA_AQUI_EL_CLIENT_SECRET');
  end if;
end $$;

-- 2. Canje: código + verificador PKCE → token. Lo llama la app (solo admin) y no deja nada guardado.
create or replace function dodois_canjear_codigo(p_client_id text, p_code text, p_verifier text, p_redirect text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_secreto text; v_resp extensions.http_response;
begin
  if coalesce(mi_rol()::text, '') <> 'admin' then raise exception 'Solo admin.'; end if;
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'dodois_client_secret';
  if v_secreto is null or v_secreto = 'PEGA_AQUI_EL_CLIENT_SECRET' then raise exception 'Falta la llave secreta de Dodo IS en el Vault.'; end if;
  v_resp := extensions.http_post(
    'https://auth.dodois.com/connect/token',
    'grant_type=authorization_code'
      || '&code=' || extensions.urlencode(p_code)
      || '&redirect_uri=' || extensions.urlencode(p_redirect)
      || '&client_id=' || extensions.urlencode(p_client_id)
      || '&client_secret=' || extensions.urlencode(v_secreto)
      || '&code_verifier=' || extensions.urlencode(p_verifier),
    'application/x-www-form-urlencoded');
  return jsonb_build_object('status', v_resp.status, 'cuerpo',
    case when left(v_resp.content, 1) = '{' then v_resp.content::jsonb else to_jsonb(left(v_resp.content, 300)) end);
end $$;
revoke execute on function dodois_canjear_codigo(text, text, text, text) from public, anon;
grant execute on function dodois_canjear_codigo(text, text, text, text) to authenticated;

-- Revisión: debe salir "llave guardada: sí" (no muestra la llave).
select case when exists (select 1 from vault.decrypted_secrets where name = 'dodois_client_secret' and decrypted_secret <> 'PEGA_AQUI_EL_CLIENT_SECRET')
            then 'llave guardada: sí' else 'llave guardada: NO (reemplaza PEGA_AQUI_EL_CLIENT_SECRET)' end as revision;
