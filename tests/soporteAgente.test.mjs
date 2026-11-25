import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {BASE,U,como} from './soporteBase.mjs';
const leer=f=>readFileSync(new URL('../supabase/'+f,import.meta.url),'utf8').replace(/^﻿/,'');
const m1=leer('migrations/20261123120000_soporte.sql'),m2=leer('migrations/20261124130000_soporte_agente.sql');
const nueva=async({activo=true}={})=>{const db=new PGlite();await db.exec(BASE);await db.exec(m1);await db.exec(m2);
 if(activo)await db.exec(`update public.soporte_ajustes set agente_activo=true where id`);return db;};
const q=async(db,id,sql,p=[])=>{await como(db,id);return (await db.query(sql,p)).rows;};
const servicio=async(db,sql,p=[])=>{await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({role:'service_role'})]);return (await db.query(sql,p)).rows;};
const rechaza=(p,re)=>assert.rejects(p,e=>{assert.match(e.message,re);return true;});
const PROB={tipo:'problema',titulo:'No cuadra el corte',descripcion:'El corte de ayer sale con diferencia.',seccion:'Efectivo'};
const MEJ={tipo:'mejora',titulo:'Exportar a Excel',descripcion:'Poder bajar los cortes en Excel.',seccion:'Efectivo'};
const crear=async(db,id,d)=>Number((await q(db,id,`select public.crear_ticket($1::jsonb) n`,[JSON.stringify(d)]))[0].n);
const idDe=async(db,n)=>(await db.query(`select id from public.soporte_tickets where numero=$1`,[n])).rows[0].id;
const cerrar=(db,tid,d,pub,nota,pr=null)=>servicio(db,`select public.agente_cerrar_ticket($1,$2,$3,$4,$5,'modelo-x',100,20) r`,[tid,d,pub,nota,pr]).then(r=>r[0].r);
const avisos=db=>db.query(`select evento,para from public.soporte_avisos order by creado_en,evento`).then(r=>r.rows);
const ticket=db=>n=>db.query(`select estado::text,agente_estado,responsable,prioridad::text,cerrado_en is not null cerrado,agente_modelo,agente_tokens_entrada e,agente_tokens_salida s from public.soporte_tickets where numero=$1`,[n]).then(r=>r.rows[0]);

test('agente apagado: el alta encola «nuevo» y no deja pendiente',async()=>{
 const db=await nueva({activo:false});
 try{const n=await crear(db,U.ana,PROB);assert.equal((await ticket(db)(n)).agente_estado,null);assert.deepEqual(await avisos(db),[{evento:'nuevo',para:'scervera@dodopizza.mx'}]);}
 finally{await db.close();}
});

test('agente activo: pendiente sin aviso; resuelto cierra, responde y no avisa',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.ana,PROB);
  assert.equal((await ticket(db)(n)).agente_estado,'pendiente');assert.deepEqual(await avisos(db),[]);
  assert.equal((await q(db,U.ana,`select agente_estado from public.tickets_visibles($1)`,[n]))[0].agente_estado,'pendiente');
  assert.equal(await cerrar(db,await idDe(db,n),'resuelto','Revisa el arqueo de la tarde.','Fuente: manual de cortes'),'resuelto');
  const t=await ticket(db)(n);
  assert.deepEqual({e:t.estado,a:t.agente_estado,c:t.cerrado,m:t.agente_modelo,te:t.e,ts:t.s},{e:'resuelto',a:'resuelto',c:true,m:'modelo-x',te:100,ts:20});
  assert.deepEqual(await avisos(db),[]);
  const hilo=await q(db,U.ana,`select tipo,autor,texto,es_agente,interna from public.hilo_ticket($1) where tipo='comentario'`,[n]);
  assert.deepEqual(hilo,[{tipo:'comentario',autor:'Agente DODO',texto:'Revisa el arqueo de la tarde.',es_agente:true,interna:false}]);
  assert.equal((await q(db,U.seba,`select count(*)::int n from public.hilo_ticket($1) where interna`,[n]))[0].n,1);
  assert.equal((await q(db,U.ana,`select sin_leer from public.tickets_visibles($1)`,[n]))[0].sin_leer,true);
 }finally{await db.close();}
});

test('escalado y mejora: en revisión, responsable, prioridad sugerida y aviso «escalado» con la nota',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.ana,PROB),m=await crear(db,U.ana,MEJ);
  assert.equal(await cerrar(db,await idDe(db,n),'escalado','x','Diferencia de $200 en el arqueo final.','alta'),'escalado');
  assert.equal(await cerrar(db,await idDe(db,m),'resuelto','x','Resumen de la idea','baja'),'mejora','una mejora nunca se resuelve');
  const t=await ticket(db)(n);
  assert.deepEqual({e:t.estado,a:t.agente_estado,r:t.responsable,p:t.prioridad},{e:'en_revision',a:'escalado',r:U.seba,p:'alta'});
  assert.equal((await ticket(db)(m)).agente_estado,'mejora');
  assert.deepEqual((await avisos(db)).map(a=>a.evento),['escalado','escalado']);
  const tomados=await servicio(db,`select evento,numero,comentario,autor_comentario from public.soporte_tomar_avisos(10) order by numero`);
  assert.deepEqual(tomados.map(x=>[x.evento,Number(x.numero),x.comentario,x.autor_comentario]),[['escalado',n,'Diferencia de $200 en el arqueo final.','Agente DODO'],['escalado',m,'Resumen de la idea','Agente DODO']]);
  assert.equal((await q(db,U.ana,`select count(*)::int n from public.hilo_ticket($1) where interna`,[n]))[0].n,0,'quien reporta no ve la nota');
  assert.ok((await q(db,U.seba,`select * from public.contar_soporte()`))[0].pendientes>=1);
 }finally{await db.close();}
});

test('problema que el modelo llama mejora se escala; fallido avisa «escalado»; segunda llamada se ignora',async()=>{
 const db=await nueva();
 try{
  const a=await crear(db,U.ana,PROB),b=await crear(db,U.ana,PROB);
  assert.equal(await cerrar(db,await idDe(db,a),'mejora','x','n'),'escalado');
  assert.equal(await cerrar(db,await idDe(db,b),'fallido',null,'timeout'),'fallido');
  assert.equal(await cerrar(db,await idDe(db,b),'resuelto','otra','n'),'ignorado');
  const tb=await ticket(db)(b);assert.deepEqual([tb.estado,tb.agente_estado],['nuevo','fallido']);
  assert.deepEqual((await avisos(db)).map(x=>x.evento).sort(),['escalado','escalado']);
  assert.equal((await db.query(`select count(*)::int n from public.soporte_comentarios c join public.soporte_tickets t on t.id=c.ticket_id where t.numero=$1`,[b])).rows[0].n,1);
  assert.equal(await cerrar(db,await idDe(db,a),'otro','x','n'),'ignorado','ya no está pendiente: se ignora antes de validar');
 }finally{await db.close();}
});

test('fallido con avisar_nuevos apagado: el aviso «escalado» sí se encola, con la nota',async()=>{
 const db=await nueva();
 try{
  await db.query(`update public.soporte_ajustes set avisar_nuevos=false,correos=array['scervera@dodopizza.mx'] where id`);
  const n=await crear(db,U.ana,PROB);
  assert.equal(await cerrar(db,await idDe(db,n),'fallido',null,'timeout'),'fallido');
  const r=await servicio(db,`select evento,comentario from public.soporte_tomar_avisos(10)`);
  assert.equal(r.length,1);assert.equal(r[0].evento,'escalado');assert.match(r[0].comentario,/no pudo atender/);
 }finally{await db.close();}
});

test('validaciones de agente_cerrar_ticket',async()=>{
 const db=await nueva();
 try{
  const tid=await idDe(db,await crear(db,U.ana,PROB));
  await rechaza(cerrar(db,tid,'otro','x','n'),/Desenlace inválido/);
  await rechaza(cerrar(db,tid,'resuelto','','n'),/respuesta pública/);
  await rechaza(cerrar(db,tid,'escalado','x','n','urgente'),/Prioridad inválida/);
  await rechaza(cerrar(db,'00000000-0000-0000-0000-000000000999','resuelto','x','n'),/Ticket no encontrado/);
 }finally{await db.close();}
});

test('red de seguridad: pendiente de más de 5 minutos → fallido, nota interna y aviso «escalado»',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.ana,PROB),reciente=await crear(db,U.ana,PROB);
  await db.query(`update public.soporte_tickets set creado_en=now()-interval '6 minutes' where numero=$1`,[n]);
  const tomados=await servicio(db,`select evento,numero,comentario from public.soporte_tomar_avisos(10)`);
  assert.deepEqual(tomados.map(x=>[x.evento,Number(x.numero),x.comentario]),[['escalado',n,'El agente no terminó a tiempo; el ticket se atiende como siempre.']]);
  assert.equal((await ticket(db)(n)).agente_estado,'fallido');assert.equal((await ticket(db)(reciente)).agente_estado,'pendiente');
  assert.equal((await q(db,U.seba,`select count(*)::int n from public.hilo_ticket($1) where interna and es_agente`,[n]))[0].n,1);
 }finally{await db.close();}
});

test('reapertura: quien reporta comenta en un resuelto por el agente → en revisión con soporte',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.ana,PROB);await cerrar(db,await idDe(db,n),'resuelto','Respuesta','');
  await q(db,U.ana,`select public.comentar_ticket($1,'No me sirvió')`,[n]);
  const t=await ticket(db)(n);assert.deepEqual([t.estado,t.agente_estado,t.responsable,t.cerrado],['en_revision','reabierto',U.seba,false]);
  assert.deepEqual((await avisos(db)).map(x=>x.evento),['comentario']);
  // Un resuelto por soporte (no por el agente) no se reabre con un comentario.
  const k=await crear(db,U.ana,PROB);await cerrar(db,await idDe(db,k),'escalado','x','n');
  const rev=(await db.query(`select revision from public.soporte_tickets where numero=$1`,[k])).rows[0].revision;
  await q(db,U.seba,`select public.cambiar_ticket($1,$2,'{"estado":"resuelto","comentario":"Listo, corregido."}'::jsonb)`,[k,rev]);
  await q(db,U.ana,`select public.comentar_ticket($1,'Gracias')`,[k]);
  assert.equal((await ticket(db)(k)).estado,'resuelto');
 }finally{await db.close();}
});

test('ticket tocado por soporte mientras estaba pendiente: el agente solo deja una nota interna',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.ana,PROB),k=await crear(db,U.ana,PROB);
  const rev=async x=>(await db.query(`select revision from public.soporte_tickets where numero=$1`,[x])).rows[0].revision;
  await q(db,U.seba,`select public.cambiar_ticket($1,$2,'{"estado":"en_progreso"}'::jsonb)`,[n,await rev(n)]);
  const antes=(await db.query(`select count(*)::int c from public.soporte_avisos`)).rows[0].c;
  assert.equal(await cerrar(db,await idDe(db,n),'resuelto','Prueba esto.','Diagnóstico'),'resuelto');
  const t=await ticket(db)(n);assert.deepEqual([t.estado,t.agente_estado,t.cerrado],['en_progreso','resuelto',false]);
  assert.equal((await q(db,U.ana,`select count(*)::int c from public.hilo_ticket($1) where tipo='comentario'`,[n]))[0].c,0,'quien reporta no ve comentario del agente');
  const notas=await q(db,U.seba,`select texto from public.hilo_ticket($1) where interna and es_agente`,[n]);
  assert.equal(notas.length,1);assert.match(notas[0].texto,/Respuesta propuesta: Prueba esto./);
  assert.equal((await db.query(`select count(*)::int c from public.soporte_avisos`)).rows[0].c,antes);
  await q(db,U.seba,`select public.cambiar_ticket($1,$2,'{"prioridad":"baja"}'::jsonb)`,[k,await rev(k)]);
  assert.equal(await cerrar(db,await idDe(db,k),'escalado','x','n','alta'),'escalado');
  const tk=await ticket(db)(k);assert.deepEqual([tk.prioridad,tk.agente_estado],['baja','escalado']);
  assert.equal((await db.query(`select count(*)::int c from public.soporte_avisos`)).rows[0].c,antes);
 }finally{await db.close();}
});

test('RLS: quien reporta no lee notas internas directo de la tabla',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.ana,PROB);await cerrar(db,await idDe(db,n),'escalado','x','Secreto interno');
  await db.exec('set role authenticated');
  try{
   assert.deepEqual((await q(db,U.ana,`select interna from public.soporte_comentarios`)).map(r=>r.interna),[false]);
   assert.equal((await q(db,U.seba,`select count(*)::int n from public.soporte_comentarios where interna`))[0].n,1);
  }finally{await db.exec('reset role');}
 }finally{await db.close();}
});

test('parecidos y resumen del día',async()=>{
 const db=await nueva();
 try{
  const a=await crear(db,U.ana,{...MEJ,titulo:'Exportar cortes a Excel'}),b=await crear(db,U.luis,{...MEJ,titulo:'Excel de cortes por mes'});
  const par=await servicio(db,`select numero,titulo from public.soporte_tickets_parecidos($1,'excel cortes')`,[await idDe(db,a)]);
  assert.deepEqual(par.map(p=>Number(p.numero)),[b]);
  const r=await crear(db,U.ana,PROB);await cerrar(db,await idDe(db,r),'resuelto','Respuesta del día','');
  const res=await servicio(db,`select numero,titulo,creador,sucursal,respuesta,reabierto from public.soporte_resumen_agente(now()-interval '1 day',now()+interval '1 minute')`);
  assert.deepEqual(res.map(x=>[Number(x.numero),x.creador,x.sucursal,x.respuesta,x.reabierto]),[[r,'Ana (op Z)','Zapopan-1','Respuesta del día',false]]);
 }finally{await db.close();}
});

test('ajustes: agente y resumen; con agente activo hace falta un correo',async()=>{
 const db=await nueva({activo:false});
 try{
  const g=(...a)=>q(db,U.seba,`select public.guardar_ajustes_soporte($1,$2,$3,$4,$5,$6)`,a);
  await q(db,U.seba,`select public.guardar_ajustes_soporte(p_responsable=>$1,p_correos=>$2,p_avisar_nuevos=>true,p_avisar_comentarios=>true)`,[U.seba,['scervera@dodopizza.mx']]);
  assert.equal((await db.query(`select agente_activo from public.soporte_ajustes`)).rows[0].agente_activo,false,'llamada de 4 parámetros sigue funcionando');
  await rechaza(g(null,[],false,false,true,false),/al menos un correo/);
  await q(db,U.seba,`select public.guardar_ajustes_soporte(p_responsable=>null,p_correos=>'{}',p_avisar_nuevos=>false,p_avisar_comentarios=>false)`);
  assert.equal((await db.query(`select resumen_diario from public.soporte_ajustes`)).rows[0].resumen_diario,true,'sin correos y solo resumen por defecto: guarda');
  await g(U.seba,['scervera@dodopizza.mx'],true,true,true,false);
  assert.deepEqual((await db.query(`select agente_activo,resumen_diario from public.soporte_ajustes`)).rows[0],{agente_activo:true,resumen_diario:false});
  await rechaza(q(db,U.ana,`select public.guardar_ajustes_soporte(null,'{}',false,false,false,false)`),/Solo soporte/);
 }finally{await db.close();}
});

test('permisos: solo service_role cierra, resume y busca parecidos',async()=>{
 const db=await nueva();
 try{
  const puede=async(r,f)=>(await db.query(`select has_function_privilege($1,$2,'execute') p`,[r,f])).rows[0].p;
  for(const f of ['public.agente_cerrar_ticket(uuid,text,text,text,text,text,integer,integer)','public.soporte_resumen_agente(timestamptz,timestamptz)','public.soporte_tickets_parecidos(uuid,text)']){
   assert.equal(await puede('authenticated',f),false,f);assert.equal(await puede('anon',f),false,f);assert.equal(await puede('service_role',f),true,f);
  }
  for(const f of ['public.guardar_ajustes_soporte(uuid,text[],boolean,boolean,boolean,boolean)','public.tickets_visibles(bigint)','public.hilo_ticket(bigint)'])
   assert.equal(await puede('authenticated',f),true,f);
  assert.equal((await db.query(`select count(*)::int n from pg_proc where proname='guardar_ajustes_soporte'`)).rows[0].n,1,'la firma vieja se elimina');
 }finally{await db.close();}
});

test('script de supabase/pruebas termina en PRUEBAS OK; ningún update sin where',async()=>{
 const db=await nueva({activo:false});
 try{await rechaza(db.exec(leer('pruebas/20261124130000_soporte_agente.sql')),/PRUEBAS OK/);}finally{await db.close();}
 const sin=m2.replace(/--[^\n]*/g,'');
 for(const u of sin.match(/\bupdate\s+public\.\w+(\s+\w+)?\s+set\b[^;]*;/gi)??[])assert.match(u,/\bwhere\b/i,u);
 for(const d of sin.match(/\bdelete\s+from\s+public\.\w+[^;]*;/gi)??[])assert.match(d,/\bwhere\b/i,d);
});
