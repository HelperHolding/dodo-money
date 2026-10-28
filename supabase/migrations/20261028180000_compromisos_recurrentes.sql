-- Compromisos recurrentes por sucursal (renta, fumigación, basura, trampas de grasa): previstos en el calendario de
-- pagos, ligados a su factura y con comprobación del servicio. Las fechas futuras se calculan de la regla
-- (fechas_compromiso); solo se guarda una fecha cuando alguien actúa sobre ella.
begin;
create table public.compromisos (
 id uuid primary key default gen_random_uuid(),
 sucursal_id uuid not null references public.sucursales(id),
 concepto text not null check(concepto in ('renta','fumigacion','basura','trampas_grasa','otro')),
 descripcion text check(length(descripcion)<=300),
 proveedor_id uuid not null references public.proveedores(id),
 monto_estimado numeric(16,2) not null check(monto_estimado>0 and monto_estimado<1e12),
 forma_pago public.forma_pago not null,
 unidad text not null check(unidad in ('mes','semana')),
 cada smallint not null check(cada between 1 and 12),
 dia_mes smallint check(dia_mes between 1 and 31),
 inicio date not null, fin date,
 requiere_servicio boolean not null,
 revision integer not null default 1,
 creado_por uuid not null default auth.uid() references public.perfiles(id),
 creado_en timestamptz not null default now(),
 check((unidad='mes')=(dia_mes is not null)),
 check(fin is null or fin>=inicio),
 check(concepto<>'otro' or length(trim(coalesce(descripcion,'')))>=3)
);
create index compromisos_sucursal on public.compromisos(sucursal_id);
create table public.compromiso_fechas (
 id uuid primary key default gen_random_uuid(),
 compromiso_id uuid not null references public.compromisos(id),
 vence date not null,
 factura_id uuid unique references public.facturas(id),
 omitida_motivo text check(omitida_motivo is null or length(trim(omitida_motivo)) between 5 and 1000),
 servicio text not null default 'pendiente' check(servicio in ('pendiente','realizado','no_realizado')),
 servicio_fecha date,
 servicio_nota text check(servicio_nota is null or length(trim(servicio_nota)) between 5 and 2000),
 revision integer not null default 0,
 unique(compromiso_id,vence),
 check(factura_id is null or omitida_motivo is null),
 check(servicio='pendiente' or servicio_nota is not null),
 check(servicio<>'realizado' or servicio_fecha is not null)
);
create table public.compromiso_historial (
 id bigint generated always as identity primary key,
 compromiso_id uuid not null references public.compromisos(id),
 evento text not null, anterior jsonb not null, nuevo jsonb not null,
 usuario_id uuid not null references public.perfiles(id), fecha timestamptz not null default now()
);
create index compromiso_historial_compromiso on public.compromiso_historial(compromiso_id,fecha);
alter table public.compromisos enable row level security;
alter table public.compromiso_fechas enable row level security;
alter table public.compromiso_historial enable row level security;
create policy ver_compromisos on public.compromisos for select using(public.ve_compras());
create policy ver_compromiso_fechas on public.compromiso_fechas for select using(public.ve_compras());
create policy ver_compromiso_historial on public.compromiso_historial for select using(public.ve_compras());
revoke all on public.compromisos,public.compromiso_fechas,public.compromiso_historial from public,anon,authenticated;
grant select on public.compromisos,public.compromiso_fechas,public.compromiso_historial to authenticated;

-- Única fuente de la regla. Mensual: el día dia_mes de cada `cada` meses desde el mes de inicio (si el mes es más
-- corto, su último día); se omiten las fechas antes del inicio. Semanal: cada `cada` semanas desde el inicio.
create function public.fechas_compromiso(p_compromiso uuid,p_desde date,p_hasta date) returns setof date
language sql stable set search_path='' as $$
 select v.vence from public.compromisos c
 cross join lateral generate_series(0,greatest(0,case when c.unidad='mes'
   then ((extract(year from p_hasta)-extract(year from c.inicio))*12+extract(month from p_hasta)-extract(month from c.inicio))::int/c.cada
   else (p_hasta-c.inicio)/(7*c.cada) end)) k
 cross join lateral (select case when c.unidad='mes' then
   (date_trunc('month',c.inicio::timestamp)+make_interval(months=>(k*c.cada)::int))::date
   +(least(c.dia_mes::int,extract(day from date_trunc('month',c.inicio::timestamp)+make_interval(months=>(k*c.cada)::int)+interval '1 month - 1 day')::int)-1)
  else c.inicio+(k*7*c.cada)::int end as vence) v
 where c.id=p_compromiso and v.vence>=c.inicio and (c.fin is null or v.vence<=c.fin) and v.vence between p_desde and p_hasta
 order by v.vence
$$;

-- Lo que leen las pantallas: cada fecha calculada con lo guardado de ella (factura, omisión, servicio).
create function public.compromisos_en_rango(p_desde date,p_hasta date)
returns table(compromiso_id uuid,vence date,fecha_id uuid,factura_id uuid,factura_estado text,factura_saldo numeric,omitida_motivo text,servicio text,servicio_fecha date,servicio_nota text,revision integer)
language plpgsql stable set search_path='' as $$
#variable_conflict use_column
begin
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>800 then raise exception 'Rango de fechas inválido.';end if;
 return query
 select c.id,v.d,f.id,f.factura_id,fs.estado::text,fs.saldo::numeric,f.omitida_motivo,coalesce(f.servicio,'pendiente'),f.servicio_fecha,f.servicio_nota,coalesce(f.revision,0)
 from public.compromisos c
 cross join lateral public.fechas_compromiso(c.id,p_desde,p_hasta) v(d)
 left join public.compromiso_fechas f on f.compromiso_id=c.id and f.vence=v.d
 left join public.facturas_saldo fs on fs.id=f.factura_id
 order by v.d,c.id;
end $$;

create function public.guardar_compromiso(p_id uuid,p_revision integer,p_datos jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.compromisos;n public.compromisos;v_fin date;
begin
 perform public.exigir_admin_compras();
 if jsonb_typeof(p_datos) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('sucursal_id','concepto','descripcion','proveedor_id','monto_estimado','forma_pago','unidad','cada','dia_mes','inicio','fin','requiere_servicio')) then raise exception 'Datos inválidos.';end if;
 if exists(select 1 from jsonb_each_text(p_datos) e where length(e.value)>1000) then raise exception 'Texto demasiado largo.';end if;
 v_fin:=nullif(p_datos->>'fin','')::date;
 if p_id is null then
  insert into public.compromisos(sucursal_id,concepto,descripcion,proveedor_id,monto_estimado,forma_pago,unidad,cada,dia_mes,inicio,fin,requiere_servicio)
  values((p_datos->>'sucursal_id')::uuid,p_datos->>'concepto',nullif(trim(p_datos->>'descripcion'),''),(p_datos->>'proveedor_id')::uuid,(p_datos->>'monto_estimado')::numeric,
   (p_datos->>'forma_pago')::public.forma_pago,p_datos->>'unidad',(p_datos->>'cada')::smallint,nullif(p_datos->>'dia_mes','')::smallint,(p_datos->>'inicio')::date,v_fin,
   coalesce((p_datos->>'requiere_servicio')::boolean,false)) returning * into n;
 else
  select * into a from public.compromisos where id=p_id for update;
  if not found then raise exception 'Compromiso inexistente.';end if;
  if a.revision is distinct from p_revision then raise exception 'El compromiso cambió. Recarga antes de guardar.';end if;
  if (p_datos->>'sucursal_id')::uuid is distinct from a.sucursal_id or p_datos->>'concepto' is distinct from a.concepto or p_datos->>'unidad' is distinct from a.unidad
   or (p_datos->>'cada')::smallint is distinct from a.cada or nullif(p_datos->>'dia_mes','')::smallint is distinct from a.dia_mes or (p_datos->>'inicio')::date is distinct from a.inicio then
   raise exception 'Sucursal, concepto, frecuencia, día e inicio no cambian. Ponle fin a este compromiso y crea otro.';
  end if;
  if v_fin is not null and exists(select 1 from public.compromiso_fechas where compromiso_id=p_id and vence>v_fin) then raise exception 'Hay fechas con factura, servicio u omisión después del fin.';end if;
  update public.compromisos set descripcion=nullif(trim(p_datos->>'descripcion'),''),proveedor_id=(p_datos->>'proveedor_id')::uuid,monto_estimado=(p_datos->>'monto_estimado')::numeric,
   forma_pago=(p_datos->>'forma_pago')::public.forma_pago,fin=v_fin,requiere_servicio=coalesce((p_datos->>'requiere_servicio')::boolean,false),revision=revision+1
   where id=p_id returning * into n;
 end if;
 insert into public.compromiso_historial(compromiso_id,evento,anterior,nuevo,usuario_id) values(n.id,case when p_id is null then 'Alta' else 'Actualización' end,case when p_id is null then '{}'::jsonb else to_jsonb(a) end,to_jsonb(n),auth.uid());
 return n.id;
end $$;

revoke all on function public.fechas_compromiso(uuid,date,date),public.compromisos_en_rango(date,date),public.guardar_compromiso(uuid,integer,jsonb) from public,anon;
grant execute on function public.fechas_compromiso(uuid,date,date),public.compromisos_en_rango(date,date),public.guardar_compromiso(uuid,integer,jsonb) to authenticated;

-- Fila de una fecha (la crea si aún no existe), bloqueada. Rechaza fechas que no salen de la regla.
create function public.fila_fecha_compromiso(p_compromiso uuid,p_vence date) returns public.compromiso_fechas
language plpgsql security definer set search_path='' as $$
declare r public.compromiso_fechas;
begin
 if not exists(select 1 from public.fechas_compromiso(p_compromiso,p_vence,p_vence)) then raise exception 'Esa fecha no corresponde al compromiso.';end if;
 insert into public.compromiso_fechas(compromiso_id,vence) values(p_compromiso,p_vence) on conflict(compromiso_id,vence) do nothing;
 select * into r from public.compromiso_fechas where compromiso_id=p_compromiso and vence=p_vence for update;
 return r;
end $$;

create function public.ligar_factura_compromiso(p_compromiso uuid,p_vence date,p_revision integer,p_factura uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.compromisos;r public.compromiso_fechas;n public.compromiso_fechas;f public.facturas;
begin
 perform public.exigir_admin_compras();
 select * into c from public.compromisos where id=p_compromiso for update;
 if not found then raise exception 'Compromiso inexistente.';end if;
 r:=public.fila_fecha_compromiso(p_compromiso,p_vence);
 if r.revision is distinct from p_revision then raise exception 'La fecha cambió. Recarga antes de guardar.';end if;
 if p_factura is not null then
  if r.omitida_motivo is not null then raise exception 'La fecha está omitida. Quita la omisión antes de ligar la factura.';end if;
  select * into f from public.facturas where id=p_factura for update;
  if not found or f.tipo<>'ingreso' or f.estado='cancelada' then raise exception 'Elige una factura vigente.';end if;
  if f.proveedor_id<>c.proveedor_id or f.sucursal_id is distinct from c.sucursal_id then raise exception 'La factura debe ser del mismo proveedor y sucursal del compromiso.';end if;
  if exists(select 1 from public.compromiso_fechas where factura_id=p_factura and id<>r.id) then raise exception 'Esa factura ya está ligada a otra fecha.';end if;
 end if;
 update public.compromiso_fechas set factura_id=p_factura,revision=revision+1 where id=r.id returning * into n;
 insert into public.compromiso_historial(compromiso_id,evento,anterior,nuevo,usuario_id) values(p_compromiso,case when p_factura is null then 'Factura quitada' else 'Factura ligada' end,to_jsonb(r),to_jsonb(n),auth.uid());
end $$;

create function public.comprobar_servicio_compromiso(p_compromiso uuid,p_vence date,p_revision integer,p_estado text,p_fecha date,p_nota text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.compromisos;r public.compromiso_fechas;n public.compromiso_fechas;
begin
 perform public.exigir_admin_compras();
 select * into c from public.compromisos where id=p_compromiso for update;
 if not found then raise exception 'Compromiso inexistente.';end if;
 if not c.requiere_servicio then raise exception 'Este compromiso no lleva comprobación de servicio.';end if;
 if p_estado is null or p_estado not in ('pendiente','realizado','no_realizado') then raise exception 'Estado de servicio inválido.';end if;
 if p_estado='realizado' and (p_fecha is null or p_fecha>public.hoy_mx()) then raise exception 'Indica cuándo se hizo el servicio; no puede ser una fecha futura.';end if;
 if p_estado<>'pendiente' and length(trim(coalesce(p_nota,'')))<5 then raise exception 'Escribe qué se hizo o por qué no se hizo (al menos 5 letras).';end if;
 r:=public.fila_fecha_compromiso(p_compromiso,p_vence);
 if r.revision is distinct from p_revision then raise exception 'La fecha cambió. Recarga antes de guardar.';end if;
 if r.omitida_motivo is not null then raise exception 'La fecha está omitida.';end if;
 update public.compromiso_fechas set servicio=p_estado,servicio_fecha=case when p_estado='realizado' then p_fecha end,
  servicio_nota=case when p_estado='pendiente' then null else trim(p_nota) end,revision=revision+1 where id=r.id returning * into n;
 insert into public.compromiso_historial(compromiso_id,evento,anterior,nuevo,usuario_id) values(p_compromiso,'Servicio',to_jsonb(r),to_jsonb(n),auth.uid());
end $$;

create function public.omitir_fecha_compromiso(p_compromiso uuid,p_vence date,p_revision integer,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.compromiso_fechas;n public.compromiso_fechas;
begin
 perform public.exigir_admin_compras();
 if not exists(select 1 from public.compromisos where id=p_compromiso) then raise exception 'Compromiso inexistente.';end if;
 if nullif(trim(coalesce(p_motivo,'')),'') is not null and length(trim(p_motivo))<5 then raise exception 'Escribe el motivo (al menos 5 letras).';end if;
 r:=public.fila_fecha_compromiso(p_compromiso,p_vence);
 if r.revision is distinct from p_revision then raise exception 'La fecha cambió. Recarga antes de guardar.';end if;
 if r.factura_id is not null then raise exception 'La fecha ya tiene factura. Quítala antes de omitirla.';end if;
 update public.compromiso_fechas set omitida_motivo=nullif(trim(coalesce(p_motivo,'')),''),revision=revision+1 where id=r.id returning * into n;
 insert into public.compromiso_historial(compromiso_id,evento,anterior,nuevo,usuario_id) values(p_compromiso,case when n.omitida_motivo is null then 'Omisión quitada' else 'Fecha omitida' end,to_jsonb(r),to_jsonb(n),auth.uid());
end $$;

-- Cuando un gasto sin CFDI ligado se sustituye por su CFDI, la liga pasa al CFDI (si el CFDI no está ligado ya).
create function public.compromiso_sigue_sustitucion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.compromiso_fechas set factura_id=new.sustituido_por,revision=revision+1
  where factura_id=new.id and not exists(select 1 from public.compromiso_fechas x where x.factura_id=new.sustituido_por);
 return new;
end $$;
create trigger compromiso_sustitucion after update of sustituido_por on public.facturas
 for each row when (new.sustituido_por is not null and old.sustituido_por is distinct from new.sustituido_por)
 execute function public.compromiso_sigue_sustitucion();

revoke all on function public.fila_fecha_compromiso(uuid,date),public.compromiso_sigue_sustitucion() from public,anon,authenticated;
revoke all on function public.ligar_factura_compromiso(uuid,date,integer,uuid),public.comprobar_servicio_compromiso(uuid,date,integer,text,date,text),public.omitir_fecha_compromiso(uuid,date,integer,text) from public,anon;
grant execute on function public.ligar_factura_compromiso(uuid,date,integer,uuid),public.comprobar_servicio_compromiso(uuid,date,integer,text,date,text),public.omitir_fecha_compromiso(uuid,date,integer,text) to authenticated;
commit;
