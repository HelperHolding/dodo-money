begin;
create table public.activos (
 id uuid primary key default gen_random_uuid(), codigo bigint generated always as identity unique,
 sucursal_id uuid not null references public.sucursales(id), nombre text not null check(length(trim(nombre)) between 1 and 300),
 categoria text not null check(categoria in ('cocina','refrigeracion','mobiliario','tecnologia','instalaciones','otros')),
 estado text not null check(estado in ('recibido','instalado','en_uso','en_mantenimiento','fuera_servicio','baja')),
 ubicacion text, responsable text, marca text, modelo text, serie text, condicion text, evidencia text,
 adquirido date, costo numeric(16,2) check(costo>=0 and costo<1e12), garantia_hasta date,
 proveedor_id uuid references public.proveedores(id), factura_id uuid references public.facturas(id), apertura_item_id uuid references public.apertura_items(id),
 revision integer not null default 1, creado_en timestamptz not null default now()
);
create index activos_sucursal on public.activos(sucursal_id);
create index activos_apertura on public.activos(apertura_item_id);
create table public.activo_valuaciones (
 orden bigint generated always as identity unique,
 id uuid primary key default gen_random_uuid(),activo_id uuid not null references public.activos(id),
 fecha date not null,valor numeric(16,2) not null check(valor>=0 and valor<1e12),
 criterio text not null check(length(trim(criterio)) between 5 and 2000), evidencia text,
 usuario_id uuid not null references public.perfiles(id),creado_en timestamptz not null default now()
);
create table public.activo_mantenimientos (
 id uuid primary key default gen_random_uuid(),activo_id uuid not null references public.activos(id),
 tipo text not null check(tipo in ('preventivo','correctivo')),tarea text not null check(length(trim(tarea)) between 5 and 1000),
 programado date not null,estado text not null default 'pendiente' check(estado in ('pendiente','completado','anulado')),
 realizado date,costo numeric(16,2) check(costo>=0 and costo<1e12),tecnico text,evidencia text,
 revision integer not null default 1,creado_en timestamptz not null default now(),
 check(estado<>'completado' or (realizado is not null and costo is not null and length(trim(coalesce(evidencia,'')))>=5)),
 check(estado<>'anulado' or length(trim(coalesce(evidencia,'')))>=5)
);
create index activo_mantenimiento_fecha on public.activo_mantenimientos(programado) where estado='pendiente';
create table public.activo_historial (
 id uuid primary key default gen_random_uuid(),activo_id uuid not null references public.activos(id),
 evento text not null,anterior jsonb not null,nuevo jsonb not null,
 usuario_id uuid not null references public.perfiles(id),fecha timestamptz not null default now()
);
alter table public.activos enable row level security;
alter table public.activo_valuaciones enable row level security;
alter table public.activo_mantenimientos enable row level security;
alter table public.activo_historial enable row level security;
create policy ver_activos on public.activos for select using(public.ve_compras());
create policy ver_valuaciones on public.activo_valuaciones for select using(public.ve_compras());
create policy ver_mantenimiento on public.activo_mantenimientos for select using(public.ve_compras());
create policy ver_historial on public.activo_historial for select using(public.ve_compras());
revoke all on public.activos,public.activo_valuaciones,public.activo_mantenimientos,public.activo_historial from public,anon,authenticated;
grant select on public.activos,public.activo_valuaciones,public.activo_mantenimientos,public.activo_historial to authenticated;
revoke all on sequence public.activos_codigo_seq,public.activo_valuaciones_orden_seq from public,anon,authenticated;
create function public.guardar_activo(p_id uuid,p_revision integer,p_datos jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.activos;n public.activos;i public.apertura_items;s uuid;f uuid;origen uuid;r uuid;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede gestionar activos.';end if;
 if jsonb_typeof(p_datos) is distinct from 'object' then raise exception 'Datos inválidos.';end if;
 if exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('sucursal_id','nombre','categoria','estado','ubicacion','responsable','marca','modelo','serie','condicion','evidencia','adquirido','costo','garantia_hasta','proveedor_id','factura_id','apertura_item_id')) then raise exception 'Campos inválidos.';end if;
 if exists(select 1 from jsonb_each_text(p_datos) e where length(e.value)>4000) then raise exception 'Texto demasiado largo.';end if;
 s:=nullif(p_datos->>'sucursal_id','')::uuid;f:=nullif(p_datos->>'factura_id','')::uuid;origen:=nullif(p_datos->>'apertura_item_id','')::uuid;
 if p_id is not null then
 select * into a from public.activos where id=p_id for update;
 if not found then raise exception 'Activo inexistente.';end if;
 if a.revision is distinct from p_revision then raise exception 'El activo cambió. Recarga antes de guardar.';end if;
 if origen is distinct from a.apertura_item_id then raise exception 'El origen del activo se conserva.';end if;
 end if;
 if p_id is null and origen is not null then
 select * into i from public.apertura_items where id=origen for update;
 if not found or i.tipo not in ('equipo','referencia') or i.estado not in ('recibido_parcial','recibido','instalado','verificado') then raise exception 'Primero registra la recepción del equipo en Aperturas.';end if;
 if not exists(select 1 from public.apertura_proyectos where id=i.proyecto_id and sucursal_id=s) then raise exception 'La sucursal debe corresponder a la apertura.';end if;
 if (select count(*) from public.activos where apertura_item_id=origen)>=floor(i.recibido) then raise exception 'Ya se registraron las unidades recibidas de este equipo.';end if;
 end if;
 if f is not null and (p_id is null or f is distinct from a.factura_id) and not exists(select 1 from public.facturas where id=f and sucursal_id=s) then raise exception 'La factura debe corresponder a la sucursal.';end if;
 if p_datos->>'estado'='baja' and length(trim(coalesce(p_datos->>'evidencia','')))<5 then raise exception 'Registra el motivo y evidencia de la baja.';end if;
 if p_id is null then
 insert into public.activos(sucursal_id,nombre,categoria,estado) values(s,trim(p_datos->>'nombre'),p_datos->>'categoria',p_datos->>'estado') returning id into r;
 else r:=p_id;end if;
 update public.activos set sucursal_id=s,nombre=trim(p_datos->>'nombre'),categoria=p_datos->>'categoria',estado=p_datos->>'estado',
 ubicacion=nullif(trim(p_datos->>'ubicacion'),''),responsable=nullif(trim(p_datos->>'responsable'),''),marca=nullif(trim(p_datos->>'marca'),''),modelo=nullif(trim(p_datos->>'modelo'),''),serie=nullif(trim(p_datos->>'serie'),''),condicion=nullif(trim(p_datos->>'condicion'),''),evidencia=nullif(trim(p_datos->>'evidencia'),''),
 adquirido=nullif(p_datos->>'adquirido','')::date,costo=nullif(p_datos->>'costo','')::numeric,garantia_hasta=nullif(p_datos->>'garantia_hasta','')::date,proveedor_id=nullif(p_datos->>'proveedor_id','')::uuid,factura_id=f,apertura_item_id=origen,
 revision=case when p_id is null then 1 else revision+1 end where id=r returning * into n;
 insert into public.activo_historial(activo_id,evento,anterior,nuevo,usuario_id) values(r,case when p_id is null then 'Alta' when a.sucursal_id<>s then 'Traslado' else 'Actualización' end,case when p_id is null then '{}'::jsonb else to_jsonb(a) end,to_jsonb(n),auth.uid());
 return r;
end $$;
create function public.valuar_activo(p_activo uuid,p_fecha date,p_valor numeric,p_criterio text,p_evidencia text) returns void
language plpgsql security definer set search_path='' as $$
declare n public.activo_valuaciones;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede gestionar activos.';end if;
 if p_fecha> (now() at time zone 'America/Mexico_City')::date or length(coalesce(p_evidencia,''))>4000 then raise exception 'Fecha o evidencia inválida.';end if;
 insert into public.activo_valuaciones(activo_id,fecha,valor,criterio,evidencia,usuario_id) values(p_activo,p_fecha,p_valor,trim(p_criterio),nullif(trim(p_evidencia),''),auth.uid()) returning * into n;
 insert into public.activo_historial(activo_id,evento,anterior,nuevo,usuario_id) values(p_activo,'Valuación','{}',to_jsonb(n),auth.uid());
end $$;
create function public.mantener_activo(p_activo uuid,p_id uuid,p_revision integer,p_datos jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare a public.activo_mantenimientos;n public.activo_mantenimientos;r uuid;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede gestionar activos.';end if;
 if jsonb_typeof(p_datos) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('tipo','tarea','programado','estado','realizado','costo','tecnico','evidencia')) then raise exception 'Datos inválidos.';end if;
 if exists(select 1 from jsonb_each_text(p_datos) e where length(e.value)>4000) then raise exception 'Texto demasiado largo.';end if;
 if nullif(p_datos->>'realizado','')::date>(now() at time zone 'America/Mexico_City')::date then raise exception 'El servicio no puede realizarse en el futuro.';end if;
 if p_id is not null then
 select * into a from public.activo_mantenimientos where id=p_id and activo_id=p_activo for update;
 if not found then raise exception 'Mantenimiento inexistente.';end if;
 if a.revision is distinct from p_revision then raise exception 'El mantenimiento cambió. Recarga antes de guardar.';end if;
 if a.estado<>'pendiente' then raise exception 'El servicio ya se cerró. Conserva su historial y registra otro.';end if;
 r:=p_id;
 else
 insert into public.activo_mantenimientos(activo_id,tipo,tarea,programado) values(p_activo,p_datos->>'tipo',trim(p_datos->>'tarea'),(p_datos->>'programado')::date) returning id into r;
 end if;
 update public.activo_mantenimientos set tipo=p_datos->>'tipo',tarea=trim(p_datos->>'tarea'),programado=(p_datos->>'programado')::date,estado=p_datos->>'estado',realizado=nullif(p_datos->>'realizado','')::date,costo=nullif(p_datos->>'costo','')::numeric,tecnico=nullif(trim(p_datos->>'tecnico'),''),evidencia=nullif(trim(p_datos->>'evidencia'),''),revision=case when p_id is null then 1 else revision+1 end where id=r returning * into n;
 insert into public.activo_historial(activo_id,evento,anterior,nuevo,usuario_id) values(p_activo,'Mantenimiento',case when p_id is null then '{}'::jsonb else to_jsonb(a) end,to_jsonb(n),auth.uid());
end $$;
revoke all on function public.guardar_activo(uuid,integer,jsonb),public.valuar_activo(uuid,date,numeric,text,text),public.mantener_activo(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.guardar_activo(uuid,integer,jsonb),public.valuar_activo(uuid,date,numeric,text,text),public.mantener_activo(uuid,uuid,integer,jsonb) to authenticated;
commit;
