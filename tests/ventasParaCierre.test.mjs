import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261125150000_ventas_para_cierre.sql');
const pruebas=load('supabase/pruebas/20261125150000_ventas_para_cierre.sql');
const A='00000000-0000-0000-0000-00000000000a',B='00000000-0000-0000-0000-00000000000b';
const U=n=>`00000000-0000-0000-0000-0000000000${n}`;
const ROLES={enc:['encargado',A,'e1'],ger:['gerente',A,'e2'],adm:['admin',A,'e3'],ope:['operacion',A,'e4'],cor:['corporativo',A,'e5'],mkt:['marketing',A,'e6'],encB:['encargado',B,'e7']};
async function base(){
 const db=new PGlite();
 // Stubs que copian lo real: enum rol_usuario (0001/0004/0008), mi_sucursal/mi_rol, ventas_dia e importaciones_ventas (0006).
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create type rol_usuario as enum ('operacion','encargado','gerente','admin','corporativo','marketing');
 create table sucursales(id uuid primary key);insert into sucursales values('${A}'),('${B}');
 create table perfiles(id uuid primary key,rol rol_usuario not null default 'operacion',sucursal_id uuid references sucursales(id),activo boolean not null default true,debe_cambiar_contrasena boolean not null default false);
 create function mi_sucursal() returns uuid language sql stable security definer set search_path=public as $$select sucursal_id from perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena $$;
 create function mi_rol() returns rol_usuario language sql stable security definer set search_path=public as $$select rol from perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena $$;
 create table importaciones_ventas(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references sucursales(id),fecha date not null,importado_en timestamptz not null default now());
 create table ventas_dia(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references sucursales(id),fecha date not null,pedidos integer not null default 0 check(pedidos>=0),total numeric(12,2) not null default 0,efectivo numeric(12,2) not null default 0,tarjeta numeric(12,2) not null default 0,en_linea numeric(12,2) not null default 0,iva numeric(12,2) not null default 0,importacion_id uuid not null references importaciones_ventas(id),unique(sucursal_id,fecha));`);
 for(const [rol,suc,n] of Object.values(ROLES))await db.query('insert into perfiles(id,rol,sucursal_id) values($1,$2,$3)',[U(n),rol,suc]);
 await db.exec(`insert into importaciones_ventas(id,sucursal_id,fecha,importado_en) values('00000000-0000-0000-0000-0000000000b1','${A}','2026-11-24','2026-11-24 20:00+00'),('00000000-0000-0000-0000-0000000000b2','${B}','2026-11-24','2026-11-24 21:00+00');
 insert into ventas_dia(sucursal_id,fecha,pedidos,total,efectivo,tarjeta,en_linea,iva,importacion_id) values('${A}','2026-11-24',10,1000,400,300,300,160,'00000000-0000-0000-0000-0000000000b1'),('${B}','2026-11-24',5,500,100,200,200,80,'00000000-0000-0000-0000-0000000000b2')`);
 await db.exec(migracion);
 return db;
}
const como=(db,k)=>db.exec(`select set_config('request.jwt.claims','{"sub":"${U(ROLES[k][2])}","role":"authenticated"}',false)`);
const ver=(db,f='2026-11-24')=>db.query('select * from public.ventas_para_cierre($1)',[f]);

test('encargado, gerente y admin reciben la fila del día con actualizado_en',async()=>{
 const db=await base();
 try{for(const k of ['enc','ger','adm']){await como(db,k);const {rows}=await ver(db);
  assert.equal(rows.length,1,k);const r=rows[0];
  assert.deepEqual([r.efectivo,r.tarjeta,r.en_linea,r.iva,r.total,r.pedidos].map(Number),[400,300,300,160,1000,10],k);
  assert.equal(new Date(r.actualizado_en).toISOString(),'2026-11-24T20:00:00.000Z');}
 }finally{await db.close();}
});
test('operación, corporativo y marketing reciben el error',async()=>{
 const db=await base();
 try{for(const k of ['ope','cor','mkt']){await como(db,k);await assert.rejects(ver(db),/Solo quien cierra el día/,k);}
 }finally{await db.close();}
});
test('encargado con debe_cambiar_contrasena (mi_rol nulo) recibe el error',async()=>{
 const db=await base();
 try{await db.exec(`update perfiles set debe_cambiar_contrasena=true where id='${U('e1')}'`);await como(db,'enc');await assert.rejects(ver(db),/Solo quien cierra el día/);
 }finally{await db.close();}
});
test('un encargado de B recibe la de B, no la de A; sin fila no hay filas',async()=>{
 const db=await base();
 try{await como(db,'encB');const {rows}=await ver(db);assert.equal(rows.length,1);assert.equal(Number(rows[0].total),500);
  await como(db,'enc');assert.equal((await ver(db,'2026-01-01')).rows.length,0);
 }finally{await db.close();}
});
test('security definer con search_path vacío; anon sin permiso, authenticated con permiso',async()=>{
 const db=await base();
 try{const {rows:[f]}=await db.query(`select prosecdef,proconfig from pg_proc where proname='ventas_para_cierre'`);
  assert.equal(f.prosecdef,true);assert.ok(f.proconfig.some(c=>/^search_path=("")?$/.test(c)),String(f.proconfig));
  const q=r=>db.query(`select has_function_privilege($1,'public.ventas_para_cierre(date)','execute') p`,[r]).then(x=>x.rows[0].p);
  assert.equal(await q('anon'),false);assert.equal(await q('authenticated'),true);
 }finally{await db.close();}
});
test('el script de pruebas de producción termina en PRUEBAS OK',async()=>{
 const db=await base();
 try{await assert.rejects(db.exec(pruebas),/PRUEBAS OK/);}finally{await db.close();}
});
