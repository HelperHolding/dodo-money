import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const repair=readFileSync(new URL('../supabase/correcciones/2026-11-02_iva_sobre_lo_cobrado.sql',import.meta.url),'utf8').replace(/^﻿/,'');
const S='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e',BRUTOS='00000000-0000-0000-0000-0000000000b1',API='00000000-0000-0000-0000-0000000000a1';
const DIA='00000000-0000-0000-0000-0000000000d1',DIA_API='00000000-0000-0000-0000-0000000000d2';

test('IVA sobre lo cobrado: corrige días de Datos brutos y deja la API',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`
 create table sucursales(id uuid primary key,nombre text not null);insert into sucursales values('${S}','Dodo La Calma (Dodo-1)');
 create table importaciones_ventas(id uuid primary key,formato text not null check (formato in ('ventas_productos','datos_brutos','api')));
 insert into importaciones_ventas values('${BRUTOS}','datos_brutos'),('${API}','api');
 create table ventas_dia(id uuid primary key,sucursal_id uuid not null references sucursales(id),fecha date not null,pedidos integer not null default 0,
  total numeric(12,2) not null default 0,iva numeric(12,2) not null default 0,importacion_id uuid not null references importaciones_ventas(id),unique(sucursal_id,fecha));
 create table ventas_dia_desglose(ventas_dia_id uuid not null references ventas_dia(id) on delete cascade,
  tipo text not null check (tipo in ('entrega','llevadera','restaurante','centro_llamadas','sitio','app','agregador')),
  pedidos integer not null default 0,total numeric(12,2) not null default 0,iva numeric(12,2) not null default 0,primary key(ventas_dia_id,tipo));
 create table pedidos(dodo_id text primary key,sucursal_id uuid not null references sucursales(id),fecha date not null,
  pago text not null check (pago in ('efectivo','tarjeta','en_linea','otro')),tipo text not null check (tipo in ('en_tienda','entrega','personal')),
  origen text not null check (origen in ('mostrador','kiosco','app','sitio','otro')),estado text not null check (estado in ('entregado','cancelado')),
  total numeric(12,2) not null,iva numeric(12,2) not null default 0,agregador text);
 create table pedido_productos(pedido_id text not null references pedidos(dodo_id) on delete cascade,renglon integer not null,precio numeric(12,2) not null,primary key(pedido_id,renglon));
 -- 21/09 (Datos brutos): uno que cuadra, uno cobrado en $0, uno con descuento al pedido y una comida del personal.
 insert into pedidos values
  ('N1','${S}','2026-09-21','efectivo','en_tienda','mostrador','entregado',224.5,30.96,null),
  ('Z1','${S}','2026-09-21','efectivo','en_tienda','app','entregado',0,13.10,null),
  ('D1','${S}','2026-09-21','tarjeta','entrega','otro','entregado',1910,296.41,'Rappi'),
  ('P1','${S}','2026-09-21','efectivo','personal','mostrador','entregado',0,17.79,null),
  ('A1','${S}','2026-10-25','tarjeta','en_tienda','mostrador','entregado',100,20,null);
 insert into pedido_productos values ('N1',1,129),('N1',2,95.5),('Z1',1,95),('D1',1,2000),('D1',2,149),('P1',1,129),('A1',1,145);
 insert into ventas_dia values ('${DIA}','${S}','2026-09-21',3,2134.5,340.47,'${BRUTOS}'),('${DIA_API}','${S}','2026-10-25',1,100,20,'${API}');
 insert into ventas_dia_desglose values ('${DIA}','restaurante',1,224.5,30.96),('${DIA}','llevadera',1,0,13.10),('${DIA}','app',1,0,13.10),
  ('${DIA}','entrega',1,1910,296.41),('${DIA}','agregador',1,1910,296.41),('${DIA_API}','restaurante',1,100,20);
 `);
 const foto=async()=>(await db.query(`select (select json_agg(x order by dodo_id) from pedidos x) p,(select json_agg(x order by fecha) from ventas_dia x) v,
  (select json_agg(x order by ventas_dia_id,tipo) from ventas_dia_desglose x) g`)).rows[0];
 const antes=await foto();

 const ensayo=(await db.exec(repair)).flatMap(x=>x.rows??[]).filter(x=>x.modo);
 assert.equal(ensayo.length,1);
 assert.equal(Number(ensayo[0].iva_antes),340.47);assert.equal(Number(ensayo[0].iva_nuevo),294.41);assert.equal(Number(ensayo[0].pedidos_corregidos),3);
 assert.deepEqual(await foto(),antes,'el ensayo no guarda nada');

 await db.exec(repair.replace(/ROLLBACK;\s*$/,'COMMIT;'));
 const iva=async(t,where)=>Object.fromEntries((await db.query(`select * from ${t} where ${where}`)).rows.map(r=>[r.dodo_id??r.tipo??r.fecha,Number(r.iva)]));
 assert.deepEqual(await iva('pedidos',`fecha='2026-09-21'`),{N1:30.96,Z1:0,D1:263.45,P1:0});
 assert.equal(Number((await db.query(`select iva from ventas_dia where id='${DIA}'`)).rows[0].iva),294.41); // = 2134.5 × 16/116
 assert.deepEqual(await iva('ventas_dia_desglose',`ventas_dia_id='${DIA}'`),{agregador:263.45,app:0,entrega:263.45,llevadera:0,restaurante:30.96});
 // El día de la API queda igual aunque su pedido no cuadre.
 assert.equal(Number((await db.query(`select iva from pedidos where dodo_id='A1'`)).rows[0].iva),20);
 assert.equal(Number((await db.query(`select iva from ventas_dia where id='${DIA_API}'`)).rows[0].iva),20);

 // Correrlo otra vez no cambia nada.
 const despues=await foto();
 const otra=(await db.exec(repair.replace(/ROLLBACK;\s*$/,'COMMIT;'))).flatMap(x=>x.rows??[]).filter(x=>x.modo);
 assert.equal(otra.length,0);assert.deepEqual(await foto(),despues);
 }finally{await db.close();}
});
