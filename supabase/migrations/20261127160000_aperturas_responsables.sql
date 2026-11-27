-- Aperturas: responsables únicos, acceso por responsable, bitácora y división (HD-17, HD-27, HD-18).
-- Spec 2026-11-27-aperturas-responsables. Requiere 20261127155000_rol_aperturas.sql ya ejecutada.
begin;
set local lock_timeout = '5s';

-- <catalogo>
-- Catálogo de responsables: una fila por persona. perfil_id si es usuario de Dodo MX; externo=true si no tiene usuario.
create table public.apertura_responsables (
 id uuid primary key default gen_random_uuid(),
 nombre text not null check(length(nombre) between 1 and 80),
 perfil_id uuid unique references public.perfiles(id),
 externo boolean not null default false,
 activo boolean not null default true,
 check(externo = (perfil_id is null))
);
create unique index apertura_responsables_nombre_uq on public.apertura_responsables(lower(btrim(nombre)));
alter table public.apertura_responsables enable row level security;
-- El catálogo es solo nombres: lo lee cualquier usuario autenticado. Escriben únicamente las funciones de administración.
create policy ver_apertura_responsables on public.apertura_responsables for select to authenticated using(true);
revoke all on public.apertura_responsables from public,anon,authenticated;
grant select on public.apertura_responsables to authenticated;
-- </catalogo>

-- <columnas>
alter table public.apertura_items
 add column responsable_id uuid references public.apertura_responsables(id),
 add column descripcion text check(length(descripcion)<=4000),
 add column origen_id uuid references public.apertura_items(id);
create index apertura_items_responsable_idx on public.apertura_items(responsable_id) where responsable_id is not null;
create index apertura_items_origen_idx on public.apertura_items(origen_id) where origen_id is not null;
-- </columnas>

-- <bitacora>
-- Entradas por registro: avance opcional, estatus corto y comentario. Las políticas y el alta van en la sección de acceso.
create table public.apertura_bitacora (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.apertura_items(id) on delete cascade,
 fecha date not null default (now() at time zone 'America/Mexico_City')::date,
 avance integer check(avance between 0 and 100),
 estatus text check(length(estatus)<=80),
 comentario text not null check(length(comentario) between 1 and 2000),
 usuario_id uuid not null references public.perfiles(id),
 creado_en timestamptz not null default now()
);
create index apertura_bitacora_item_idx on public.apertura_bitacora(item_id,fecha desc,creado_en desc);
alter table public.apertura_bitacora enable row level security;
revoke all on public.apertura_bitacora from public,anon,authenticated;
-- </bitacora>

-- <sincronizacion>
-- apertura_items.responsable (texto) se conserva igual al nombre del catálogo para no romper las pantallas que lo leen.
create function public.sincronizar_responsable_item() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.responsable_id is not null then
  select nombre into new.responsable from public.apertura_responsables where id=new.responsable_id;
 elsif tg_op='UPDATE' and old.responsable_id is not null then
  new.responsable:=null;
 end if;
 return new;
end $$;
create trigger apertura_items_sincroniza_responsable before insert or update of responsable_id on public.apertura_items
 for each row execute function public.sincronizar_responsable_item();

create function public.sincronizar_nombre_responsable() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.apertura_items set responsable=new.nombre where responsable_id=new.id;
 return null;
end $$;
create trigger apertura_responsables_renombra after update of nombre on public.apertura_responsables
 for each row when (old.nombre is distinct from new.nombre) execute function public.sincronizar_nombre_responsable();
revoke all on function public.sincronizar_responsable_item(),public.sincronizar_nombre_responsable() from public,anon,authenticated;
-- </sincronizacion>

-- <funciones-catalogo>
-- El responsable del usuario en sesión: solo si el usuario está activo (igual que mi_rol: sin cambio de contraseña pendiente) y la fila del catálogo está activa.
create function public.mi_responsable_id() returns uuid language sql stable security definer set search_path='' as $$
 select r.id from public.apertura_responsables r join public.perfiles p on p.id=r.perfil_id
 where r.perfil_id=auth.uid() and r.activo and p.activo and not p.debe_cambiar_contrasena
$$;
revoke all on function public.mi_responsable_id() from public,anon;
grant execute on function public.mi_responsable_id() to authenticated;

-- Alta (p_id null) o edición del catálogo. Solo administración.
create function public.guardar_responsable_apertura(p_id uuid,p_nombre text,p_perfil uuid,p_externo boolean,p_activo boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_nombre text:=btrim(coalesce(p_nombre,''));
begin
 if not public.edita_compras() then raise exception 'Solo administración gestiona responsables.';end if;
 if length(v_nombre) not between 1 and 80 then raise exception 'Escribe un nombre de 1 a 80 caracteres.';end if;
 if p_externo is distinct from (p_perfil is null) then raise exception 'Un responsable es externo si no tiene usuario, o tiene usuario si no es externo.';end if;
 if p_perfil is not null and not exists(select 1 from public.perfiles where id=p_perfil) then raise exception 'El usuario elegido no existe.';end if;
 if p_activo is null then raise exception 'Indica si el responsable está activo.';end if;
 if exists(select 1 from public.apertura_responsables where lower(btrim(nombre))=lower(v_nombre) and id is distinct from p_id) then raise exception 'Ya existe un responsable con ese nombre.';end if;
 if p_perfil is not null and exists(select 1 from public.apertura_responsables where perfil_id=p_perfil and id is distinct from p_id) then raise exception 'Ese usuario ya está ligado a otro responsable.';end if;
 if p_id is null then
  insert into public.apertura_responsables(nombre,perfil_id,externo,activo) values(v_nombre,p_perfil,p_externo,p_activo) returning id into v_id;
 else
  update public.apertura_responsables set nombre=v_nombre,perfil_id=p_perfil,externo=p_externo,activo=p_activo where id=p_id returning id into v_id;
  if v_id is null then raise exception 'El responsable no existe.';end if;
 end if;
 return v_id;
end $$;
revoke all on function public.guardar_responsable_apertura(uuid,text,uuid,boolean,boolean) from public,anon;
grant execute on function public.guardar_responsable_apertura(uuid,text,uuid,boolean,boolean) to authenticated;
-- </funciones-catalogo>

-- <acceso>
-- Ver un registro: acceso completo (admin y corporativo) o ser su responsable. Ver una apertura: acceso completo o tener algún registro en ella.
create function public.ve_item_apertura(p_item uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.ve_compras(),false)
  or exists(select 1 from public.apertura_items i where i.id=p_item and i.responsable_id=public.mi_responsable_id())
$$;
create function public.ve_proyecto_apertura(p_proyecto uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.ve_compras(),false)
  or exists(select 1 from public.apertura_items i where i.proyecto_id=p_proyecto and i.responsable_id=public.mi_responsable_id())
$$;
-- Storage: solo la parte del responsable (admin y corporativo ya leen con planos_leer y fotos_leer). Compara como texto para no
-- fallar con nombres que no son uuid. Planos: los de sus aperturas. Fotos: solo las ligadas a sus registros (apertura_item_dodo).
create function public.ve_carpeta_apertura_responsable(p_carpeta text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.apertura_items i where i.proyecto_id::text=p_carpeta and i.responsable_id=public.mi_responsable_id())
$$;
create function public.ve_foto_apertura_responsable(p_nombre text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.apertura_item_dodo d join public.apertura_items i on i.id=d.item_id
  where p_nombre in (d.foto_proyecto,d.foto_real) and i.responsable_id=public.mi_responsable_id())
$$;
revoke all on function public.ve_item_apertura(uuid),public.ve_proyecto_apertura(uuid),public.ve_carpeta_apertura_responsable(text),public.ve_foto_apertura_responsable(text) from public,anon;
grant execute on function public.ve_item_apertura(uuid),public.ve_proyecto_apertura(uuid),public.ve_carpeta_apertura_responsable(text),public.ve_foto_apertura_responsable(text) to authenticated;

-- Lectura: lo mismo que antes para admin y corporativo (ve_compras), más lo propio del responsable.
-- apertura_items usa la forma en línea de ve_item_apertura(id) (mismo resultado) para evaluar ve_compras y mi_responsable_id una sola vez.
drop policy ver_apertura_items on public.apertura_items;
create policy ver_apertura_items on public.apertura_items for select
 using((select coalesce(public.ve_compras(),false)) or responsable_id=(select public.mi_responsable_id()));
drop policy ver_aperturas on public.apertura_proyectos;
create policy ver_aperturas on public.apertura_proyectos for select using(public.ve_proyecto_apertura(id));
drop policy ver_apertura_historial on public.apertura_historial;
create policy ver_apertura_historial on public.apertura_historial for select using(public.ve_item_apertura(item_id));
drop policy ver_apertura_plano_marcas on public.apertura_plano_marcas;
create policy ver_apertura_plano_marcas on public.apertura_plano_marcas for select using(public.ve_item_apertura(item_id));
drop policy ver_apertura_planos on public.apertura_planos;
create policy ver_apertura_planos on public.apertura_planos for select using(public.ve_proyecto_apertura(proyecto_id));
drop policy ver_apertura_item_dodo on public.apertura_item_dodo;
create policy ver_apertura_item_dodo on public.apertura_item_dodo for select using(public.ve_item_apertura(item_id));
create policy ver_apertura_bitacora on public.apertura_bitacora for select using(public.ve_item_apertura(item_id));
grant select on public.apertura_bitacora to authenticated;
-- apertura_proyecto_historial (presupuesto y fechas del proyecto) sigue solo con ve_compras. Los colores del calendario no son
-- sensibles: también los lee quien está en el catálogo.
drop policy ver_apertura_colores on public.apertura_colores;
create policy ver_apertura_colores on public.apertura_colores for select using(public.ve_compras() or public.mi_responsable_id() is not null);

create policy planos_leer_responsable on storage.objects for select to authenticated
 using(bucket_id='aperturas-planos' and public.ve_carpeta_apertura_responsable((storage.foldername(name))[1]));
create policy fotos_leer_responsable on storage.objects for select to authenticated
 using(bucket_id='aperturas-fotos' and public.ve_foto_apertura_responsable(name));
-- </acceso>

-- <edicion>
-- Reemplaza 20261125120000_aperturas_por_cerrar.sql. Cambios:
--  * Una clave ausente conserva el valor actual (antes quedaba vacía, salvo categoría). Las pantallas actuales mandan todas.
--  * Admin: además nombre (1–300), descripción (hasta 4000) y responsable_id (fila activa del catálogo; vacío lo quita).
--  * El texto «responsable» solo se respeta en registros sin responsable_id (legado); con responsable_id lo pone el disparador.
--  * Quien no es admin pero es responsable del registro: solo estado, inicio, fin, notas y evidencia.
-- Se conservan la revisión, las validaciones de estado, evidencia, cantidades, orden y factura, y el historial.
create or replace function public.actualizar_apertura_item(p_item uuid,p_revision integer,p_datos jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare antes public.apertura_items;despues public.apertura_items;s uuid;v_estado text;v_admin boolean:=public.edita_compras();v_mio uuid;
 v_prohibidas text;v_nombre text;v_desc text;v_resp uuid;v_texto text;v_evidencia text;
begin
 if not v_admin then
  v_mio:=public.mi_responsable_id();
  if v_mio is null or not exists(select 1 from public.apertura_items where id=p_item and responsable_id=v_mio) then raise exception 'Solo administración puede editar aperturas.';end if;
 end if;
 select * into antes from public.apertura_items where id=p_item for update;
 if not found then raise exception 'El registro no existe.';end if;
 if not v_admin and antes.responsable_id is distinct from v_mio then raise exception 'Solo administración puede editar aperturas.';end if;
 if antes.revision is distinct from p_revision then raise exception 'El registro cambió. Recarga antes de guardar.';end if;
 if jsonb_typeof(p_datos) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('estado','responsable','responsable_id','nombre','descripcion','inicio','fin','cantidad','recibido','precio','evidencia','notas','orden_id','factura_id','categoria')) then raise exception 'Datos de apertura inválidos.';end if;
 if not v_admin then
  select string_agg(k,', ' order by k) into v_prohibidas from jsonb_object_keys(p_datos) k where k not in ('estado','inicio','fin','notas','evidencia');
  if v_prohibidas is not null then raise exception 'Solo administración puede cambiar %.',v_prohibidas;end if;
 end if;
 v_estado:=case when p_datos?'estado' then p_datos->>'estado' else antes.estado end;
 if v_estado is null or (antes.tipo in ('actividad','tecnico') and v_estado not in ('pendiente','por_validar','en_curso','por_cerrar','bloqueado','completado','no_aplica'))
 or (antes.tipo in ('equipo','referencia') and v_estado not in ('por_validar','por_cotizar','cotizado','aprobado','pedido','recibido_parcial','recibido','instalado','verificado','bloqueado','no_aplica')) then raise exception 'Estado inválido para este registro.';end if;
 if length(coalesce(p_datos->>'responsable',''))>200 or length(coalesce(p_datos->>'evidencia',''))>4000 or length(coalesce(p_datos->>'notas',''))>4000 or length(coalesce(p_datos->>'descripcion',''))>4000 then raise exception 'Texto demasiado largo.';end if;
 v_evidencia:=case when p_datos?'evidencia' then nullif(trim(p_datos->>'evidencia'),'') else antes.evidencia end;
 if v_estado in ('completado','verificado','no_aplica') and length(coalesce(v_evidencia,''))<5 then raise exception 'Registra evidencia o el motivo de no aplicar.';end if;
 v_nombre:=antes.nombre;
 if p_datos?'nombre' then
  v_nombre:=trim(p_datos->>'nombre');
  if v_nombre is distinct from antes.nombre and (v_nombre is null or length(v_nombre) not between 1 and 300) then raise exception 'Escribe un nombre de 1 a 300 caracteres.';end if;
 end if;
 v_desc:=case when p_datos?'descripcion' then nullif(trim(p_datos->>'descripcion'),'') else antes.descripcion end;
 v_resp:=antes.responsable_id;
 if p_datos?'responsable_id' then
  v_resp:=nullif(p_datos->>'responsable_id','')::uuid;
  if v_resp is distinct from antes.responsable_id and v_resp is not null and not exists(select 1 from public.apertura_responsables where id=v_resp and activo) then raise exception 'El responsable no existe o está inactivo.';end if;
 end if;
 v_texto:=antes.responsable;
 if p_datos?'responsable' and antes.responsable_id is null and v_resp is null then v_texto:=nullif(trim(p_datos->>'responsable'),'');end if;
 select sucursal_id into s from public.apertura_proyectos where id=antes.proyecto_id;
 if nullif(p_datos->>'orden_id','') is not null and not exists(select 1 from public.ordenes_compra where id=(p_datos->>'orden_id')::uuid and sucursal_id=s) then raise exception 'La orden debe pertenecer a la sucursal del proyecto.';end if;
 if nullif(p_datos->>'factura_id','') is not null and not exists(select 1 from public.facturas where id=(p_datos->>'factura_id')::uuid and sucursal_id=s) then raise exception 'La factura debe pertenecer a la sucursal del proyecto.';end if;
 -- responsable_id siempre va en el set: el disparador sincroniza el texto con el catálogo cuando hay responsable_id.
 update public.apertura_items set estado=v_estado,nombre=v_nombre,descripcion=v_desc,responsable_id=v_resp,responsable=v_texto,
 inicio=case when p_datos?'inicio' then nullif(p_datos->>'inicio','')::date else inicio end,
 fin=case when p_datos?'fin' then nullif(p_datos->>'fin','')::date else fin end,
 cantidad=case when p_datos?'cantidad' then nullif(p_datos->>'cantidad','')::numeric else cantidad end,
 recibido=case when p_datos?'recibido' then coalesce(nullif(p_datos->>'recibido','')::numeric,0) else recibido end,
 precio=case when p_datos?'precio' then nullif(p_datos->>'precio','')::numeric else precio end,
 evidencia=v_evidencia,
 notas=case when p_datos?'notas' then nullif(trim(p_datos->>'notas'),'') else notas end,
 orden_id=case when p_datos?'orden_id' then nullif(p_datos->>'orden_id','')::uuid else orden_id end,
 factura_id=case when p_datos?'factura_id' then nullif(p_datos->>'factura_id','')::uuid else factura_id end,
 categoria=case when p_datos?'categoria' then nullif(p_datos->>'categoria','') else categoria end,
 revision=revision+1,actualizado_en=now() where id=p_item returning * into despues;
 if v_estado in ('recibido','instalado','verificado') and (despues.cantidad is null or despues.recibido<despues.cantidad) then raise exception 'Confirma la cantidad necesaria y la recepción completa.';end if;
 if v_estado='recibido_parcial' and (despues.cantidad is null or despues.recibido<=0 or despues.recibido>=despues.cantidad) then raise exception 'La recepción parcial debe ser mayor que cero y menor a la cantidad necesaria.';end if;
 insert into public.apertura_historial(item_id,anterior,nuevo,usuario_id) values(p_item,to_jsonb(antes),to_jsonb(despues),auth.uid());
end $$;
-- </edicion>

-- <alta-completa>
-- Alta en un paso. Misma clave (MAN-uuid), fuente y estado inicial que agregar_apertura_item. Solo administración.
create function public.crear_apertura_item_completo(p_proyecto uuid,p_tipo text,p_etapa text,p_categoria text,p_nombre text,p_descripcion text,p_responsable uuid,p_inicio date,p_fin date) returns uuid
language plpgsql security definer set search_path='' as $$
declare resultado uuid;v_nombre text:=trim(p_nombre);
begin
 if not public.edita_compras() then raise exception 'Solo administración puede editar aperturas.';end if;
 if not exists(select 1 from public.apertura_proyectos where id=p_proyecto) then raise exception 'La apertura no existe.';end if;
 if p_tipo is null or p_tipo not in ('actividad','equipo','tecnico') or p_etapa is null or p_etapa not in ('P1','P2','P3','P4','P5','P6','P7') then raise exception 'Datos del nuevo registro inválidos.';end if;
 if v_nombre is null or length(v_nombre) not between 1 and 300 then raise exception 'Escribe un nombre de 1 a 300 caracteres.';end if;
 if length(coalesce(p_descripcion,''))>4000 then raise exception 'Texto demasiado largo.';end if;
 if p_responsable is not null and not exists(select 1 from public.apertura_responsables where id=p_responsable and activo) then raise exception 'El responsable no existe o está inactivo.';end if;
 if p_fin<p_inicio then raise exception 'La fecha de fin no puede ser anterior al inicio.';end if;
 insert into public.apertura_items(proyecto_id,clave,tipo,etapa,categoria,nombre,descripcion,responsable_id,inicio,fin,fuente,original,estado)
 values(p_proyecto,'MAN-'||gen_random_uuid()::text,p_tipo,p_etapa,nullif(p_categoria,''),v_nombre,nullif(trim(p_descripcion),''),p_responsable,p_inicio,p_fin,
  'Alta manual','{}'::jsonb,case when p_tipo='equipo' then 'por_cotizar' else 'pendiente' end) returning id into resultado;
 insert into public.apertura_historial(item_id,anterior,nuevo,usuario_id) select resultado,'{}'::jsonb,to_jsonb(i),auth.uid() from public.apertura_items i where id=resultado;
 return resultado;
end $$;
revoke all on function public.crear_apertura_item_completo(uuid,text,text,text,text,text,uuid,date,date) from public,anon;
grant execute on function public.crear_apertura_item_completo(uuid,text,text,text,text,text,uuid,date,date) to authenticated;
-- </alta-completa>

-- <bitacora-alta>
-- Una entrada de bitácora: admin o el responsable del registro. Sin fecha, hoy (hora de México); no se aceptan fechas futuras.
create function public.agregar_bitacora_apertura(p_item uuid,p_fecha date,p_avance integer,p_estatus text,p_comentario text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_mio uuid;v_hoy date:=(now() at time zone 'America/Mexico_City')::date;v_estatus text:=nullif(trim(p_estatus),'');v_comentario text:=trim(p_comentario);
begin
 if not public.edita_compras() then
  v_mio:=public.mi_responsable_id();
  if v_mio is null or not exists(select 1 from public.apertura_items where id=p_item and responsable_id=v_mio) then raise exception 'Solo administración o el responsable del registro pueden escribir en la bitácora.';end if;
 elsif not exists(select 1 from public.apertura_items where id=p_item) then raise exception 'El registro no existe.';
 end if;
 if p_avance is not null and p_avance not between 0 and 100 then raise exception 'El avance debe ser de 0 a 100.';end if;
 if length(coalesce(v_estatus,''))>80 then raise exception 'El estatus debe tener hasta 80 caracteres.';end if;
 if v_comentario is null or length(v_comentario) not between 1 and 2000 then raise exception 'Escribe un comentario de 1 a 2000 caracteres.';end if;
 if p_fecha>v_hoy then raise exception 'La fecha no puede ser futura.';end if;
 insert into public.apertura_bitacora(item_id,fecha,avance,estatus,comentario,usuario_id)
  values(p_item,coalesce(p_fecha,v_hoy),p_avance,v_estatus,v_comentario,auth.uid()) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.agregar_bitacora_apertura(uuid,date,integer,text,text) from public,anon;
grant execute on function public.agregar_bitacora_apertura(uuid,date,integer,text,text) to authenticated;
-- </bitacora-alta>

-- <division>
-- Divide un registro en 2 a 10 nuevos ({nombre, descripcion, responsable_id, inicio, fin}) con el mismo proyecto, tipo, etapa y
-- categoría, clave legible <clave original>-<n> (n = 1, 2, …, saltando las que ya existan en la apertura) y origen_id. La original queda no_aplica con «Dividida en …». Todo o nada. Solo administración.
create function public.dividir_apertura_item(p_item uuid,p_partes jsonb) returns text[]
language plpgsql security definer set search_path='' as $$
declare antes public.apertura_items;despues public.apertura_items;p jsonb;v_claves text[]:=array[]::text[];v_id uuid;v_clave text;
 v_n integer:=0;v_nombre text;v_desc text;v_resp uuid;v_ini date;v_fin date;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede dividir registros.';end if;
 select * into antes from public.apertura_items where id=p_item for update;
 if not found then raise exception 'El registro no existe.';end if;
 if antes.estado='no_aplica' then raise exception 'Este registro ya no aplica; no se puede dividir.';end if;
 if jsonb_typeof(p_partes) is distinct from 'array' or jsonb_array_length(p_partes) not between 2 and 10 then raise exception 'Indica de 2 a 10 partes.';end if;
 for p in select e.value from jsonb_array_elements(p_partes) with ordinality e(value,n) order by e.n loop
  if jsonb_typeof(p)<>'object' or exists(select 1 from jsonb_object_keys(p) k where k not in ('nombre','descripcion','responsable_id','inicio','fin')) then raise exception 'Datos de la parte inválidos.';end if;
  v_nombre:=trim(p->>'nombre');
  if v_nombre is null or length(v_nombre) not between 1 and 300 then raise exception 'Cada parte necesita un nombre de 1 a 300 caracteres.';end if;
  v_desc:=nullif(trim(p->>'descripcion'),'');
  if length(coalesce(v_desc,''))>4000 then raise exception 'Texto demasiado largo.';end if;
  v_resp:=nullif(p->>'responsable_id','')::uuid;
  if v_resp is not null and not exists(select 1 from public.apertura_responsables where id=v_resp and activo) then raise exception 'El responsable no existe o está inactivo.';end if;
  v_ini:=nullif(p->>'inicio','')::date;v_fin:=nullif(p->>'fin','')::date;
  if v_fin<v_ini then raise exception 'La fecha de fin no puede ser anterior al inicio.';end if;
  loop v_n:=v_n+1;v_clave:=antes.clave||'-'||v_n;exit when not exists(select 1 from public.apertura_items where proyecto_id=antes.proyecto_id and clave=v_clave);end loop;
  insert into public.apertura_items(proyecto_id,clave,tipo,etapa,categoria,nombre,descripcion,responsable_id,inicio,fin,fuente,original,estado,origen_id)
  values(antes.proyecto_id,v_clave,antes.tipo,antes.etapa,antes.categoria,v_nombre,v_desc,v_resp,v_ini,v_fin,'División',jsonb_build_object('dividida_de',antes.clave),
   case when antes.tipo in ('equipo','referencia') then 'por_cotizar' else 'pendiente' end,p_item) returning id into v_id;
  insert into public.apertura_historial(item_id,anterior,nuevo,usuario_id) select v_id,'{}'::jsonb,to_jsonb(i),auth.uid() from public.apertura_items i where id=v_id;
  v_claves:=v_claves||v_clave;
 end loop;
 update public.apertura_items set estado='no_aplica',evidencia='Dividida en '||array_to_string(v_claves,', '),revision=revision+1,actualizado_en=now()
  where id=p_item returning * into despues;
 insert into public.apertura_historial(item_id,anterior,nuevo,usuario_id) values(p_item,to_jsonb(antes),to_jsonb(despues),auth.uid());
 return v_claves;
end $$;
revoke all on function public.dividir_apertura_item(uuid,jsonb) from public,anon;
grant execute on function public.dividir_apertura_item(uuid,jsonb) to authenticated;
-- </division>

commit;
