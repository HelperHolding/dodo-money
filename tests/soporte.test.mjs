import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {BASE,U,S,como} from './soporteBase.mjs';
const migracion=readFileSync(new URL('../supabase/migrations/20261123120000_soporte.sql',import.meta.url),'utf8').replace(/^﻿/,'');
export const nueva=async()=>{const db=new PGlite();await db.exec(BASE);await db.exec(migracion);return db;};
export const q=async(db,id,sql,params=[])=>{await como(db,id);return (await db.query(sql,params)).rows;};
export const crear=async(db,id,datos)=>Number((await q(db,id,`select public.crear_ticket($1::jsonb) n`,[JSON.stringify(datos)]))[0].n);
export const rechaza=(p,re)=>assert.rejects(p,e=>{assert.match(e.message,re);return true;});
const PROBLEMA={tipo:'problema',titulo:'No guarda la foto',descripcion:'Al guardar el gasto se queda cargando.',seccion:'Gastos (caja chica)',ruta_origen:'/caja-chica',bloquea:true};

test('soporte: alta de problema que bloquea → alta, sucursal, puesto, responsable Sebastián, leído y aviso',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.ana,PROBLEMA);
  assert.equal(n,1);
  const [t]=await q(db,U.ana,`select * from public.tickets_visibles()`);
  assert.equal(t.estado,'nuevo');assert.equal(t.prioridad,'alta');assert.equal(t.tipo,'problema');assert.equal(t.bloquea,true);
  assert.equal(t.sucursal,'Zapopan-1');assert.equal(t.rol_creador,'operacion');assert.equal(t.creador,'Ana (op Z)');
  assert.equal(t.responsable,U.seba);assert.equal(t.responsable_nombre,'Sebastián');assert.equal(t.ruta_origen,'/caja-chica');assert.equal(t.sin_leer,false);
  const avisos=(await db.query(`select evento,para,estado from public.soporte_avisos`)).rows;
  assert.deepEqual(avisos,[{evento:'nuevo',para:'scervera@dodopizza.mx',estado:'pendiente'}]);
  const [h]=(await db.query(`select campo,despues,usuario_id from public.soporte_historial`)).rows;
  assert.deepEqual(h,{campo:'creado',despues:'nuevo',usuario_id:U.ana});
 }finally{await db.close();}
});

test('soporte: prioridad inicial; mejora ignora bloquea; ruta inválida se descarta; marketing y corporativo reportan',async()=>{
 const db=await nueva();
 try{
  await crear(db,U.ana,{...PROBLEMA,bloquea:false});
  await crear(db,U.mkt,{tipo:'mejora',titulo:'Exportar contactos',descripcion:'Poder bajar la lista en Excel.',seccion:'Correos',bloquea:true,ruta_origen:'//evil.com'});
  await crear(db,U.corp,{tipo:'mejora',titulo:'Filtro por mes',descripcion:'Ver el P&L por mes directo.',seccion:'Finanzas'});
  const filas=await q(db,U.julio,`select numero,prioridad,bloquea,ruta_origen,sucursal from public.tickets_visibles() order by numero`);
  assert.deepEqual(filas.map(f=>[Number(f.numero),f.prioridad,f.bloquea,f.ruta_origen,f.sucursal]),[[1,'media',false,'/caja-chica','Zapopan-1'],[2,'baja',false,null,null],[3,'baja',false,null,null]]);
 }finally{await db.close();}
});

test('soporte: validaciones del alta',async()=>{
 const db=await nueva();
 try{
  await rechaza(crear(db,U.ana,{...PROBLEMA,tipo:'duda'}),/problema o una mejora/);
  await rechaza(crear(db,U.ana,{...PROBLEMA,titulo:' abc '}),/título debe tener de 5 a 150/);
  await rechaza(crear(db,U.ana,{...PROBLEMA,descripcion:'corta'}),/10 a 4000/);
  await rechaza(crear(db,U.ana,{...PROBLEMA,seccion:''}),/sección/);
  await rechaza(crear(db,U.ana,{...PROBLEMA,extra:1}),/Datos del ticket inválidos/);
  await rechaza(crear(db,U.ana,{...PROBLEMA,captura:`${U.luis}/00000000-0000-0000-0000-000000000001.jpg`}),/captura no es válida/);
  await rechaza(crear(db,U.ana,{...PROBLEMA,captura:`${U.ana}/../x.jpg`}),/captura no es válida/);
  await rechaza(crear(db,U.baja,PROBLEMA),/no está activo/);
  const n=await crear(db,U.ana,{...PROBLEMA,captura:`${U.ana}/00000000-0000-0000-0000-000000000001.jpg`});
  assert.equal((await q(db,U.ana,`select captura from public.tickets_visibles($1)`,[n]))[0].captura,`${U.ana}/00000000-0000-0000-0000-000000000001.jpg`);
 }finally{await db.close();}
});

test('soporte: cada quien ve solo lo suyo; admin ve todo (también por RLS)',async()=>{
 const db=await nueva();
 try{
  await crear(db,U.ana,PROBLEMA);await crear(db,U.luis,PROBLEMA);await crear(db,U.corp,{...PROBLEMA,titulo:'Corporativo reporta'});
  const nums=async id=>(await q(db,id,`select numero from public.tickets_visibles() order by numero`)).map(r=>Number(r.numero));
  assert.deepEqual(await nums(U.ana),[1]);assert.deepEqual(await nums(U.luis),[2]);assert.deepEqual(await nums(U.corp),[3]);
  assert.deepEqual(await nums(U.gerente),[]);assert.deepEqual(await nums(U.julio),[1,2,3]);assert.deepEqual(await nums(U.baja),[]);
  assert.deepEqual(await q(db,U.ana,`select numero from public.tickets_visibles(2)`),[]);
  await db.exec('set role authenticated');
  try{
   assert.equal((await q(db,U.ana,`select count(*)::int n from public.soporte_tickets`))[0].n,1);
   assert.equal((await q(db,U.julio,`select count(*)::int n from public.soporte_tickets`))[0].n,3);
   assert.equal((await q(db,U.ana,`select count(*)::int n from public.soporte_avisos`))[0].n,0);
   await rechaza(q(db,U.ana,`insert into public.soporte_tickets(tipo,prioridad,titulo,descripcion,seccion,creado_por,rol_creador) values('mejora','baja','Directo sí','Directo a la tabla','Otra',$1,'operacion')`,[U.ana]),/permission denied/);
  }finally{await db.exec('reset role');}
 }finally{await db.close();}
});

const cambiar=(db,id,n,rev,datos)=>q(db,id,`select public.cambiar_ticket($1,$2,$3::jsonb)`,[n,rev,JSON.stringify(datos)]);
const comentar=(db,id,n,txt)=>q(db,id,`select public.comentar_ticket($1,$2)`,[n,txt]);
const contar=async(db,id)=>{const [r]=await q(db,id,`select * from public.contar_soporte()`);return {pendientes:r.pendientes,urgente:r.urgente};};
const revision=async(db,n)=>(await db.query(`select revision from public.soporte_tickets where numero=$1`,[n])).rows[0].revision;

test('soporte: comentarios avisan a soporte o a quien reporta; leer limpia el contador',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.ana,PROBLEMA);
  assert.deepEqual(await contar(db,U.seba),{pendientes:1,urgente:true});
  assert.deepEqual(await contar(db,U.ana),{pendientes:0,urgente:false});
  await q(db,U.seba,`select public.marcar_ticket_leido($1)`,[n]);
  await comentar(db,U.seba,n,'¿Desde qué celular?');
  assert.deepEqual(await contar(db,U.ana),{pendientes:1,urgente:false});
  assert.equal((await q(db,U.ana,`select sin_leer from public.tickets_visibles($1)`,[n]))[0].sin_leer,true);
  await q(db,U.ana,`select public.marcar_ticket_leido($1)`,[n]);
  assert.deepEqual(await contar(db,U.ana),{pendientes:0,urgente:false});
  await comentar(db,U.ana,n,'Desde un Motorola');
  const avisos=(await db.query(`select evento from public.soporte_avisos order by creado_en`)).rows.map(r=>r.evento);
  assert.deepEqual(avisos,['nuevo','comentario']);
  assert.equal((await q(db,U.seba,`select sin_leer from public.tickets_visibles($1)`,[n]))[0].sin_leer,true);
  await rechaza(comentar(db,U.ana,n,'   '),/Escribe un comentario/);
  await rechaza(comentar(db,U.luis,n,'No es mío'),/Ticket no encontrado/);
  await rechaza(comentar(db,U.ana,n,'x'.repeat(4001)),/máximo 4000/);
 }finally{await db.close();}
});

test('soporte: solo admin cambia; transiciones, cierre con respuesta, reabrir y revisión',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.ana,PROBLEMA);
  await rechaza(cambiar(db,U.ana,n,1,{estado:'en_revision'}),/Solo soporte puede cambiar/);
  await rechaza(cambiar(db,U.corp,n,1,{estado:'en_revision'}),/Ticket no encontrado/);
  await rechaza(cambiar(db,U.seba,n,1,{estado:'volando'}),/Estado inválido/);
  await rechaza(cambiar(db,U.seba,n,1,{estado:'resuelto'}),/escribe la respuesta/);
  await rechaza(cambiar(db,U.seba,n,1,{prioridad:'urgente'}),/Prioridad inválida/);
  await rechaza(cambiar(db,U.seba,n,1,{responsable:U.ana}),/no puede ser responsable/);
  await rechaza(cambiar(db,U.seba,n,1,{}),/No hay cambios/);
  await rechaza(cambiar(db,U.seba,n,1,{otra:'x'}),/Datos del ticket inválidos/);
  await cambiar(db,U.seba,n,1,{estado:'en_progreso',prioridad:'media',responsable:U.julio});
  await rechaza(cambiar(db,U.julio,n,1,{estado:'en_revision'}),/cambió mientras lo veías/);
  await rechaza(cambiar(db,U.seba,n,2,{estado:'nuevo'}),/No puedes hacer ese cambio de estado/);
  await cambiar(db,U.seba,n,2,{estado:'resuelto',comentario:'Ya quedó, actualiza la app.'});
  let [t]=await db.query(`select estado,cerrado_en,responsable from public.soporte_tickets where numero=$1`,[n]).then(r=>r.rows);
  assert.equal(t.estado,'resuelto');assert.ok(t.cerrado_en);assert.equal(t.responsable,U.julio);
  assert.deepEqual(await contar(db,U.ana),{pendientes:1,urgente:false});
  await comentar(db,U.ana,n,'Sigue pasando');
  assert.equal((await db.query(`select estado from public.soporte_tickets where numero=$1`,[n])).rows[0].estado,'resuelto');
  await cambiar(db,U.seba,n,await revision(db,n),{estado:'en_progreso'});
  [t]=(await db.query(`select estado,cerrado_en from public.soporte_tickets where numero=$1`,[n])).rows;
  assert.equal(t.estado,'en_progreso');assert.equal(t.cerrado_en,null);
  await cambiar(db,U.seba,n,await revision(db,n),{estado:'descartado',comentario:'Es del celular, no del sistema.',responsable:''});
  await rechaza(comentar(db,U.ana,n,'¿Por qué?'),/descartado/);
  await comentar(db,U.seba,n,'Escríbeme si vuelve a pasar.');
  await cambiar(db,U.seba,n,await revision(db,n),{estado:'en_revision'});
  const campos=(await db.query(`select campo,antes,despues from public.soporte_historial order by id`)).rows.map(r=>`${r.campo}:${r.antes??''}>${r.despues??''}`);
  assert.deepEqual(campos,['creado:>nuevo',`estado:nuevo>en_progreso`,'prioridad:alta>media',`responsable:${U.seba}>${U.julio}`,'estado:en_progreso>resuelto',
   'estado:resuelto>en_progreso','estado:en_progreso>descartado',`responsable:${U.julio}>`,'estado:descartado>en_revision']);
 }finally{await db.close();}
});

test('soporte: hilo con nombres, etiqueta de soporte y responsables por nombre; personas_soporte',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.ana,PROBLEMA);
  await cambiar(db,U.seba,n,1,{responsable:U.julio,comentario:'Lo revisa Julio.'});
  await comentar(db,U.ana,n,'Gracias');
  const hilo=await q(db,U.ana,`select tipo,autor,es_soporte,texto,campo,antes,despues from public.hilo_ticket($1)`,[n]);
  assert.deepEqual(hilo.map(h=>[h.tipo,h.autor,h.es_soporte,h.texto??h.campo,h.antes,h.despues]),[
   ['cambio','Ana (op Z)',null,'creado',null,'nuevo'],
   ['cambio','Sebastián',null,'responsable','Sebastián','Julio'],
   ['comentario','Sebastián',true,'Lo revisa Julio.',null,null],
   ['comentario','Ana (op Z)',false,'Gracias',null,null]]);
  assert.deepEqual(await q(db,U.luis,`select * from public.hilo_ticket($1)`,[n]),[]);
  assert.deepEqual((await q(db,U.julio,`select nombre from public.personas_soporte()`)).map(r=>r.nombre),['Julio','Sebastián']);
  assert.deepEqual(await q(db,U.ana,`select * from public.personas_soporte()`),[]);
 }finally{await db.close();}
});
