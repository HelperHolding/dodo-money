import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261102120000_tareas.sql');
import {BASE,U,S,como} from './tareasBase.mjs';
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

const mover=async(db,id,n,estado,comentario='')=>{await como(db,id);
 const rev=(await db.query('select revision from public.tareas where numero=$1',[n])).rows[0].revision;
 await db.query('select public.mover_tarea($1,$2,$3,$4)',[n,rev,estado,comentario]);};
const estado=async(db,n)=>(await db.query('select estado::text e,cerrada_en is not null cerrada from public.tareas where numero=$1',[n])).rows[0];

test('tareas: el asignado lleva a revisión; quien creó aprueba o regresa',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Subir remisión',asignado_a:U.ana,sucursal_id:S.z});
  await mover(db,U.ana,n,'en_curso');
  await rechaza(mover(db,U.ana,n,'hecho'),/No puedes hacer ese cambio de estado/);
  await mover(db,U.ana,n,'en_revision');
  await rechaza(mover(db,U.ana,n,'en_curso','me equivoqué'),/No puedes hacer ese cambio de estado/);
  await rechaza(mover(db,U.admin,n,'en_curso'),/Para regresar la tarea escribe qué falta/);
  await mover(db,U.admin,n,'en_curso','Falta la firma del proveedor');
  await mover(db,U.ana,n,'en_revision');
  await mover(db,U.admin,n,'hecho');
  assert.deepEqual(await estado(db,n),{e:'hecho',cerrada:true});
  await rechaza(mover(db,U.admin,n,'en_curso','reabrir'),/No puedes hacer ese cambio de estado/);
 }finally{await db.close();}
});

test('tareas: el gerente cierra lo de su sucursal; el encargado lo que creó; corporativo nada',async()=>{
 const db=await nueva();
 try{
  const a=await crear(db,U.admin,{titulo:'De oficina para Ana',asignado_a:U.ana,sucursal_id:S.z});
  await mover(db,U.ana,a,'en_revision');
  await mover(db,U.gerente,a,'hecho');
  const b=await crear(db,U.encargado,{titulo:'Del encargado',asignado_a:U.ana});
  await mover(db,U.ana,b,'en_revision');
  await mover(db,U.encargado,b,'hecho');
  const c=await crear(db,U.gerente,{titulo:'Del gerente para Ana',asignado_a:U.ana});
  await mover(db,U.ana,c,'en_revision');
  await rechaza(mover(db,U.encargado,c,'hecho'),/No puedes hacer ese cambio de estado/);
  await rechaza(mover(db,U.corp,c,'hecho'),/Corporativo solo puede consultar/);
  await rechaza(mover(db,U.luis,c,'hecho'),/Tarea no encontrada/);
 }finally{await db.close();}
});

test('tareas: el gerente no cierra lo que le asignaron otros; sí lo que él creó para sí mismo',async()=>{
 const db=await nueva();
 try{
  const a=await crear(db,U.admin,{titulo:'De oficina para el gerente',asignado_a:U.gerente,sucursal_id:S.z});
  await mover(db,U.gerente,a,'en_revision');
  await rechaza(mover(db,U.gerente,a,'hecho'),/No puedes hacer ese cambio de estado/);
  await rechaza(mover(db,U.gerente,a,'en_curso','falta algo'),/No puedes hacer ese cambio de estado/);
  await rechaza(mover(db,U.gerente,a,'cancelada','ya no aplica'),/No puedes hacer ese cambio de estado/);
  await mover(db,U.admin,a,'hecho');
  assert.deepEqual(await estado(db,a),{e:'hecho',cerrada:true});
  const b=await crear(db,U.gerente,{titulo:'Propia del gerente',asignado_a:U.gerente});
  await mover(db,U.gerente,b,'en_revision');
  await mover(db,U.gerente,b,'hecho');
  assert.deepEqual(await estado(db,b),{e:'hecho',cerrada:true});
 }finally{await db.close();}
});

test('tareas: cancelar exige motivo y lo guarda',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Duplicada',asignado_a:U.ana,sucursal_id:S.z});
  await rechaza(mover(db,U.admin,n,'cancelada','x'),/Escribe el motivo de la cancelación/);
  await rechaza(mover(db,U.ana,n,'cancelada','No me toca a mí'),/No puedes hacer ese cambio de estado/);
  await mover(db,U.admin,n,'cancelada','Duplicada de DODO-1');
  assert.deepEqual(await estado(db,n),{e:'cancelada',cerrada:true});
  assert.equal((await db.query('select motivo_cierre from public.tareas where numero=$1',[n])).rows[0].motivo_cierre,'Duplicada de DODO-1');
 }finally{await db.close();}
});

test('tareas: revisión vieja se rechaza sin pisar el cambio',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Concurrente',asignado_a:U.ana,sucursal_id:S.z});
  await como(db,U.ana);
  await db.query('select public.mover_tarea($1,1,$2,$3)',[n,'en_curso','']);
  await como(db,U.admin);
  await rechaza(db.query('select public.mover_tarea($1,1,$2,$3)',[n,'cancelada','Ya no aplica']),/La tarea cambió mientras la veías/);
  assert.equal((await estado(db,n)).e,'en_curso');
 }finally{await db.close();}
});

test('tareas: usuario dado de baja no mueve; sus tareas quedan marcadas',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Para Ana',asignado_a:U.ana,sucursal_id:S.z});
  await db.exec(`update perfiles set activo=false where id='${U.ana}'`);
  await rechaza(mover(db,U.ana,n,'en_curso'),/Tu usuario no está activo/);
  assert.equal((await visibles(db,U.admin))[0].asignado_activo,false);
 }finally{await db.close();}
});

test('tareas: editar y reasignar; el asignado no edita',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.gerente,{titulo:'Revisar cámara',asignado_a:U.ana,prioridad:'baja'});
  const editar=async(id,datos)=>{await como(db,id);const rev=(await db.query('select revision from public.tareas where numero=$1',[n])).rows[0].revision;
   await db.query('select public.actualizar_tarea($1,$2,$3::jsonb)',[n,rev,JSON.stringify(datos)]);};
  await rechaza(editar(U.ana,{titulo:'Otra',asignado_a:U.ana}),/Solo quien creó la tarea/);
  await rechaza(editar(U.gerente,{titulo:'Revisar cámara',asignado_a:U.luis}),/Esa persona no puede recibir esta tarea/);
  await editar(U.gerente,{titulo:'Revisar cámara fría',descripcion:'Temperatura',prioridad:'alta',vence:'2026-11-04',asignado_a:U.encargado});
  const [t]=await visibles(db,U.gerente);
  assert.equal(t.titulo,'Revisar cámara fría');assert.equal(t.asignado,'Encargado Z');
  assert.deepEqual((await visibles(db,U.ana)),[]);
 }finally{await db.close();}
});

test('tareas: comentarios e hilo con historial en orden',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Con hilo',asignado_a:U.ana,sucursal_id:S.z});
  await como(db,U.ana);await db.query('select public.comentar_tarea($1,$2)',[n,'Ya la estoy revisando']);
  await rechaza((async()=>{await como(db,U.corp);await db.query('select public.comentar_tarea($1,$2)',[n,'hola']);})(),/Corporativo solo puede consultar/);
  await rechaza((async()=>{await como(db,U.luis);await db.query('select public.comentar_tarea($1,$2)',[n,'hola']);})(),/Tarea no encontrada/);
  await rechaza((async()=>{await como(db,U.ana);await db.query('select public.comentar_tarea($1,$2)',[n,'   ']);})(),/Escribe un comentario/);
  await mover(db,U.ana,n,'en_revision');
  await como(db,U.admin);
  const hilo=(await db.query('select tipo,autor,texto,campo,antes,despues from public.hilo_tarea($1)',[n])).rows;
  assert.deepEqual(hilo.map(h=>[h.tipo,h.autor,h.campo??h.texto]),[['cambio','Julio','creada'],['comentario','Ana (op Z)','Ya la estoy revisando'],['cambio','Ana (op Z)','estado']]);
  assert.deepEqual([hilo[2].antes,hilo[2].despues],['por_hacer','en_revision']);
  await como(db,U.luis);
  assert.deepEqual((await db.query('select * from public.hilo_tarea($1)',[n])).rows,[]);
 }finally{await db.close();}
});

test('tareas: el historial de reasignación muestra nombres',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Reasignar',asignado_a:U.ana,sucursal_id:S.z});
  await como(db,U.admin);
  await db.query('select public.actualizar_tarea($1,1,$2::jsonb)',[n,JSON.stringify({titulo:'Reasignar',asignado_a:U.gerente})]);
  const h=(await db.query(`select antes,despues from public.hilo_tarea($1) where campo='asignado_a'`,[n])).rows[0];
  assert.deepEqual(h,{antes:'Ana (op Z)',despues:'Gerente Z'});
 }finally{await db.close();}
});

test('tareas: al regresar, el cambio de estado va justo antes de su comentario',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Regresar',asignado_a:U.ana,sucursal_id:S.z});
  await mover(db,U.ana,n,'en_revision');
  await mover(db,U.admin,n,'en_curso','Falta la firma del proveedor');
  await como(db,U.admin);
  const hilo=(await db.query('select tipo,texto,campo,antes,despues from public.hilo_tarea($1)',[n])).rows;
  const i=hilo.findIndex(h=>h.tipo==='comentario');
  assert.equal(hilo[i].texto,'Falta la firma del proveedor');
  assert.deepEqual([hilo[i-1].tipo,hilo[i-1].campo,hilo[i-1].antes,hilo[i-1].despues],['cambio','estado','en_revision','en_curso']);
  assert.equal(i,hilo.length-1);
 }finally{await db.close();}
});

test('tareas: mover valida estado, revisión y largo del motivo con mensajes en español',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Validar',asignado_a:U.ana,sucursal_id:S.z});
  await como(db,U.admin);
  await rechaza(db.query('select public.mover_tarea($1,1,null,$2)',[n,'']),/No puedes hacer ese cambio de estado/);
  await rechaza(db.query('select public.mover_tarea($1,1,$2,$3)',[n,'inventado','']),/No puedes hacer ese cambio de estado/);
  await rechaza(db.query('select public.mover_tarea($1,null,$2,$3)',[n,'en_curso','']),/La tarea cambió mientras la veías/);
  await rechaza(db.query(`select public.actualizar_tarea($1,null,$2::jsonb)`,[n,JSON.stringify({titulo:'Validar',asignado_a:U.ana})]),/La tarea cambió mientras la veías/);
  await rechaza(db.query('select public.mover_tarea($1,1,$2,$3)',[n,'cancelada','x'.repeat(1001)]),/El motivo de cancelación es demasiado largo/);
  assert.equal((await estado(db,n)).e,'por_hacer');
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
