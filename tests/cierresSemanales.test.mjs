import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261127120000_cierres_semanales.sql');
const pruebas=load('supabase/pruebas/20261127120000_cierres_semanales.sql');
const dia=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date(Date.now()+d*864e5));
const mas=(f,n)=>{const d=new Date(f+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const lunesDe=f=>{const k=(new Date(f+'T12:00:00Z').getUTCDay()+6)%7;return mas(f,-k)};
const LUNES_ACTUAL=lunesDe(dia(0)),PASADA=mas(LUNES_ACTUAL,-7);
const A='00000000-0000-0000-0000-00000000000a';
const U=n=>`00000000-0000-0000-0000-0000000000${n}`;
const ROLES={adm:['admin','e3'],cor:['corporativo','e5'],ope:['operacion','e4'],enc:['encargado','e1']};
const totales=(n=7)=>({dias:Array.from({length:n},(_,i)=>({i})),total:0});
async function base(){
 const db=new PGlite();
 // Stubs que copian lo real: enum rol_usuario, mi_rol (0048), ve_finanzas/edita_finanzas (0025).
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create type rol_usuario as enum ('operacion','encargado','gerente','admin','corporativo','marketing');
 create table sucursales(id uuid primary key);insert into sucursales values('${A}');
 create table perfiles(id uuid primary key,rol rol_usuario not null default 'operacion',sucursal_id uuid references sucursales(id),activo boolean not null default true,debe_cambiar_contrasena boolean not null default false);
 create function mi_rol() returns rol_usuario language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena $$;
 create function ve_finanzas() returns boolean language sql stable security definer set search_path = public as $$select coalesce(mi_rol()::text in ('admin', 'corporativo'), false)$$;
 create function edita_finanzas() returns boolean language sql stable security definer set search_path = public as $$select coalesce(mi_rol()::text = 'admin', false)$$;`);
 for(const [rol,n] of Object.values(ROLES))await db.query('insert into perfiles(id,rol,sucursal_id) values($1,$2,$3)',[U(n),rol,A]);
 await db.exec(migracion);
 return db;
}
const como=async(db,k)=>{await db.exec('reset role');await db.exec(`select set_config('request.jwt.claims','{"sub":"${U(ROLES[k][1])}","role":"authenticated"}',false);set role authenticated`);};
const aprobar=(db,{s=A,w=PASADA,t=totales(),n=null}={})=>db.query('select public.aprobar_cierre_semanal($1,$2,$3::jsonb,$4) id',[s,w,JSON.stringify(t),n]);
const leer=async db=>(await db.query('select * from public.cierres_semanales')).rows;

test('admin aprueba y reaprobar reemplaza dejando un solo renglón',async()=>{
 const db=await base();
 try{await como(db,'adm');const a=await aprobar(db,{n:'  primera  '});
  let r=await leer(db);assert.equal(r.length,1);assert.equal(r[0].nota,'primera');assert.equal(r[0].aprobado_por,U('e3'));assert.equal(r[0].id,a.rows[0].id);
  const b=await aprobar(db,{t:{dias:totales().dias,total:5},n:'   '});
  r=await leer(db);assert.equal(r.length,1);assert.equal(r[0].nota,null);assert.equal(r[0].totales.total,5);assert.equal(b.rows[0].id,a.rows[0].id);
 }finally{await db.close();}
});
test('corporativo lee y no aprueba; operación y encargado no leen ni aprueban',async()=>{
 const db=await base();
 try{await como(db,'adm');await aprobar(db);
  await como(db,'cor');assert.equal((await leer(db)).length,1);await assert.rejects(aprobar(db),/Solo administración aprueba el cierre semanal\./);
  for(const k of ['ope','enc']){await como(db,k);assert.equal((await leer(db)).length,0,k);await assert.rejects(aprobar(db),/Solo administración aprueba/,k);}
 }finally{await db.close();}
});
test('rechaza no lunes, semana en curso, dias distinto de 7, totales no objeto y nota de 501',async()=>{
 const db=await base();
 try{await como(db,'adm');
  await assert.rejects(aprobar(db,{w:mas(PASADA,1)}),/La semana debe empezar en lunes\./);
  await assert.rejects(aprobar(db,{w:LUNES_ACTUAL}),/La semana aún no termina\./);
  await assert.rejects(aprobar(db,{t:totales(6)}),/Los totales no son válidos\./);
  await assert.rejects(aprobar(db,{t:[1]}),/Los totales no son válidos\./);
  await assert.rejects(aprobar(db,{n:'x'.repeat(501)}));
  await aprobar(db,{n:'x'.repeat(500)});
 }finally{await db.close();}
});
test('security definer con search_path vacío; anon sin permiso y sin escritura directa',async()=>{
 const db=await base();
 try{const {rows:[f]}=await db.query(`select prosecdef,proconfig from pg_proc where proname='aprobar_cierre_semanal'`);
  assert.equal(f.prosecdef,true);assert.ok(f.proconfig.some(c=>/^search_path=("")?$/.test(c)),String(f.proconfig));
  const q=r=>db.query(`select has_function_privilege($1,'public.aprobar_cierre_semanal(uuid,date,jsonb,text)','execute') p`,[r]).then(x=>x.rows[0].p);
  assert.equal(await q('anon'),false);assert.equal(await q('authenticated'),true);
  const t=(r,p)=>db.query(`select has_table_privilege($1,'public.cierres_semanales',$2) p`,[r,p]).then(x=>x.rows[0].p);
  assert.equal(await t('authenticated','select'),true);assert.equal(await t('authenticated','insert'),false);assert.equal(await t('anon','select'),false);
 }finally{await db.close();}
});
test('el script de pruebas de producción termina en PRUEBAS OK',async()=>{
 const db=await base();
 try{await assert.rejects(db.exec(pruebas),/PRUEBAS OK/);}finally{await db.close();}
});
