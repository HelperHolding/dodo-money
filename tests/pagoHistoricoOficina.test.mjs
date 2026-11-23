import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261120120000_pago_historico_oficina.sql');
const LA_CALMA='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e',BELISARIO='1b2270c8-1250-4c78-aa65-32bb34047b03';
const OFICINA='00000000-0000-0000-0000-0000000000a1',DE_CALMA='00000000-0000-0000-0000-0000000000a2',DE_BELISARIO='00000000-0000-0000-0000-0000000000a3';
const PROV='e1660fae-6957-4660-afe3-c4fe7f864d6f';

async function base(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;
 create table sucursales(id uuid primary key);insert into sucursales values('${LA_CALMA}'),('${BELISARIO}');
 create table facturas(id uuid primary key,sucursal_id uuid references sucursales(id),pagado numeric default 0);
 insert into facturas(id,sucursal_id) values('${OFICINA}',null),('${DE_CALMA}','${LA_CALMA}'),('${DE_BELISARIO}','${BELISARIO}');
 create table reservas_boveda_saldo(factura_id uuid,anulado_en timestamptz,pendiente numeric);
 create table pagos(id uuid primary key default gen_random_uuid(),proveedor_id uuid,fecha date,monto numeric,forma text,cuenta_origen text,referencia text,
  comprobante_ruta text,anulado_en timestamptz,origen_fondos text,origen_historico text,sucursal_historica_id uuid,nota_regularizacion text,solicitud_id uuid,solicitud_datos jsonb);
 create function public.exigir_admin_compras() returns void language sql as $$select$$;
 create function public.hoy_mx() returns date language sql as $$select date '2026-11-20'$$;
 -- registrar_pago real aplica el pago a los documentos; aquí basta con crear el pago y sumar lo aplicado.
 create function public.registrar_pago(p_proveedor uuid,p_fecha date,p_monto numeric,p_forma text,p_cuenta text,p_ref text,p_comp text,p_aplic jsonb,p_nota text) returns uuid
 language plpgsql as $$declare v uuid;begin
  insert into public.pagos(proveedor_id,fecha,monto,forma,cuenta_origen,referencia,comprobante_ruta) values(p_proveedor,p_fecha,p_monto,p_forma,p_cuenta,p_ref,p_comp) returning id into v;
  update public.facturas f set pagado=pagado+(a->>'monto')::numeric from jsonb_array_elements(p_aplic) a where f.id=(a->>'factura_id')::uuid;
  return v;end$$;`);
 await db.exec(migracion);
 return db;
}
const datos=(factura,sucursal,extra={})=>({historico:'true',origen:'boveda_acumulado',confirmado:'si',solicitud:crypto.randomUUID(),proveedor:PROV,
 monto:'2179.62',fecha:'2026-11-13',nota:'Pagado el 13/11 con efectivo de bóveda de cortes anteriores.',comprobante:'pagos/ticket.jpg',
 referencia:'Efectivo bóveda 13/11 '+factura.slice(-2),sucursal_historica:sucursal,aplicaciones:[{factura_id:factura,monto:2179.62}],...extra});
const registrar=(db,d)=>db.query('select public.registrar_pago_simple($1::jsonb) id',[JSON.stringify(d)]);

test('un documento de Oficina central se regulariza con la bóveda de una sucursal', async()=>{
 const db=await base();
 try{
  const {rows:[{id}]}=await registrar(db,datos(OFICINA,LA_CALMA));
  const p=(await db.query('select * from pagos where id=$1',[id])).rows[0];
  assert.equal(p.origen_fondos,'historico');assert.equal(p.origen_historico,'boveda');
  assert.equal(p.sucursal_historica_id,LA_CALMA);assert.equal(p.cuenta_origen,'Bóveda · ya descontado');
  assert.equal(Number((await db.query(`select pagado from facturas where id='${OFICINA}'`)).rows[0].pagado),2179.62);
 }finally{await db.close();}
});

test('un documento con sucursal sigue exigiendo su propia sucursal', async()=>{
 const db=await base();
 try{
  await assert.rejects(registrar(db,datos(DE_BELISARIO,LA_CALMA)),/El documento debe corresponder a la sucursal original/);
  await registrar(db,datos(DE_CALMA,LA_CALMA));
  assert.equal((await db.query('select count(*)::int n from pagos')).rows[0].n,1);
 }finally{await db.close();}
});

test('el histórico de Oficina sigue pidiendo la sucursal de origen', async()=>{
 const db=await base();
 try{
  await assert.rejects(registrar(db,datos(OFICINA,'')),/El documento debe corresponder a la sucursal original/);
  assert.equal((await db.query('select count(*)::int n from pagos')).rows[0].n,0);
 }finally{await db.close();}
});
