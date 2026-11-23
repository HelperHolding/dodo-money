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

const tomar=(db,lote)=>db.query(`select * from public.soporte_tomar_avisos($1)`,[lote]).then(r=>r.rows);
const resultado=(db,id,ok,err)=>db.query(`select public.soporte_resultado_aviso($1,$2,$3)`,[id,ok,err]);
const estadoAviso=async(db,id)=>(await db.query(`select estado,intentos,ultimo_error from public.soporte_avisos where id=$1`,[id])).rows[0];

test('soporte: n8n toma avisos con datos del ticket, reporta, reintenta y marca fallido',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.ana,PROBLEMA);
  await comentar(db,U.ana,n,'<b>Urgente</b>');
  const lote=await tomar(db,10);
  assert.equal(lote.length,2);
  assert.deepEqual({...lote[0],aviso_id:undefined,numero:Number(lote[0].numero)},{aviso_id:undefined,para:'scervera@dodopizza.mx',evento:'nuevo',numero:1,tipo:'problema',titulo:'No guarda la foto',
   descripcion:'Al guardar el gasto se queda cargando.',seccion:'Gastos (caja chica)',prioridad:'alta',sucursal:'Zapopan-1',creador:'Ana (op Z)',rol_creador:'operacion',con_captura:false,comentario:null,autor_comentario:null});
  assert.equal(lote[1].comentario,'<b>Urgente</b>');assert.equal(lote[1].autor_comentario,'Ana (op Z)');
  assert.equal((await tomar(db,10)).length,0,'los que están enviando no se vuelven a tomar');
  await resultado(db,lote[0].aviso_id,true,null);
  assert.equal((await estadoAviso(db,lote[0].aviso_id)).estado,'enviado');
  await rechaza(resultado(db,lote[0].aviso_id,true,null),/no está en envío/);
  const id=lote[1].aviso_id;
  await resultado(db,id,false,'535 auth');
  assert.deepEqual(await estadoAviso(db,id),{estado:'pendiente',intentos:1,ultimo_error:'535 auth'});
  for(let i=2;i<=5;i++){const [a]=await tomar(db,1);assert.equal(a.aviso_id,id);await resultado(db,id,false,`fallo ${i}`);}
  assert.deepEqual(await estadoAviso(db,id),{estado:'fallido',intentos:5,ultimo_error:'fallo 5'});
  assert.equal((await tomar(db,10)).length,0);
 }finally{await db.close();}
});

test('soporte: un aviso tomado hace más de 10 minutos vuelve a la cola; lote entre 1 y 10',async()=>{
 const db=await nueva();
 try{
  for(let i=0;i<12;i++) await crear(db,U.ana,{...PROBLEMA,titulo:`Problema número ${i}`});
  assert.equal((await tomar(db,50)).length,10);
  assert.equal((await tomar(db,0)).length,1);
  await db.query(`update public.soporte_avisos set tomado_en=now()-interval '11 minutes' where estado='enviando'`);
  assert.equal((await tomar(db,10)).length,10);
  assert.equal((await db.query(`select count(*)::int n from public.soporte_avisos where ultimo_error='n8n no reportó el resultado.'`)).rows[0].n,11);
 }finally{await db.close();}
});

test('soporte: ajustes solo admin; correos normalizados; apagar avisos deja de encolar',async()=>{
 const db=await nueva();
 try{
  const guardar=(id,resp,correos,nuevos,coment)=>q(db,id,`select public.guardar_ajustes_soporte($1::uuid,$2::text[],$3::boolean,$4::boolean)`,[resp,correos,nuevos,coment]);
  await rechaza(guardar(U.ana,null,['x@y.mx'],true,true),/Solo soporte/);
  await rechaza(guardar(U.seba,null,['no-es-correo'],true,true),/no es válido/);
  await rechaza(guardar(U.seba,null,[],true,false),/al menos un correo/);
  await rechaza(guardar(U.seba,U.ana,['x@y.mx'],true,true),/no puede ser responsable/);
  await rechaza(guardar(U.seba,null,Array.from({length:11},(_,i)=>`p${i}@y.mx`),true,true),/Máximo 10/);
  await guardar(U.seba,U.julio,[' SCervera@DodoPizza.mx ','julio@dodopizza.mx','scervera@dodopizza.mx',''],true,false);
  const [a]=(await db.query(`select responsable_default,correos,avisar_nuevos,avisar_comentarios from public.soporte_ajustes`)).rows;
  assert.deepEqual(a,{responsable_default:U.julio,correos:['julio@dodopizza.mx','scervera@dodopizza.mx'],avisar_nuevos:true,avisar_comentarios:false});
  const n=await crear(db,U.ana,PROBLEMA);
  await comentar(db,U.ana,n,'Más datos');
  assert.deepEqual((await db.query(`select evento,para from public.soporte_avisos order by para`)).rows,[{evento:'nuevo',para:'julio@dodopizza.mx'},{evento:'nuevo',para:'scervera@dodopizza.mx'}]);
  assert.equal((await q(db,U.ana,`select responsable from public.tickets_visibles($1)`,[n]))[0].responsable,U.julio);
  await guardar(U.seba,null,[],false,false);
  await crear(db,U.ana,PROBLEMA);
  assert.equal((await db.query(`select count(*)::int n from public.soporte_avisos`)).rows[0].n,2);
 }finally{await db.close();}
});

test('soporte: permisos de funciones, tablas y bucket de capturas',async()=>{
 const db=await nueva();
 try{
  const puede=async(rol,fn)=>(await db.query(`select has_function_privilege($1,$2,'execute') p`,[rol,fn])).rows[0].p;
  for(const fn of ['public.soporte_tomar_avisos(integer)','public.soporte_resultado_aviso(uuid,boolean,text)']){
   assert.equal(await puede('authenticated',fn),false,fn);assert.equal(await puede('anon',fn),false,fn);assert.equal(await puede('service_role',fn),true,fn);
  }
  for(const fn of ['public.encolar_aviso_soporte(uuid,text,bigint)','public.ticket_para_escribir(bigint,integer)','public.marcar_leido_soporte(uuid)'])
   assert.equal(await puede('authenticated',fn),false,fn);
  for(const fn of ['public.crear_ticket(jsonb)','public.comentar_ticket(bigint,text)','public.cambiar_ticket(bigint,integer,jsonb)','public.guardar_ajustes_soporte(uuid,text[],boolean,boolean)'])
   {assert.equal(await puede('authenticated',fn),true,fn);assert.equal(await puede('anon',fn),false,fn);}
  for(const t of ['soporte_tickets','soporte_comentarios','soporte_historial','soporte_lecturas','soporte_ajustes','soporte_avisos'])
   for(const p of ['insert','update','delete']) assert.equal((await db.query(`select has_table_privilege('authenticated',$1,$2) p`,[`public.${t}`,p])).rows[0].p,false,`${p} ${t}`);
  const [b]=(await db.query(`select public,file_size_limit,allowed_mime_types from storage.buckets where id='soporte'`)).rows;
  assert.deepEqual({...b,file_size_limit:Number(b.file_size_limit)},{public:false,file_size_limit:4194304,allowed_mime_types:['image/jpeg','image/png','image/webp','image/heic','image/heif']});
  // Políticas: Ana sube a su carpeta, no a la de Luis; borra una captura suelta, no la ligada a un ticket; admin lee todas.
  const ruta=`${U.ana}/00000000-0000-0000-0000-000000000001.jpg`,suelta=`${U.ana}/00000000-0000-0000-0000-000000000002.jpg`;
  await db.exec('grant select,insert,delete on storage.objects to authenticated');
  await db.exec('set role authenticated');
  try{
   await q(db,U.ana,`insert into storage.objects(bucket_id,name) values('soporte',$1),('soporte',$2)`,[ruta,suelta]);
   await rechaza(q(db,U.ana,`insert into storage.objects(bucket_id,name) values('soporte',$1)`,[`${U.luis}/00000000-0000-0000-0000-000000000003.jpg`]),/row-level security/);
   await crear(db,U.ana,{...PROBLEMA,captura:ruta});
   await q(db,U.ana,`delete from storage.objects where bucket_id='soporte'`);
   assert.deepEqual((await q(db,U.ana,`select name from storage.objects`)).map(r=>r.name),[ruta]);
   assert.deepEqual((await q(db,U.luis,`select name from storage.objects`)),[]);
   assert.deepEqual((await q(db,U.julio,`select name from storage.objects`)).map(r=>r.name),[ruta]);
  }finally{await db.exec('reset role');}
 }finally{await db.close();}
});

test('soporte: el script de supabase/pruebas termina en PRUEBAS OK',async()=>{
 const db=await nueva();
 try{
  const pruebas=readFileSync(new URL('../supabase/pruebas/20261123120000_soporte.sql',import.meta.url),'utf8');
  await rechaza(db.exec(pruebas),/PRUEBAS OK/);
 }finally{await db.close();}
});
