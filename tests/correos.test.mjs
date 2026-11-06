import {test} from 'node:test';
import assert from 'node:assert/strict';
import {U,como,nueva} from './correosBase.mjs';
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
