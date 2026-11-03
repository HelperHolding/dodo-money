import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {BASE,U,S,como} from './tareasBase.mjs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const fase1=load('supabase/migrations/20261102120000_tareas.sql');
const migracion=load('supabase/migrations/20261102200000_tareas_automaticas.sql');

// Lo que las reglas leen, encima de los stubs de la fase 1. Columnas, enums y checks copian los reales
// (0006, 0012, 0013, 0014, 0022, 0037, 20261020180000); recibido_renglon_total resume la de 20261020200000 sin conciliación.
const EXTRA=`create role service_role;
 alter table sucursales add column dodois_unit_id text unique;
 create type tipo_factura as enum('ingreso','egreso');
 alter table facturas add column tipo tipo_factura not null default 'ingreso',add column vence_el date not null default '2026-12-31',
  add column revisada boolean not null default false,add column revision_nota text,add column revisada_por uuid,add column revisada_en timestamptz,add column creado_en timestamptz not null default now(),
  add column pago_programado_el date,add check(not revisada or coalesce(trim(revision_nota),'')<>'');
 alter table ordenes_compra add column entrega_esperada date,add column confirmada_en timestamptz;
 create table orden_renglones(id uuid primary key,orden_id uuid not null references ordenes_compra(id),cantidad numeric(12,3) not null check(cantidad>0));
 create table recepciones_app(id uuid primary key default gen_random_uuid(),orden_renglon_id uuid not null references orden_renglones(id),cantidad numeric(12,3) not null check(cantidad>0),
  anulada_en timestamptz,motivo_anulacion text,check(anulada_en is null or coalesce(trim(motivo_anulacion),'')<>''));
 create table recepciones_dodo(id uuid primary key default gen_random_uuid(),orden_renglon_id uuid,cantidad numeric(12,3) not null check(cantidad>0));
 create function recibido_renglon_total(p_renglon uuid) returns numeric language sql stable security definer set search_path=public as $$
  select coalesce((select sum(cantidad) from recepciones_dodo where orden_renglon_id=p_renglon),0)
   +coalesce((select sum(cantidad) from recepciones_app where orden_renglon_id=p_renglon and anulada_en is null),0)$$;
 alter table apertura_items add column tipo text not null default 'actividad' check(tipo in ('actividad','equipo','referencia','tecnico')),add column estado text not null default 'pendiente' check(estado in ('pendiente','por_validar','en_curso','bloqueado','completado','no_aplica','por_cotizar','cotizado','aprobado','pedido','recibido_parcial','recibido','instalado','verificado')),
  add column inicio date,add column fin date,add check(fin is null or inicio is null or fin>=inicio);`;

const nueva=async()=>{const db=new PGlite();await db.exec(BASE);await db.exec(EXTRA);await db.exec(fase1);await db.exec(migracion);return db;};
const rechaza=(p,re)=>assert.rejects(p,e=>{assert.match(e.message,re);return true;});
// n8n llama con la llave de servicio: sin usuario.
const generar=async db=>{await db.query(`select set_config('request.jwt.claims','',false)`);
 return Object.fromEntries((await db.query(`select * from public.generar_tareas_automaticas()`)).rows.map(r=>[r.regla,{creadas:r.creadas,cerradas:r.cerradas}]));};
const regla=async(db,clave,cambios={})=>{await como(db,U.admin);
 const {activa=true,asignado=U.admin,dias,prioridad='media'}=cambios;
 const d=dias??(await db.query(`select dias from tarea_reglas where clave=$1`,[clave])).rows[0].dias;
 await db.query(`select public.actualizar_regla_tarea($1,$2,$3,$4,$5)`,[clave,activa,asignado,d,prioridad]);};
const deRegla=async(db,clave)=>(await db.query(`select numero,estado::text,titulo,documento_texto,asignado_a,creado_por,origen,sucursal_id,vence::text,prioridad::text,motivo_cierre from tareas where regla=$1 order by numero`,[clave])).rows;

const FC='00000000-0000-0000-0000-0000000000fc',OC='00000000-0000-0000-0000-00000000005a',RE='00000000-0000-0000-0000-00000000005b',ITEM='00000000-0000-0000-0000-0000000000a8';
// Por regla: cómo hacer verdadera la condición, cómo resolverla y qué se espera de la tarea creada.
const CASOS={
 factura_sin_revisar:{
  preparar:`insert into facturas(id,uuid,serie,folio,nombre_emisor,sucursal_id,estado,creado_en) values('${FC}','7a7a7a7a-aaaa-bbbb-cccc-000000000003','B','77','GAS DEL NORTE','${S.z}','por_pagar','2026-10-28 12:00-06')`,
  resolver:`update facturas set revisada=true,revision_nota='Cuadra con la remisión' where id='${FC}'`,
  reabrir:`update facturas set revisada=false,revision_nota=null where id='${FC}'`,
  espera:{titulo:'Factura sin revisar · Factura B-77 · GAS DEL NORTE',documento_texto:'Factura B-77 · GAS DEL NORTE',asignado_a:U.admin,sucursal_id:S.z,vence:null}},
 factura_por_vencer:{
  preparar:`insert into facturas(id,uuid,serie,folio,nombre_emisor,sucursal_id,estado,vence_el,revisada,revision_nota) values('${FC}','7a7a7a7a-aaaa-bbbb-cccc-000000000003','B','77','GAS DEL NORTE',null,'parcial','2026-11-06',true,'ok')`,
  resolver:`update facturas set pago_programado_el='2026-11-05' where id='${FC}'`,
  reabrir:`update facturas set pago_programado_el=null where id='${FC}'`,
  espera:{titulo:'Factura por vencer sin pago programado · Factura B-77 · GAS DEL NORTE',documento_texto:'Factura B-77 · GAS DEL NORTE',asignado_a:U.admin,sucursal_id:null,vence:'2026-11-06'}},
 dia_sin_ventas:{
  // Zapopan vende desde el 28 y le falta el 31; Tlaquepaque solo tiene el 1 (no había vendido antes): no cuenta.
  preparar:`update sucursales set dodois_unit_id='u-'||left(id::text,4)||right(id::text,2);
   insert into ventas_dia values('00000000-0000-0000-0000-0000000000b1','${S.z}','2026-10-28'),('00000000-0000-0000-0000-0000000000b2','${S.z}','2026-10-30')`,
  resolver:`insert into ventas_dia values('00000000-0000-0000-0000-0000000000b3','${S.z}','2026-10-31')`,
  reabrir:`delete from ventas_dia where id='00000000-0000-0000-0000-0000000000b3'`,
  espera:{titulo:'Día sin ventas · Zapopan-1 · 31/10/2026',documento_texto:'Venta Zapopan-1 · 31/10/2026',asignado_a:U.admin,sucursal_id:S.z,vence:null}},
 orden_sin_recibir:{
  preparar:`insert into ordenes_compra(id,folio,proveedor_id,sucursal_id,estado,entrega_esperada) values('${OC}','OC-0050','00000000-0000-0000-0000-0000000000b1','${S.z}','confirmada','2026-10-29');
   insert into orden_renglones values('${RE}','${OC}',10)`,
  resolver:`insert into recepciones_app(orden_renglon_id,cantidad) values('${RE}',4)`,
  reabrir:`update recepciones_app set anulada_en=now(),motivo_anulacion='Se capturó en otra orden'`,
  espera:{titulo:'Orden sin recibir · Orden OC-0050 · Harinas Bajío',documento_texto:'Orden OC-0050 · Harinas Bajío',asignado_a:U.gerente,sucursal_id:S.z,vence:null}},
 apertura_item_atrasado:{
  preparar:`update apertura_items set fin='2026-10-30',estado='en_curso' where id='${ITEM}'`,
  resolver:`update apertura_items set estado='verificado' where id='${ITEM}'`,
  reabrir:`update apertura_items set estado='bloqueado' where id='${ITEM}'`,
  espera:{titulo:'Ítem de apertura atrasado · Apertura Tlaquepaque · E-12 Horno de banda',documento_texto:'Apertura Tlaquepaque · E-12 Horno de banda',asignado_a:U.admin,sucursal_id:S.t,vence:'2026-10-30'}},
};

for(const [clave,c] of Object.entries(CASOS)){
 test(`tareas automáticas ${clave}: respeta activa=false, crea, no duplica, se cierra sola y respeta la cancelación`,async()=>{
  const db=await nueva();
  try{
   await db.exec(c.preparar);
   // Apagada (así arranca): no crea nada.
   assert.equal((await generar(db))[clave].creadas,0);
   assert.deepEqual(await deRegla(db,clave),[]);
   // Prendida: crea una, ligada al documento, sin creador y con historial de «Sistema».
   await regla(db,clave,{prioridad:'alta'});
   assert.deepEqual((await generar(db))[clave],{creadas:1,cerradas:0});
   const [t]=await deRegla(db,clave);
   assert.deepEqual({titulo:t.titulo,documento_texto:t.documento_texto,asignado_a:t.asignado_a,sucursal_id:t.sucursal_id,vence:t.vence},c.espera);
   assert.equal(t.estado,'por_hacer');assert.equal(t.origen,'automatica');assert.equal(t.creado_por,null);assert.equal(t.prioridad,'alta');
   assert.deepEqual((await db.query(`select campo,usuario_id from tarea_historial h join tareas x on x.id=h.tarea_id where x.numero=$1`,[t.numero])).rows,[{campo:'creada',usuario_id:null}]);
   // Otra corrida: no duplica.
   assert.deepEqual((await generar(db))[clave],{creadas:0,cerradas:0});
   assert.equal((await deRegla(db,clave)).length,1);
   // Ya resuelto en el documento: la cierra con la nota, aunque esté en curso.
   await como(db,U.admin);await db.query(`select public.mover_tarea($1,1,'en_curso',null)`,[t.numero]);
   await db.exec(c.resolver);
   assert.deepEqual((await generar(db))[clave],{creadas:0,cerradas:1});
   const [cerrada]=await deRegla(db,clave);
   assert.equal(cerrada.estado,'hecho');assert.equal(cerrada.motivo_cierre,'Resuelto automáticamente.');
   await como(db,U.admin);
   const hilo=(await db.query(`select autor,campo,antes,despues from public.hilo_tarea($1)`,[t.numero])).rows.slice(-2);
   assert.deepEqual(hilo,[{autor:null,campo:'estado',antes:'en_curso',despues:'hecho'},{autor:null,campo:'resuelta',antes:null,despues:'Resuelto automáticamente'}]);
   // Si el pendiente vuelve, sale una nueva; si alguien la cancela, ya no se vuelve a crear.
   await db.exec(c.reabrir);
   assert.equal((await generar(db))[clave].creadas,1);
   const nueva2=(await deRegla(db,clave)).at(-1);
   await como(db,U.admin);await db.query(`select public.mover_tarea($1,1,'cancelada','Ya se habló con el proveedor')`,[nueva2.numero]);
   assert.deepEqual((await generar(db))[clave],{creadas:0,cerradas:0});
   assert.deepEqual((await deRegla(db,clave)).map(x=>x.estado),['hecho','cancelada']);
  }finally{await db.close();}
 });
}

test('tareas automáticas: umbrales de días y casos que no cuentan',async()=>{
 const db=await nueva();
 try{
  await db.exec(`insert into facturas(id,uuid,folio,nombre_emisor,estado,creado_en,vence_el) values
    ('00000000-0000-0000-0000-0000000000c1','u-1','1','CARGADA HACE 3 DIAS','por_pagar','2026-10-30 12:00-06','2027-01-31'),
    ('00000000-0000-0000-0000-0000000000c2','u-2','2','CANCELADA','cancelada','2026-10-01 12:00-06','2026-11-03'),
    ('00000000-0000-0000-0000-0000000000c3','u-3','3','VENCE EN 6','por_pagar','2026-11-02 09:00-06','2026-11-08'),
    ('00000000-0000-0000-0000-0000000000c4','u-4','4','YA VENCIDA','por_pagar','2026-10-29 09:00-06','2026-10-15'),
    ('00000000-0000-0000-0000-0000000000c5','u-5','5','PAGADA','pagada','2026-11-02 09:00-06','2026-11-03')`);
  await db.exec(`update facturas set tipo='egreso',vence_el='2026-11-03' where id='00000000-0000-0000-0000-0000000000fb';update facturas set vence_el='2026-11-07' where id='00000000-0000-0000-0000-0000000000fa';update facturas set revisada=true,revision_nota='ok' where id in ('00000000-0000-0000-0000-0000000000fa','00000000-0000-0000-0000-0000000000fb')`);
  await db.exec(`insert into ordenes_compra(id,folio,proveedor_id,sucursal_id,estado,entrega_esperada,confirmada_en) values
    ('00000000-0000-0000-0000-000000000051','OC-0051','00000000-0000-0000-0000-0000000000b1',null,'confirmada',null,'2026-10-20 10:00-06'),
    ('00000000-0000-0000-0000-000000000052','OC-0052','00000000-0000-0000-0000-0000000000b1','${S.z}','enviada','2026-10-01',null),
    ('00000000-0000-0000-0000-000000000053','OC-0053','00000000-0000-0000-0000-0000000000b1','${S.z}','confirmada','2026-10-30',null)`);
  for(const k of ['factura_sin_revisar','factura_por_vencer','orden_sin_recibir'])await regla(db,k);
  await como(db,U.admin);
  const resumen=Object.fromEntries((await db.query(`select * from public.resumen_reglas_tareas()`)).rows.map(r=>[r.clave,r.por_crear]));
  assert.deepEqual(resumen,{apertura_item_atrasado:0,dia_sin_ventas:0,factura_por_vencer:2,factura_sin_revisar:1,orden_sin_recibir:1});
  await generar(db);
  // Cargada hace 3 días no pasa de 3; la cancelada no cuenta. Vence en 5 sí y en 6 no; la vencida sí; pagadas y notas de crédito no.
  assert.deepEqual((await deRegla(db,'factura_sin_revisar')).map(x=>x.documento_texto),['Factura 4 · YA VENCIDA']);
  assert.deepEqual((await deRegla(db,'factura_por_vencer')).map(x=>x.documento_texto).sort(),['Factura A-1234 · HARINAS DEL BAJIO SA','Factura 4 · YA VENCIDA'].sort());
  // La de oficina, sin fecha esperada, cuenta desde que se confirmó y va al responsable de la regla. La enviada todavía es cotización.
  assert.deepEqual((await deRegla(db,'orden_sin_recibir')).map(x=>[x.documento_texto,x.asignado_a]),[['Orden OC-0051 · Harinas Bajío',U.admin]]);
  // Cambiar el umbral no cierra lo que sigue pendiente.
  await regla(db,'factura_por_vencer',{dias:0});
  assert.equal((await generar(db)).factura_por_vencer.cerradas,0);
  assert.equal((await deRegla(db,'factura_por_vencer')).filter(x=>x.estado==='por_hacer').length,2);
 }finally{await db.close();}
});

test('tareas automáticas: la orden va al gerente activo; sin gerente, al responsable; responsable inactivo no crea',async()=>{
 const db=await nueva();
 try{
  await db.exec(CASOS.orden_sin_recibir.preparar);
  await db.exec(`update perfiles set activo=false where id='${U.gerente}'`);
  await regla(db,'orden_sin_recibir');
  await generar(db);
  assert.deepEqual((await deRegla(db,'orden_sin_recibir')).map(x=>x.asignado_a),[U.admin]);
  await db.exec(`delete from tarea_historial;delete from tareas;update perfiles set activo=false where id='${U.admin}'`);
  assert.equal((await generar(db)).orden_sin_recibir.creadas,0);
 }finally{await db.close();}
});

test('tareas automáticas: solo un admin configura; solo la llave de servicio genera',async()=>{
 const db=await nueva();
 try{
  await como(db,U.gerente);
  await rechaza(db.query(`select public.actualizar_regla_tarea('dia_sin_ventas',true,$1,1,'alta')`,[U.admin]),/Solo un admin configura/);
  await rechaza(db.query(`select * from public.resumen_reglas_tareas()`),/Solo un admin configura/);
  await como(db,U.admin);
  await rechaza(db.query(`select public.actualizar_regla_tarea('dia_sin_ventas',true,null,1,'alta')`),/Elige al responsable/);
  await rechaza(db.query(`select public.actualizar_regla_tarea('dia_sin_ventas',true,$1,1,'alta')`,[U.gerente]),/debe ser un admin activo/);
  await rechaza(db.query(`select public.actualizar_regla_tarea('dia_sin_ventas',false,null,400,'alta')`),/de 0 a 365/);
  await rechaza(db.query(`select public.actualizar_regla_tarea('no_existe',false,null,1,'alta')`),/Regla no encontrada/);
  await db.query(`select public.actualizar_regla_tarea('dia_sin_ventas',true,$1,1,'baja')`,[U.admin]);
  assert.deepEqual((await db.query(`select activa,asignado_default,dias,prioridad::text,actualizada_por from tarea_reglas where clave='dia_sin_ventas'`)).rows,
   [{activa:true,asignado_default:U.admin,dias:1,prioridad:'baja',actualizada_por:U.admin}]);
  // La RLS: el admin ve las reglas; el corporativo y el gerente no. Nadie autenticado genera ni escribe directo.
  await db.exec('set role authenticated');
  try{
   await como(db,U.admin);assert.equal((await db.query(`select count(*)::int n from tarea_reglas`)).rows[0].n,5);
   await como(db,U.corp);assert.equal((await db.query(`select count(*)::int n from tarea_reglas`)).rows[0].n,0);
   await rechaza(db.query(`select * from public.generar_tareas_automaticas()`),/permission denied/);
   await rechaza(db.query(`update tarea_reglas set activa=true`),/permission denied/);
  }finally{await db.exec('reset role');}
 }finally{await db.close();}
});

test('tareas automáticas: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=await nueva();
 try{
  await db.exec(`${CASOS.factura_sin_revisar.preparar};${CASOS.dia_sin_ventas.preparar};${CASOS.orden_sin_recibir.preparar};
   update facturas set revisada=true,revision_nota='ok' where id='${FC}';update sucursales set dodois_unit_id=null where id='${S.t}'`);
  await assert.rejects(db.exec(load('supabase/pruebas/20261102200000_tareas_automaticas.sql')),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});
  // Todo se revirtió: ninguna regla quedó prendida ni hay tareas.
  assert.equal((await db.query(`select count(*)::int n from tareas`)).rows[0].n,0);
  assert.equal((await db.query(`select count(*)::int n from tarea_reglas where activa`)).rows[0].n,0);
 }finally{await db.close();}
});
