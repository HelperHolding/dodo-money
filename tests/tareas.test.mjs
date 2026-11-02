import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261102120000_tareas.sql');

// Lo mínimo de Supabase y de los módulos ligados. Enums y checks copian los reales (0001, 0008, 0012, 0013, 0037, 0048).
export const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create type rol_usuario as enum('operacion','encargado','gerente','admin','corporativo');
 create table sucursales(id uuid primary key,nombre text not null);
 insert into sucursales values('00000000-0000-0000-0000-0000000000e1','Zapopan-1'),('00000000-0000-0000-0000-0000000000e2','Tlaquepaque');
 create table perfiles(id uuid primary key,nombre text not null,rol rol_usuario not null,sucursal_id uuid references sucursales(id),activo boolean not null default true,debe_cambiar_contrasena boolean not null default false);
 insert into perfiles values
  ('00000000-0000-0000-0000-0000000000a1','Julio','admin',null,true,false),
  ('00000000-0000-0000-0000-0000000000c1','Halim','corporativo',null,true,false),
  ('00000000-0000-0000-0000-0000000000d0','Gerente Z','gerente','00000000-0000-0000-0000-0000000000e1',true,false),
  ('00000000-0000-0000-0000-0000000000d1','Encargado Z','encargado','00000000-0000-0000-0000-0000000000e1',true,false),
  ('00000000-0000-0000-0000-0000000000f1','Ana (op Z)','operacion','00000000-0000-0000-0000-0000000000e1',true,false),
  ('00000000-0000-0000-0000-0000000000f2','Luis (op T)','operacion','00000000-0000-0000-0000-0000000000e2',true,false),
  ('00000000-0000-0000-0000-0000000000f3','Baja (op Z)','operacion','00000000-0000-0000-0000-0000000000e1',false,false);
 create function mi_rol() returns rol_usuario language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 create function mi_sucursal() returns uuid language sql stable security definer set search_path='' as $$select sucursal_id from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 grant execute on function mi_rol(),mi_sucursal() to authenticated;
 create function hoy_mx() returns date language sql stable as $$select date '2026-11-02'$$;
 create table proveedores(id uuid primary key,razon_social text not null,nombre_comercial text);
 insert into proveedores values('00000000-0000-0000-0000-0000000000b1','HARINAS DEL BAJIO SA','Harinas Bajío');
 create type estado_orden as enum('borrador','enviada','confirmada','cerrada','cancelada');
 create table ordenes_compra(id uuid primary key,folio text not null unique,proveedor_id uuid not null references proveedores(id),sucursal_id uuid references sucursales(id),estado estado_orden not null default 'borrador');
 insert into ordenes_compra values('00000000-0000-0000-0000-00000000000a','OC-0042','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e1','cancelada');
 create type estado_factura as enum('por_pagar','parcial','pagada','cancelada');
 create table facturas(id uuid primary key,uuid text not null unique,serie text,folio text,nombre_emisor text not null,sucursal_id uuid references sucursales(id),estado estado_factura not null default 'por_pagar');
 insert into facturas values('00000000-0000-0000-0000-0000000000fa','8f1c2d3e-aaaa-bbbb-cccc-000000000001','A','1234','HARINAS DEL BAJIO SA','00000000-0000-0000-0000-0000000000e1','por_pagar'),
  ('00000000-0000-0000-0000-0000000000fb','9e2d3c4b-aaaa-bbbb-cccc-000000000002',null,null,'CFE',null,'por_pagar');
 create table ventas_dia(id uuid primary key,sucursal_id uuid not null references sucursales(id),fecha date not null);
 insert into ventas_dia values('00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000e1','2026-11-01'),('00000000-0000-0000-0000-0000000000a6','00000000-0000-0000-0000-0000000000e2','2026-11-01');
 create table apertura_proyectos(id uuid primary key,sucursal_id uuid not null unique references sucursales(id));
 insert into apertura_proyectos values('00000000-0000-0000-0000-0000000000a7','00000000-0000-0000-0000-0000000000e2');
 create table apertura_items(id uuid primary key,proyecto_id uuid not null references apertura_proyectos(id),clave text not null,nombre text not null);
 insert into apertura_items values('00000000-0000-0000-0000-0000000000a8','00000000-0000-0000-0000-0000000000a7','E-12','Horno de banda');`;

export const U={admin:'00000000-0000-0000-0000-0000000000a1',corp:'00000000-0000-0000-0000-0000000000c1',gerente:'00000000-0000-0000-0000-0000000000d0',
 encargado:'00000000-0000-0000-0000-0000000000d1',ana:'00000000-0000-0000-0000-0000000000f1',luis:'00000000-0000-0000-0000-0000000000f2',baja:'00000000-0000-0000-0000-0000000000f3'};
export const S={z:'00000000-0000-0000-0000-0000000000e1',t:'00000000-0000-0000-0000-0000000000e2'};
export const como=(db,id)=>db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:id,role:'authenticated'})]);
export const crear=async(db,id,datos)=>{await como(db,id);return Number((await db.query(`select public.crear_tarea($1::jsonb) n`,[JSON.stringify(datos)])).rows[0].n);};
export const visibles=async(db,id)=>{await como(db,id);return (await db.query(`select numero,titulo,documento_texto,documento_ruta,documento_anulado,asignado,asignado_activo,sucursal from public.tareas_visibles()`)).rows;};
export const nueva=async()=>{const db=new PGlite();await db.exec(BASE);await db.exec(migracion);return db;};
const rechaza=(p,re)=>assert.rejects(p,e=>{assert.match(e.message,re);return true;});

test('tareas: admin crea ligada a factura; toma sucursal y texto del documento',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Subir remisión firmada',prioridad:'alta',vence:'2026-11-06',asignado_a:U.gerente,documento_tipo:'factura',documento_id:'00000000-0000-0000-0000-0000000000fa'});
  assert.equal(n,1);
  const [t]=await visibles(db,U.admin);
  assert.equal(t.documento_texto,'Factura A-1234 · HARINAS DEL BAJIO SA');
  assert.equal(t.documento_ruta,'/compras/facturas/00000000-0000-0000-0000-0000000000fa');
  assert.equal(t.sucursal,'Zapopan-1');
  const sinFolio=await crear(db,U.admin,{titulo:'Revisar recibo',asignado_a:U.admin,documento_tipo:'factura',documento_id:'00000000-0000-0000-0000-0000000000fb'});
  assert.equal((await visibles(db,U.admin)).find(x=>Number(x.numero)===sinFolio).documento_texto,'Factura 9e2d3c4b · CFE');
 }finally{await db.close();}
});

test('tareas: textos y rutas de cada tipo de documento; orden cancelada sale anulada',async()=>{
 const db=await nueva();
 try{
  await crear(db,U.admin,{titulo:'Orden',asignado_a:U.admin,documento_tipo:'orden',documento_id:'00000000-0000-0000-0000-00000000000a'});
  await crear(db,U.admin,{titulo:'Venta',asignado_a:U.admin,documento_tipo:'ventas_dia',documento_id:'00000000-0000-0000-0000-0000000000a5'});
  await crear(db,U.admin,{titulo:'Proyecto',asignado_a:U.admin,documento_tipo:'apertura_proyecto',documento_id:'00000000-0000-0000-0000-0000000000a7'});
  await crear(db,U.admin,{titulo:'Item',asignado_a:U.admin,documento_tipo:'apertura_item',documento_id:'00000000-0000-0000-0000-0000000000a8'});
  const filas=Object.fromEntries((await visibles(db,U.admin)).map(x=>[x.titulo,x]));
  assert.equal(filas.Orden.documento_texto,'Orden OC-0042 · Harinas Bajío');assert.equal(filas.Orden.documento_anulado,true);
  assert.equal(filas.Venta.documento_texto,'Venta Zapopan-1 · 01/11/2026');
  assert.equal(filas.Venta.documento_ruta,`/ventas/conciliacion?mes=2026-11&sucursal=${S.z}`);
  assert.equal(filas.Proyecto.documento_texto,'Apertura Tlaquepaque');
  assert.equal(filas.Item.documento_texto,'Apertura Tlaquepaque · E-12 Horno de banda');
  assert.equal(filas.Item.documento_ruta,'/aperturas/00000000-0000-0000-0000-0000000000a7/items/00000000-0000-0000-0000-0000000000a8');
 }finally{await db.close();}
});

test('tareas: quién puede crear y a quién puede asignar',async()=>{
 const db=await nueva();
 try{
  await rechaza(crear(db,U.corp,{titulo:'Algo',asignado_a:U.ana}),/Corporativo solo puede consultar/);
  await rechaza(crear(db,U.ana,{titulo:'Algo',asignado_a:U.ana}),/no puede crear tareas/);
  await rechaza(crear(db,U.encargado,{titulo:'Algo',asignado_a:U.gerente}),/Esa persona no puede recibir esta tarea/);
  await rechaza(crear(db,U.gerente,{titulo:'Algo',asignado_a:U.luis}),/Esa persona no puede recibir esta tarea/);
  await rechaza(crear(db,U.admin,{titulo:'Algo',asignado_a:U.baja}),/Esa persona no puede recibir esta tarea/);
  await rechaza(crear(db,U.admin,{titulo:'Algo',asignado_a:U.corp}),/Esa persona no puede recibir esta tarea/);
  await rechaza(crear(db,U.admin,{titulo:'Algo',asignado_a:U.luis,documento_tipo:'factura',documento_id:'00000000-0000-0000-0000-0000000000fa'}),/Esa persona no puede recibir esta tarea/);
  await rechaza(crear(db,U.gerente,{titulo:'Algo',asignado_a:U.ana,documento_tipo:'factura',documento_id:'00000000-0000-0000-0000-0000000000fa'}),/No puedes ligar tareas a este documento/);
  await rechaza(crear(db,U.gerente,{titulo:'Algo',asignado_a:U.ana,documento_tipo:'ventas_dia',documento_id:'00000000-0000-0000-0000-0000000000a6'}),/No puedes ligar tareas a este documento/);
  await rechaza(crear(db,U.admin,{titulo:'  a ',asignado_a:U.ana}),/El título debe tener de 3 a 200 caracteres/);
  await rechaza(crear(db,U.admin,{titulo:'Algo',asignado_a:U.ana,prioridad:'urgente'}),/Prioridad inválida/);
  await rechaza(crear(db,U.admin,{titulo:'Algo',asignado_a:U.ana,extra:'x'}),/Datos de tarea inválidos/);
  await rechaza(crear(db,U.admin,{titulo:'Algo',asignado_a:U.ana,documento_tipo:'factura'}),/Documento incompleto/);
  // Válidas: gerente liga día de su sucursal; encargado asigna a operación; el gerente no puede elegir otra sucursal.
  await crear(db,U.gerente,{titulo:'Revisar día',asignado_a:U.encargado,documento_tipo:'ventas_dia',documento_id:'00000000-0000-0000-0000-0000000000a5'});
  const n=await crear(db,U.encargado,{titulo:'Limpiar cámara',asignado_a:U.ana,sucursal_id:S.t});
  assert.equal((await visibles(db,U.admin)).find(x=>Number(x.numero)===n).sucursal,'Zapopan-1');
 }finally{await db.close();}
});

test('tareas: personas asignables por puesto',async()=>{
 const db=await nueva();
 try{
  const nombres=async(id,s)=>{await como(db,id);return (await db.query(`select nombre from public.personas_asignables($1)`,[s])).rows.map(r=>r.nombre);};
  assert.deepEqual(await nombres(U.admin,S.z),['Ana (op Z)','Encargado Z','Gerente Z','Julio']);
  assert.deepEqual(await nombres(U.admin,null),['Ana (op Z)','Encargado Z','Gerente Z','Julio','Luis (op T)']);
  assert.deepEqual(await nombres(U.gerente,S.t),['Ana (op Z)','Encargado Z','Gerente Z']);
  assert.deepEqual(await nombres(U.encargado,null),['Ana (op Z)','Encargado Z']);
  assert.deepEqual(await nombres(U.ana,null),[]);
  assert.deepEqual(await nombres(U.corp,null),[]);
 }finally{await db.close();}
});

test('tareas: cada puesto ve solo lo suyo',async()=>{
 const db=await nueva();
 try{
  await crear(db,U.admin,{titulo:'Oficina para Julio',asignado_a:U.admin});
  await crear(db,U.admin,{titulo:'Para Ana',asignado_a:U.ana,sucursal_id:S.z});
  await crear(db,U.admin,{titulo:'Para Luis',asignado_a:U.luis,sucursal_id:S.t});
  await crear(db,U.gerente,{titulo:'Para encargado',asignado_a:U.encargado});
  const titulos=async id=>(await visibles(db,id)).map(x=>x.titulo).sort();
  assert.deepEqual(await titulos(U.corp),['Oficina para Julio','Para Ana','Para Luis','Para encargado']);
  assert.deepEqual(await titulos(U.gerente),['Para Ana','Para encargado']);
  assert.deepEqual(await titulos(U.encargado),['Para Ana','Para encargado']);
  assert.deepEqual(await titulos(U.ana),['Para Ana']);
  assert.deepEqual(await titulos(U.luis),['Para Luis']);
  assert.deepEqual(await titulos(U.baja),[]);
 }finally{await db.close();}
});

test('tareas: la RLS aplica el mismo criterio y nadie escribe directo',async()=>{
 const db=await nueva();
 try{
  await crear(db,U.admin,{titulo:'Para Ana',asignado_a:U.ana,sucursal_id:S.z});
  await crear(db,U.admin,{titulo:'Para Luis',asignado_a:U.luis,sucursal_id:S.t});
  await como(db,U.ana);
  await db.exec('set role authenticated');
  assert.deepEqual((await db.query('select titulo from public.tareas')).rows.map(r=>r.titulo),['Para Ana']);
  await rechaza(db.query(`insert into public.tareas(titulo,asignado_a,creado_por) values('x','${U.ana}','${U.ana}')`),/permission denied/);
  await rechaza(db.query(`update public.tareas set estado='hecho'`),/permission denied/);
  await db.exec('reset role');
 }finally{await db.close();}
});

test('tareas: contador de mis tareas abiertas y vencidas',async()=>{
 const db=await nueva();
 try{
  await crear(db,U.admin,{titulo:'Vencida',asignado_a:U.ana,sucursal_id:S.z,vence:'2026-11-01'});
  await crear(db,U.admin,{titulo:'Al día',asignado_a:U.ana,sucursal_id:S.z,vence:'2026-11-09'});
  await como(db,U.ana);
  assert.deepEqual((await db.query('select * from public.contar_mis_tareas()')).rows[0],{abiertas:2,vencidas:1});
 }finally{await db.close();}
});

test('tareas: documento_para_tarea exige poder ligar',async()=>{
 const db=await nueva();
 try{
  await como(db,U.admin);
  assert.equal((await db.query(`select texto from public.documento_para_tarea('factura','00000000-0000-0000-0000-0000000000fa')`)).rows[0].texto,'Factura A-1234 · HARINAS DEL BAJIO SA');
  await como(db,U.gerente);
  await rechaza(db.query(`select * from public.documento_para_tarea('factura','00000000-0000-0000-0000-0000000000fa')`),/No puedes ligar tareas a este documento/);
  await rechaza(db.query(`select * from public.documento_para_tarea('factura','00000000-0000-0000-0000-000000000999')`),/El documento no existe/);
 }finally{await db.close();}
});

test('tareas: a lo más un documento por tarea',async()=>{
 const db=await nueva();
 try{
  await rechaza(db.query(`insert into public.tareas(titulo,asignado_a,creado_por,factura_id,orden_id) values('Dos docs','${U.admin}','${U.admin}','00000000-0000-0000-0000-0000000000fa','00000000-0000-0000-0000-00000000000a')`),/tareas_un_documento/);
 }finally{await db.close();}
});

test('tareas: la prueba SQL de Sebastián termina en PRUEBAS OK',{skip:!existsSync(new URL('../supabase/pruebas/20261102120000_tareas.sql',import.meta.url))},async()=>{
 const db=await nueva();
 try{
  await db.exec(`insert into facturas values('00000000-0000-0000-0000-0000000000fc','7a7a7a7a-aaaa-bbbb-cccc-000000000003','B','77','GAS DEL NORTE','${S.z}','por_pagar')`);
  await assert.rejects(db.exec(load('supabase/pruebas/20261102120000_tareas.sql')),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});
 }finally{await db.close();}
});

test('tareas: reimportar el día de venta no se topa con la tarea ligada',async()=>{
 const db=await nueva();
 try{
  await crear(db,U.admin,{titulo:'Revisar día',asignado_a:U.gerente,documento_tipo:'ventas_dia',documento_id:'00000000-0000-0000-0000-0000000000a5'});
  const antes=(await visibles(db,U.admin))[0];
  await db.exec(`delete from ventas_dia where id='00000000-0000-0000-0000-0000000000a5';insert into ventas_dia values('00000000-0000-0000-0000-0000000000b5','${S.z}','2026-11-01')`);
  const [t]=await visibles(db,U.admin);
  assert.equal(t.documento_texto,antes.documento_texto);
  await como(db,U.admin);
  const r=(await db.query(`select documento_id,documento_tipo from public.tareas_visibles(null,'00000000-0000-0000-0000-0000000000b5')`)).rows;
  assert.deepEqual(r,[{documento_id:'00000000-0000-0000-0000-0000000000b5',documento_tipo:'ventas_dia'}]);
  // Si el día ya no existe, la tarea sigue visible con su texto guardado y sin documento vivo.
  await db.exec(`delete from ventas_dia where id='00000000-0000-0000-0000-0000000000b5'`);
  const [u]=await visibles(db,U.admin);
  assert.equal(u.documento_texto,antes.documento_texto);assert.equal(u.documento_ruta,null);
 }finally{await db.close();}
});

test('tareas: entradas mal formadas dan mensajes en español',async()=>{
 const db=await nueva();
 try{
  const ok={titulo:'Algo',asignado_a:U.ana};
  await rechaza(crear(db,U.admin,{...ok,vence:'2026-02-30'}),/La fecha de vencimiento no es válida/);
  await rechaza(crear(db,U.admin,{...ok,vence:'mañana'}),/La fecha de vencimiento no es válida/);
  await rechaza(crear(db,U.admin,{...ok,documento_tipo:'factura',documento_id:'no-es-uuid'}),/El documento ligado está incompleto/);
  await rechaza(crear(db,U.admin,{...ok,sucursal_id:'xyz'}),/Sucursal inválida/);
  await rechaza(crear(db,U.admin,{...ok,sucursal_id:'00000000-0000-0000-0000-0000000000e9'}),/Sucursal inválida/);
  await crear(db,U.admin,{...ok,vence:'2028-02-29'});
 }finally{await db.close();}
});

test('tareas: el encargado no ve tareas de operación de otra sucursal; nadie toca la secuencia',async()=>{
 const db=await nueva();
 try{
  await db.exec(`insert into public.tareas(titulo,asignado_a,creado_por,sucursal_id) values('Cruzada','${U.luis}','${U.admin}','${S.z}')`);
  assert.deepEqual((await visibles(db,U.encargado)).map(x=>x.titulo),[]);
  await como(db,U.ana);await db.exec('set role authenticated');
  await rechaza(db.query(`select nextval('public.tareas_numero')`),/permission denied/);
  await db.exec('reset role');
 }finally{await db.close();}
});
