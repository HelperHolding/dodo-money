-- Banca: importación documental. No registra pagos, ventas ni movimientos de efectivo.
begin;
set local lock_timeout='5s';
create table public.banca_cuentas (
 id uuid primary key default gen_random_uuid(), banco text not null check(banco='banregio'),
 numero text not null unique check(numero~'^\d{12}$'), clabe text not null unique check(clabe~'^058\d{15}$'),
 rfc text not null references public.razones_sociales(rfc), moneda text not null check(moneda='MXN'),
 titular_fuente text not null, creado_por uuid not null references public.perfiles(id), creado_en timestamptz not null default now()
);
create table public.banca_importaciones (
 id uuid primary key, cuenta_id uuid not null references public.banca_cuentas(id),
 archivo text not null, sha256 text not null check(sha256~'^[a-f0-9]{64}$'), solicitud jsonb not null,
 periodo_desde date not null, periodo_hasta date not null, primera_fecha date not null, ultima_fecha date not null,
 saldo_inicial numeric(16,2) not null, saldo_final numeric(16,2) not null, cargos numeric(16,2) not null, abonos numeric(16,2) not null,
 movimientos integer not null, nuevos integer not null, repetidos integer not null,
 sucursal_id uuid references public.sucursales(id), creado_por uuid not null references public.perfiles(id), creado_en timestamptz not null default now(),
 unique(cuenta_id,sha256), check(periodo_desde<=primera_fecha and primera_fecha<=ultima_fecha and ultima_fecha<=periodo_hasta),
 check(movimientos between 1 and 2000 and nuevos>=0 and repetidos>=0 and nuevos+repetidos=movimientos),
 check(saldo_inicial+abonos-cargos=saldo_final)
);
create table public.banca_archivos (
 importacion_id uuid primary key references public.banca_importaciones(id), contenido bytea not null check(octet_length(contenido) between 1 and 2097152)
);
create table public.banca_movimientos (
 id uuid primary key default gen_random_uuid(), cuenta_id uuid not null references public.banca_cuentas(id),
 fecha date not null, fila_origen integer not null check(fila_origen>0), descripcion text not null, referencia text not null, clasificacion text not null,
 cargo numeric(16,2) not null check(cargo>=0), abono numeric(16,2) not null check(abono>=0), saldo numeric(16,2) not null,
 huella text not null, importacion_id uuid not null references public.banca_importaciones(id),
 sucursal_id uuid references public.sucursales(id), unique(cuenta_id,huella), check((cargo>0)<>(abono>0))
);
create index banca_movimientos_cuenta_fecha on public.banca_movimientos(cuenta_id,fecha);
create table public.banca_importacion_renglones (
 importacion_id uuid not null references public.banca_importaciones(id), fila integer not null,
 movimiento_id uuid not null references public.banca_movimientos(id), original jsonb not null,
 primary key(importacion_id,fila), check(jsonb_typeof(original)='array' and jsonb_array_length(original)=7)
);
alter table public.banca_cuentas enable row level security;
alter table public.banca_importaciones enable row level security;
alter table public.banca_archivos enable row level security;
alter table public.banca_movimientos enable row level security;
alter table public.banca_importacion_renglones enable row level security;
revoke all on public.banca_cuentas,public.banca_importaciones,public.banca_archivos,public.banca_movimientos,public.banca_importacion_renglones from public,anon,authenticated;
grant select on public.banca_cuentas,public.banca_importaciones,public.banca_archivos,public.banca_movimientos,public.banca_importacion_renglones to authenticated;
create policy banca_cuentas_consulta on public.banca_cuentas for select to authenticated using(public.ve_compras());
create policy banca_importaciones_consulta on public.banca_importaciones for select to authenticated using(public.ve_compras());
create policy banca_archivos_consulta on public.banca_archivos for select to authenticated using(public.ve_compras());
create policy banca_movimientos_consulta on public.banca_movimientos for select to authenticated using(public.ve_compras());
create policy banca_renglones_consulta on public.banca_importacion_renglones for select to authenticated using(public.ve_compras());

create function public.importar_banregio(p_solicitud uuid,p_archivo text,p_original text,p_reporte jsonb,p_sucursal uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
<<carga>>
declare c public.banca_cuentas; previa public.banca_importaciones; m jsonb; contenido bytea; sha text; sol jsonb;
 cuenta text; clabe text; rfc text; titular text; desde date; hasta date; primera date; ultima date;
 inicial numeric; saldo numeric; cargo numeric; abono numeric; siguiente numeric; cargos numeric:=0; abonos numeric:=0;
 fecha date; anterior date; descripcion text; referencia text; clasificacion text; huella text;
 filas integer[]:='{}'; huellas text[]:='{}'; nuevos integer:=0; repetidos integer:=0; mov uuid; checksum integer:=0; i integer; frontera numeric;
begin
 if public.mi_rol()::text is distinct from 'admin' then raise exception 'Solo administración importa movimientos bancarios.';end if;
 if p_solicitud is null or length(coalesce(p_archivo,'')) not between 1 and 200 or p_archivo!~*'\.xlsx$' or length(coalesce(p_original,'')) not between 1 and 2800000 or jsonb_typeof(p_reporte) is distinct from 'object' then raise exception 'Archivo o solicitud inválida.';end if;
 contenido:=decode(p_original,'base64');
 if octet_length(contenido) not between 1 and 2097152 or substring(contenido from 1 for 4)<>decode('504b0304','hex') then raise exception 'Conserva el Excel original, hasta 2 MB.';end if;
 sha:=encode(sha256(contenido),'hex');
 sol:=jsonb_build_object('archivo',p_archivo,'sha256',sha,'reporte',p_reporte,'sucursal',p_sucursal);
 perform pg_advisory_xact_lock(hashtextextended('banca-solicitud:'||p_solicitud,0));
 select * into previa from public.banca_importaciones where id=p_solicitud;
 if found then
  if previa.creado_por<>auth.uid() or previa.solicitud is distinct from sol then raise exception 'La solicitud ya se utilizó con otros datos.';end if;
  return previa.id;
 end if;
 cuenta:=p_reporte->>'cuenta';clabe:=p_reporte->>'clabe';rfc:=p_reporte->>'rfc';titular:=p_reporte->>'titular';
 if cuenta is null or cuenta!~'^\d{12}$' or clabe is null or clabe!~'^058\d{15}$' or coalesce(length(titular),0) not between 1 and 300 or p_reporte->>'moneda' is distinct from 'MXN' then raise exception 'Revisa cuenta, CLABE, titular y moneda MXN.';end if;
 for i in 1..17 loop checksum:=checksum+(substring(clabe from i for 1)::integer*(array[3,7,1])[((i-1)%3)+1])%10;end loop;
 if (10-checksum%10)%10<>substring(clabe from 18 for 1)::integer then raise exception 'CLABE inválida.';end if;
 if not exists(select 1 from public.razones_sociales e where e.rfc=carga.rfc and e.activa) then raise exception 'El RFC del archivo no corresponde a una razón social activa del grupo.';end if;
 if p_sucursal is not null and not exists(select 1 from public.razon_social_sucursales s where s.rfc=carga.rfc and s.sucursal_id=p_sucursal) then raise exception 'La sucursal no está asociada a esa razón social. Usa sin asignar para una cuenta compartida.';end if;
 desde:=(p_reporte->>'desde')::date;hasta:=(p_reporte->>'hasta')::date;inicial:=(p_reporte->>'saldoInicial')::numeric;saldo:=inicial;
 if desde is null or hasta is null or desde>hasta or inicial is null or abs(inicial)>=1e14 or inicial<>round(inicial,2) then raise exception 'Periodo o saldo inicial inválido.';end if;
 if jsonb_typeof(p_reporte->'movimientos') is distinct from 'array' or jsonb_array_length(p_reporte->'movimientos') not between 1 and 2000 then raise exception 'Se requieren de 1 a 2,000 movimientos.';end if;
 perform pg_advisory_xact_lock(hashtextextended('banca-cuenta:'||cuenta,0));
 select * into c from public.banca_cuentas b where b.numero=carga.cuenta for update;
 if found and (c.rfc<>rfc or c.clabe<>clabe or c.moneda<>'MXN') then raise exception 'La cuenta ya está registrada con otros datos; no se reasigna automáticamente.';end if;
 if c.id is not null then
  select * into previa from public.banca_importaciones b where b.cuenta_id=c.id and b.sha256=carga.sha;
  if found then
   if previa.solicitud->'reporte' is distinct from p_reporte or previa.sucursal_id is distinct from p_sucursal then raise exception 'Este archivo ya se importó con otra asignación.';end if;
   return previa.id;
  end if;
 end if;
 for m in select value from jsonb_array_elements(p_reporte->'movimientos') loop
  fecha:=(m->>'fecha')::date;cargo:=(m->>'cargo')::numeric;abono:=(m->>'abono')::numeric;siguiente:=(m->>'saldo')::numeric;
  descripcion:=m->>'descripcion';referencia:=m->>'referencia';clasificacion:=m->>'clasificacion';
  if fecha is null or fecha<desde or fecha>hasta or fecha>(now() at time zone 'America/Mexico_City')::date or fecha<anterior then raise exception 'Fecha inválida, futura o fuera de orden.';end if;
  if cargo is null or abono is null or siguiente is null or cargo<0 or abono<0 or (cargo>0)=(abono>0) or greatest(cargo,abono,abs(siguiente))>=1e14 or cargo<>round(cargo,2) or abono<>round(abono,2) or siguiente<>round(siguiente,2) or saldo-cargo+abono<>siguiente then raise exception 'Importes o secuencia de saldos inválidos.';end if;
  if coalesce(length(descripcion),0) not between 1 and 2000 or referencia is null or length(referencia)>500 or clasificacion is null or length(clasificacion)>300 or (descripcion||referencia||clasificacion)~'[[:cntrl:]]' then raise exception 'Texto bancario inválido.';end if;
  if (m->>'fila')::integer is null or (m->>'fila')::integer<=0 or (m->>'fila')::integer=any(filas) or jsonb_typeof(m->'original') is distinct from 'array' or jsonb_array_length(m->'original')<>7 then raise exception 'Renglón fuente inválido o repetido.';end if;
  huella:=encode(sha256(convert_to(concat_ws(chr(31),fecha::text,descripcion,referencia,to_char(cargo,'FM999999999999990.00'),to_char(abono,'FM999999999999990.00'),to_char(siguiente,'FM999999999999990.00')),'UTF8')),'hex');
  if huella is distinct from m->>'huella' or huella=any(huellas) then raise exception 'Huella inválida o movimientos indistinguibles.';end if;
  huellas:=array_append(huellas,huella);filas:=array_append(filas,(m->>'fila')::integer);
  saldo:=siguiente;cargos:=cargos+cargo;abonos:=abonos+abono;primera:=coalesce(primera,fecha);ultima:=fecha;anterior:=fecha;
 end loop;
 if saldo is distinct from (p_reporte->>'saldoFinal')::numeric or cargos is distinct from (p_reporte->>'cargos')::numeric or abonos is distinct from (p_reporte->>'abonos')::numeric or primera::text is distinct from p_reporte->>'primeraFecha' or ultima::text is distinct from p_reporte->>'ultimaFecha' then raise exception 'El resumen no coincide con los movimientos.';end if;
 -- Se comprueba continuidad solo si hay movimientos en la fecha inmediatamente contigua.
 if c.id is not null then
  select b.saldo into frontera from public.banca_movimientos b where b.cuenta_id=c.id and b.fecha=desde-1 order by b.fila_origen desc limit 1;
  if found and frontera<>inicial then raise exception 'El saldo inicial no enlaza con el último saldo del día anterior.';end if;
  select b.saldo+b.cargo-b.abono into frontera from public.banca_movimientos b where b.cuenta_id=c.id and b.fecha=ultima+1 order by b.fila_origen limit 1;
  if found and frontera<>saldo then raise exception 'El saldo final no enlaza con el primer movimiento del día siguiente.';end if;
 end if;
 -- Un día previamente cargado debe coincidir COMPLETO. Nunca se mezclan cambios o reportes parciales del mismo día.
 if c.id is not null and exists(
  select 1 from (select distinct (x->>'fecha')::date as fecha from jsonb_array_elements(p_reporte->'movimientos') x) d
  where exists(select 1 from public.banca_movimientos b where b.cuenta_id=c.id and b.fecha=d.fecha)
  and (exists(select 1 from public.banca_movimientos b where b.cuenta_id=c.id and b.fecha=d.fecha and not(b.huella=any(huellas)))
   or exists(select 1 from jsonb_array_elements(p_reporte->'movimientos') x where (x->>'fecha')::date=d.fecha and not exists(select 1 from public.banca_movimientos b where b.cuenta_id=c.id and b.huella=x->>'huella')))
 ) then raise exception 'Un día ya importado contiene movimientos distintos o incompletos. Revisa los reportes; no se modificó nada.';end if;
 if c.id is null then
  insert into public.banca_cuentas(banco,numero,clabe,rfc,moneda,titular_fuente,creado_por) values('banregio',cuenta,clabe,rfc,'MXN',titular,auth.uid()) returning * into c;
 end if;
 select count(*) into repetidos from public.banca_movimientos b where b.cuenta_id=c.id and b.huella=any(huellas);
 nuevos:=cardinality(huellas)-repetidos;
 insert into public.banca_importaciones(id,cuenta_id,archivo,sha256,solicitud,periodo_desde,periodo_hasta,primera_fecha,ultima_fecha,saldo_inicial,saldo_final,cargos,abonos,movimientos,nuevos,repetidos,sucursal_id,creado_por)
 values(p_solicitud,c.id,p_archivo,sha,sol,desde,hasta,primera,ultima,inicial,saldo,cargos,abonos,cardinality(huellas),nuevos,repetidos,p_sucursal,auth.uid());
 insert into public.banca_archivos values(p_solicitud,contenido);
 for m in select value from jsonb_array_elements(p_reporte->'movimientos') loop
  select id into mov from public.banca_movimientos b where b.cuenta_id=c.id and b.huella=m->>'huella';
  if mov is null then
   insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id,sucursal_id)
   values(c.id,(m->>'fecha')::date,(m->>'fila')::integer,m->>'descripcion',m->>'referencia',m->>'clasificacion',(m->>'cargo')::numeric,(m->>'abono')::numeric,(m->>'saldo')::numeric,m->>'huella',p_solicitud,p_sucursal) returning id into mov;
  end if;
  insert into public.banca_importacion_renglones values(p_solicitud,(m->>'fila')::integer,mov,m->'original');
 end loop;
 return p_solicitud;
end $$;
revoke all on function public.importar_banregio(uuid,text,text,jsonb,uuid) from public,anon;
grant execute on function public.importar_banregio(uuid,text,text,jsonb,uuid) to authenticated;
create view public.banca_saldos with(security_invoker=true) as
 select c.id,c.banco,c.numero,c.rfc,c.moneda,e.razon_social,
 i.id as importacion_id,i.ultima_fecha,i.saldo_final,i.creado_en as importado_en
 from public.banca_cuentas c join public.razones_sociales e on e.rfc=c.rfc
 left join lateral(select b.id,b.ultima_fecha,b.saldo_final,b.creado_en from public.banca_importaciones b where b.cuenta_id=c.id order by b.ultima_fecha desc,b.creado_en desc,b.id desc limit 1) i on true;
revoke all on public.banca_saldos from public,anon,authenticated;
grant select on public.banca_saldos to authenticated;
commit;
