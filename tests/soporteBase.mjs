// Lo mínimo de Supabase para la migración de soporte. rol_usuario copia el enum real (0001 + 20261109120000 marketing);
// prioridad_tarea copia 20261102120000_tareas. storage imita buckets/objects/foldername de Supabase.
export const BASE=`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 grant usage on schema storage to authenticated;
 create table auth.users(id uuid primary key,email text);
 create table storage.buckets(id text primary key,name text not null,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
 create type rol_usuario as enum('operacion','encargado','gerente','admin','corporativo','marketing');
 create type prioridad_tarea as enum('alta','media','baja');
 create table sucursales(id uuid primary key,nombre text not null);
 insert into sucursales values('00000000-0000-0000-0000-0000000000e1','Zapopan-1'),('00000000-0000-0000-0000-0000000000e2','Tlaquepaque');
 create table perfiles(id uuid primary key,nombre text not null,rol rol_usuario not null,sucursal_id uuid references sucursales(id),activo boolean not null default true,debe_cambiar_contrasena boolean not null default false);
 insert into perfiles values
  ('00000000-0000-0000-0000-0000000000a1','Julio','admin',null,true,false),
  ('00000000-0000-0000-0000-0000000000a2','Sebastián','admin',null,true,false),
  ('00000000-0000-0000-0000-0000000000c1','Halim','corporativo',null,true,false),
  ('00000000-0000-0000-0000-0000000000d0','Gerente Z','gerente','00000000-0000-0000-0000-0000000000e1',true,false),
  ('00000000-0000-0000-0000-0000000000f1','Ana (op Z)','operacion','00000000-0000-0000-0000-0000000000e1',true,false),
  ('00000000-0000-0000-0000-0000000000f2','Luis (op T)','operacion','00000000-0000-0000-0000-0000000000e2',true,false),
  ('00000000-0000-0000-0000-0000000000f3','Baja (op Z)','operacion','00000000-0000-0000-0000-0000000000e1',false,false),
  ('00000000-0000-0000-0000-0000000000b1','Mara (mkt)','marketing',null,true,false);
 insert into auth.users values('00000000-0000-0000-0000-0000000000a1','julio@dodopizza.mx'),('00000000-0000-0000-0000-0000000000a2','SCervera@dodopizza.mx');
 create function mi_rol() returns rol_usuario language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 create function mi_sucursal() returns uuid language sql stable security definer set search_path='' as $$select sucursal_id from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 grant execute on function mi_rol(),mi_sucursal() to authenticated;`;

export const U={julio:'00000000-0000-0000-0000-0000000000a1',seba:'00000000-0000-0000-0000-0000000000a2',corp:'00000000-0000-0000-0000-0000000000c1',
 gerente:'00000000-0000-0000-0000-0000000000d0',ana:'00000000-0000-0000-0000-0000000000f1',luis:'00000000-0000-0000-0000-0000000000f2',
 baja:'00000000-0000-0000-0000-0000000000f3',mkt:'00000000-0000-0000-0000-0000000000b1'};
export const S={z:'00000000-0000-0000-0000-0000000000e1',t:'00000000-0000-0000-0000-0000000000e2'};
export const como=(db,id)=>db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:id,role:'authenticated'})]);
