import {test} from 'node:test';
import assert from 'node:assert/strict';
import {U,como,nueva,servicio} from './correosBase.mjs';
export const rechaza=(p,re)=>assert.rejects(p,e=>{assert.match(e.message,re);return true;});
const v=async(db,id,sql)=>{await como(db,id);return (await db.query(sql)).rows[0];};

test('correos: puesto marketing sin sucursal y permisos de la sección',async()=>{
 const db=await nueva();
 try{
  for(const [id,ver,editar] of [[U.mkt,true,true],[U.admin,true,true],[U.corp,true,false],[U.gerente,false,false]]){
   const r=await v(db,id,`select public.puede_ver_correos() ver,public.puede_editar_correos() editar`);
   assert.deepEqual([r.ver,r.editar],[ver,editar],id);
  }
  await db.exec('reset role');
  await rechaza(db.exec(`insert into perfiles values('00000000-0000-0000-0000-0000000000b8','X','marketing','00000000-0000-0000-0000-0000000000e1',true,false)`),/perfiles_sin_sucursal/);
 }finally{await db.close();}
});

const rpc=async(db,id,sql,args=[])=>{await como(db,id);return (await db.query(sql,args)).rows[0];};
const campana=(db,id,extra={})=>rpc(db,id,`select public.correo_guardar_campana($1::jsonb) id`,[JSON.stringify({nombre:'Go Big',asunto:'Go Big · Dodo',html:'<html><body><a href="https://dodopizza.mx/x">Ver</a></body></html>',...extra})]).then(r=>r.id);
const contacto=(db,email,etiquetas=[])=>rpc(db,U.mkt,`select public.correo_guardar_contacto($1::jsonb) id`,[JSON.stringify({email,etiquetas})]).then(r=>r.id);
const accion=(db,id,c,a,cuando=null)=>rpc(db,id,`select public.correo_cambiar_estado($1,$2,$3)`,[c,a,cuando]);
export {rpc,campana,contacto,accion};

test('correos: contactos normalizados, sin duplicados, y quién los ve',async()=>{
 const db=await nueva();
 try{
  const a=await contacto(db,'  Ana@Mail.com ',['zapopan']);
  assert.equal(await contacto(db,'ana@mail.com',['vip']),a);
  await como(db,U.mkt);
  assert.deepEqual((await db.query(`select email,etiquetas from correo_contactos`)).rows,[{email:'ana@mail.com',etiquetas:['vip','zapopan']}]);
  await rechaza(contacto(db,'no-es-correo'),/Correo inválido/);
  await como(db,U.corp);assert.equal((await db.query(`select count(*)::int n from correo_contactos`)).rows[0].n,0);
  await rechaza(rpc(db,U.corp,`select public.correo_guardar_contacto('{"email":"x@y.com"}')`),/Solo marketing o administración/);
  await rechaza(rpc(db,U.gerente,`select public.correo_guardar_campana('{"nombre":"a","asunto":"b","html":"c"}')`),/Solo marketing o administración/);
 }finally{await db.close();}
});

test('correos: importar CSV no reactiva bajas y suma etiquetas',async()=>{
 const db=await nueva();
 try{
  const b=await contacto(db,'baja@mail.com');await rpc(db,U.mkt,`select public.correo_baja_manual($1)`,[b]);
  await contacto(db,'ya@mail.com',['a']);
  const filas=JSON.stringify([{email:'NUEVO@mail.com',nombre:'N',etiquetas:['b']},{email:'ya@mail.com',etiquetas:['b']},{email:'baja@mail.com'},{email:'mal'},{email:'nuevo@mail.com'}]);
  const previa=(await rpc(db,U.mkt,`select public.correo_importar_contactos($1::jsonb,'lista.csv',false) r`,[filas])).r;
  assert.deepEqual(previa,{nuevos:1,existentes:1,bajas:1,invalidos:1});
  await como(db,U.mkt);assert.equal((await db.query(`select count(*)::int n from correo_contactos`)).rows[0].n,2);
  await rpc(db,U.mkt,`select public.correo_importar_contactos($1::jsonb,'lista.csv',true)`,[filas]);
  const filasDb=Object.fromEntries((await db.query(`select email,estado,etiquetas,origen from correo_contactos`)).rows.map(r=>[r.email,r]));
  assert.equal(filasDb['baja@mail.com'].estado,'baja');
  assert.deepEqual(filasDb['ya@mail.com'].etiquetas,['a','b']);
  assert.equal(filasDb['nuevo@mail.com'].origen,'lista.csv');
 }finally{await db.close();}
});

test('correos: programar valida fecha, lista y estados',async()=>{
 const db=await nueva();
 try{
  const c=await campana(db,U.mkt,{etiqueta:'zapopan'});
  await rechaza(accion(db,U.mkt,c,'programar','2020-01-01T00:00:00Z'),/La fecha ya pasó/);
  await rechaza(accion(db,U.mkt,c,'programar',null),/No hay contactos activos/);
  await contacto(db,'a@mail.com',['zapopan']);
  assert.equal((await rpc(db,U.mkt,`select public.correo_contar_destinatarios('zapopan') n`)).n,1);
  await accion(db,U.mkt,c,'programar',null);
  await como(db,U.mkt);assert.equal((await db.query(`select estado from correo_campanas where id=$1`,[c])).rows[0].estado,'programada');
  await rechaza(accion(db,U.mkt,c,'programar',null),/no se puede programar/);
  await rechaza(campana(db,U.mkt,{id:c,html:'<p>otro</p>'}).then(()=>accion(db,U.mkt,c,'detener')),/no se puede detener/);
  await accion(db,U.mkt,c,'borrador');await accion(db,U.mkt,c,'cancelar');
  await rechaza(campana(db,U.mkt,{id:c}),/Solo se editan borradores o programadas/);
  await rechaza(accion(db,U.corp,c,'cancelar'),/Solo marketing o administración/);
 }finally{await db.close();}
});

test('correos: prueba a máximo 5 correos válidos',async()=>{
 const db=await nueva();
 try{
  const c=await campana(db,U.mkt);
  assert.equal((await rpc(db,U.mkt,`select public.correo_mandar_prueba($1,$2) n`,[c,['scervera@dodopizza.mx',' Otro@Mail.com ']])).n,2);
  await rechaza(rpc(db,U.mkt,`select public.correo_mandar_prueba($1,$2)`,[c,['a@a.com','b@a.com','c@a.com','d@a.com','e@a.com','f@a.com']]),/hasta 5 correos/);
  await rechaza(rpc(db,U.mkt,`select public.correo_mandar_prueba($1,$2)`,[c,['nope']]),/Correo inválido/);
  await como(db,U.mkt);
  assert.deepEqual((await db.query(`select email,es_prueba,estado from correo_envios order by email`)).rows,[{email:'otro@mail.com',es_prueba:true,estado:'pendiente'},{email:'scervera@dodopizza.mx',es_prueba:true,estado:'pendiente'}]);
 }finally{await db.close();}
});

test('correos: BOM, NBSP y tabulador se recortan; invisibles en medio se rechazan',async()=>{
 const db=await nueva();
 try{
  const a=await contacto(db,'ana@mail.com');
  for(const raro of ['﻿ana@mail.com','ana@mail.com ','\tAna@Mail.com\t','​ana@mail.com​']) assert.equal(await contacto(db,raro),a,JSON.stringify(raro));
  await rechaza(contacto(db,'an​a@mail.com'),/Correo inválido/);
  const previa=(await rpc(db,U.mkt,`select public.correo_importar_contactos($1::jsonb,'x.csv',true) r`,[JSON.stringify([{email:'﻿ana@mail.com'},{email:'luis@mail.com '},{email:'\tLUIS@mail.com'}])])).r;
  assert.deepEqual(previa,{nuevos:1,existentes:1,bajas:0,invalidos:0});
  await como(db,U.mkt);
  assert.deepEqual((await db.query(`select email from correo_contactos order by email`)).rows.map(r=>r.email),['ana@mail.com','luis@mail.com']);
 }finally{await db.close();}
});

const lote=async(db,n=8)=>{await servicio(db);try{return (await db.query(`select public.correo_tomar_lote($1) r`,[n])).rows[0].r;}finally{await db.exec('reset role');}};
const sql=async(db,q,a=[])=>{await servicio(db);try{return (await db.query(q,a)).rows;}finally{await db.exec('reset role');}};

test('correos: el lote arranca la campaña, excluye bajas y no repite',async()=>{
 const db=await nueva();
 try{
  for(const e of ['a@m.com','b@m.com','c@m.com'])await contacto(db,e);
  const x=await contacto(db,'x@m.com');await rpc(db,U.mkt,`select public.correo_baja_manual($1)`,[x]);
  const c=await campana(db,U.mkt);await accion(db,U.mkt,c,'programar',null);
  await rpc(db,U.mkt,`select public.correo_mandar_prueba($1,$2)`,[c,['p@m.com']]);
  const r1=await lote(db,2);
  assert.equal(r1[0].para,'p@m.com');assert.equal(r1[0].es_prueba,true);assert.equal(r1[0].asunto,'[PRUEBA] Go Big · Dodo');
  assert.equal(r1.length,2);
  const r2=await lote(db,8);
  assert.equal(r2.length,2);
  const todos=[...r1,...r2].map(x=>x.para).sort();
  assert.deepEqual(todos,['a@m.com','b@m.com','c@m.com','p@m.com']);
  assert.equal((await sql(db,`select estado from correo_campanas where id=$1`,[c]))[0].estado,'enviando');
  assert.deepEqual(await lote(db,8),[]);
 }finally{await db.close();}
});

test('correos: resultados cierran la campaña; rebote marca contacto; vencidos pasan a problema',async()=>{
 const db=await nueva();
 try{
  await contacto(db,'a@m.com');await contacto(db,'b@m.com');
  const c=await campana(db,U.mkt);await accion(db,U.mkt,c,'programar',null);
  const L=await lote(db,8);const a=L.find(x=>x.para==='a@m.com'),b=L.find(x=>x.para==='b@m.com'); // el orden dentro del lote no está garantizado
  await sql(db,`select public.correo_registrar_resultado($1,true,'<id@x>',null,false)`,[a.envio_id]);
  await sql(db,`select public.correo_registrar_resultado($1,false,null,'550 no existe',true)`,[b.envio_id]);
  await sql(db,`select public.correo_registrar_resultado($1,true,null,null,false)`,[a.envio_id]); // repetido: se ignora
  assert.equal((await sql(db,`select estado from correo_campanas where id=$1`,[c]))[0].estado,'enviada');
  assert.equal((await sql(db,`select estado from correo_contactos where email='b@m.com'`))[0].estado,'rebote');
  // Vencido
  await contacto(db,'v@m.com');const c2=await campana(db,U.mkt,{nombre:'Dos'});await accion(db,U.mkt,c2,'programar',null);
  await lote(db,8);await sql(db,`update correo_envios set reservado_en=now()-interval '16 minutes' where campana_id=$1`,[c2]);
  await lote(db,8);
  const [v]=await sql(db,`select estado,detalle from correo_envios where campana_id=$1`,[c2]);
  assert.equal(v.estado,'problema');assert.match(v.detalle,/Sin respuesta de n8n/);
  // Reintentar no revive al rebotado: sin nada que regresar a pendiente, avisa y la campaña sigue enviada
  await rechaza(accion(db,U.mkt,c,'reintentar'),/No hay envíos con problema que reintentar/);
  assert.equal((await sql(db,`select count(*)::int n from correo_envios where campana_id=$1 and estado='pendiente'`,[c]))[0].n,0);
  const [cc]=await sql(db,`select estado,terminada_en from correo_campanas where id=$1`,[c]);
  assert.equal(cc.estado,'enviada');assert.ok(cc.terminada_en);
  // El vencido (contacto activo) sí se reintenta y reabre la campaña
  assert.equal((await sql(db,`select estado from correo_campanas where id=$1`,[c2]))[0].estado,'enviada');
  await accion(db,U.mkt,c2,'reintentar');
  assert.equal((await sql(db,`select estado from correo_envios where campana_id=$1`,[c2]))[0].estado,'pendiente');
  const [c2b]=await sql(db,`select estado,terminada_en from correo_campanas where id=$1`,[c2]);
  assert.equal(c2b.estado,'enviando');assert.equal(c2b.terminada_en,null);
 }finally{await db.close();}
});

test('correos: detenida no entrega; baja entre armado y envío se omite',async()=>{
 const db=await nueva();
 try{
  const ids={a:await contacto(db,'a@m.com'),b:await contacto(db,'b@m.com')};
  const c=await campana(db,U.mkt);await accion(db,U.mkt,c,'programar',null);
  const [primero]=await lote(db,1); // arma la lista y reserva 1 (cuál, no está garantizado)
  const otro=primero.para==='a@m.com'?'b@m.com':'a@m.com';
  await accion(db,U.mkt,c,'detener');
  assert.deepEqual(await lote(db,8),[]);
  await accion(db,U.mkt,c,'reanudar');
  await rpc(db,U.mkt,`select public.correo_baja_manual($1)`,[ids[otro[0]]]);
  assert.deepEqual(await lote(db,8),[]);
  const [e]=await sql(db,`select estado,detalle from correo_envios where email=$1`,[otro]);
  assert.equal(e.estado,'problema');assert.match(e.detalle,/se dio de baja/);
 }finally{await db.close();}
});

test('correos: un éxito tardío tras el barrido de vencidos queda aceptado',async()=>{
 const db=await nueva();
 try{
  await contacto(db,'a@m.com');
  const c=await campana(db,U.mkt);await accion(db,U.mkt,c,'programar',null);
  const [x]=await lote(db,8);
  await sql(db,`update correo_envios set reservado_en=now()-interval '16 minutes'`);
  await lote(db,8);
  assert.equal((await sql(db,`select estado from correo_envios`))[0].estado,'problema');
  await sql(db,`select public.correo_registrar_resultado($1,true,'<tarde@x>',null,false)`,[x.envio_id]);
  const [e]=await sql(db,`select estado,enviado_en,message_id from correo_envios`);
  assert.equal(e.estado,'aceptado');assert.ok(e.enviado_en);assert.equal(e.message_id,'<tarde@x>');
  // un fallo tardío sí se ignora
  await sql(db,`select public.correo_registrar_resultado($1,false,null,'x',false)`,[x.envio_id]);
  assert.equal((await sql(db,`select estado from correo_envios`))[0].estado,'aceptado');
 }finally{await db.close();}
});

test('correos: eventos por token; clic sospechoso y baja idempotente',async()=>{
 const db=await nueva();
 try{
  await contacto(db,'a@m.com');const c=await campana(db,U.mkt);await accion(db,U.mkt,c,'programar',null);
  const [e]=await lote(db,8);
  await sql(db,`select public.correo_registrar_resultado($1,true,null,null,false)`,[e.envio_id]);
  const r=(await sql(db,`select public.correo_registrar_evento($1,'clic','https://dodopizza.mx/','UA') r`,[e.token]))[0].r;
  assert.deepEqual(r,{campana_nombre:'Go Big'});
  await sql(db,`update correo_envios set enviado_en=now()-interval '1 minute'`);
  await sql(db,`select public.correo_registrar_evento($1,'apertura',null,'UA')`,[e.token]);
  await sql(db,`select public.correo_registrar_evento($1,'clic','https://dodopizza.mx/','UA')`,[e.token]);
  assert.deepEqual((await sql(db,`select tipo,sospechoso from correo_eventos order by id`)).map(x=>[x.tipo,x.sospechoso]),[['clic',true],['apertura',false],['clic',false]]);
  assert.equal((await sql(db,`select public.correo_registrar_evento('nada','apertura',null,null) r`))[0].r,null);
  assert.deepEqual((await sql(db,`select public.correo_baja_por_token($1) r`,[e.token]))[0].r,{email:'a***@m.com'});
  await sql(db,`select public.correo_baja_por_token($1)`,[e.token]);
  assert.equal((await sql(db,`select estado from correo_contactos`))[0].estado,'baja');
  assert.equal((await sql(db,`select count(*)::int n from correo_eventos where tipo='baja'`))[0].n,1);
  await como(db,U.mkt);await rechaza(db.query(`select public.correo_tomar_lote(8)`),/permission denied/);
 }finally{await db.close();}
});

test('correos: campaña sin destinatarios elegibles se cierra al tomar lote',async()=>{
 const db=await nueva();
 try{
  const a=await contacto(db,'a@m.com',['zapopan']);
  const c=await campana(db,U.mkt,{etiqueta:'zapopan'});await accion(db,U.mkt,c,'programar',null);
  await rpc(db,U.mkt,`select public.correo_baja_manual($1)`,[a]); // todos se dan de baja antes de arrancar
  assert.deepEqual(await lote(db,8),[]);
  const [r]=await sql(db,`select estado,terminada_en from correo_campanas where id=$1`,[c]);
  assert.equal(r.estado,'enviada');assert.ok(r.terminada_en);
 }finally{await db.close();}
});

test('correos: la sesión del usuario no lee el token de los envíos; el resto de columnas sí',async()=>{
 const db=await nueva();
 try{
  const c=await campana(db,U.mkt);await rpc(db,U.mkt,`select public.correo_mandar_prueba($1,$2)`,[c,['p@m.com']]);
  for(const id of [U.mkt,U.corp,U.admin]){
   await como(db,id);
   await rechaza(db.query(`select token from correo_envios`),/permission denied/);
   await rechaza(db.query(`select * from correo_envios`),/permission denied/);
   assert.equal((await db.query(`select id,campana_id,contacto_id,email,es_prueba,estado,reservado_en,enviado_en,message_id,detalle,creado_en from correo_envios`)).rows.length,1,id);
  }
  await db.exec('reset role');
  const anon=(await db.query(`select count(*)::int n from information_schema.role_table_grants where grantee='anon' and table_name like 'correo%'`)).rows[0].n;
  assert.equal(anon,0);
  assert.equal((await sql(db,`select count(*)::int n from correo_envios where token is not null`))[0].n,1); // n8n (service_role) sí
 }finally{await db.close();}
});

test('correos: el correo de un contacto siempre se guarda en minúsculas',async()=>{
 const db=await nueva();
 try{
  await rechaza(db.exec(`insert into correo_contactos(email) values('Ana@Mail.com')`),/correo_contactos_email_check/);
  await db.exec(`insert into correo_contactos(email) values('ana@mail.com')`);
 }finally{await db.close();}
});

test('correos: importar 20 000 filas es en conjunto (rápido) y respeta conteos y primera aparición',async()=>{
 const db=await nueva();
 try{
  await contacto(db,'c0@m.com',['vieja']);await contacto(db,'c1@m.com');
  const b=await contacto(db,'c2@m.com');await rpc(db,U.mkt,`select public.correo_baja_manual($1)`,[b]);
  // 19 990 válidas (c0..c19989, incluye 3 ya existentes, una de baja), 5 repetidas y 5 inválidas = 20 000
  const filas=Array.from({length:19990},(_,i)=>({email:`C${i}@m.com`,nombre:`N${i}`,etiquetas:['lote']}));
  filas.push(...Array.from({length:5},(_,i)=>({email:` c${i+10}@M.com `,nombre:'Repetido',etiquetas:['otra']})));
  filas.push(...Array.from({length:5},()=>({email:'sin-arroba'})));
  assert.equal(filas.length,20000);
  const t0=performance.now();
  const r=(await rpc(db,U.mkt,`select public.correo_importar_contactos($1::jsonb,'grande.csv',true) r`,[JSON.stringify(filas)])).r;
  const ms=performance.now()-t0;
  console.log(`importar 20 000 filas: ${Math.round(ms)} ms`);
  assert.deepEqual(r,{nuevos:19987,existentes:2,bajas:1,invalidos:5});
  assert.ok(ms<12000,`tardó ${Math.round(ms)} ms`);
  await como(db,U.mkt);
  assert.equal((await db.query(`select count(*)::int n from correo_contactos`)).rows[0].n,19990);
  const una=async e=>(await db.query(`select nombre,etiquetas,estado,origen from correo_contactos where email=$1`,[e])).rows[0];
  assert.deepEqual(await una('c10@m.com'),{nombre:'N10',etiquetas:['lote'],estado:'activo',origen:'grande.csv'}); // vale la primera aparición
  assert.deepEqual((await una('c0@m.com')).etiquetas,['lote','vieja']);
  assert.deepEqual(await una('c2@m.com'),{nombre:null,etiquetas:[],estado:'baja',origen:'manual'}); // la baja no se toca
  await rechaza(rpc(db,U.mkt,`select public.correo_importar_contactos($1::jsonb,'x',false)`,[JSON.stringify([...filas,{email:'uno@m.com'}])]),/de 1 a 20 000/);
 }finally{await db.close();}
});
