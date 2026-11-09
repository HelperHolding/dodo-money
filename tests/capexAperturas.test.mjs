import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Diseño: docs/superpowers/specs/2026-11-09-capex-aperturas-design.md
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^\uFEFF/,'');
const migracion=load('supabase/migrations/20261109180000_capex_aperturas.sql');
export const ADMIN='00000000-0000-0000-0000-0000000000a1',CORP='00000000-0000-0000-0000-0000000000c1',GER='00000000-0000-0000-0000-0000000000e1';
export const S1='10000000-0000-0000-0000-000000000001',S2='10000000-0000-0000-0000-000000000002';
export const P1='20000000-0000-0000-0000-000000000001',P2='20000000-0000-0000-0000-000000000002';
const CATEGORIAS=['proyecto_permisos','obra_civil','instalaciones','equipo_cocina','camara_fria','mobiliario','tecnologia','senaletica','smallware','otros'];

// Lo mínimo de Supabase, perfiles, compras y aperturas; CHECK y enums copiados de 0012, 0013, 0014 y 0037.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table perfiles(id uuid primary key,activo boolean not null default true,rol text not null,nombre text);
 insert into perfiles values('${ADMIN}',true,'admin','Admin'),('${CORP}',true,'corporativo','Corporativo'),('${GER}',true,'gerente','Gerente');
 create function ve_finanzas() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create function edita_finanzas() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol='admin')$$;
 create function ve_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create table sucursales(id uuid primary key,nombre text not null);
 insert into sucursales values('${S1}','Dodo Uno'),('${S2}','Dodo Dos');
 create type estado_orden as enum ('borrador','enviada','confirmada','cerrada','cancelada');
 create type tipo_factura as enum ('ingreso','egreso');
 create type estado_factura as enum ('por_pagar','parcial','pagada','cancelada');
 create table proveedores(id uuid primary key default gen_random_uuid(),razon_social text not null);
 create table ordenes_compra(id uuid primary key,folio text,proveedor_id uuid references proveedores(id),sucursal_id uuid references sucursales(id),estado estado_orden not null default 'borrador');
 create table orden_renglones(id uuid primary key default gen_random_uuid(),orden_id uuid not null references ordenes_compra(id),cantidad numeric(12,3) not null check(cantidad>0),precio numeric(12,2) not null default 0 check(precio>=0));
 create table facturas(id uuid primary key,uuid text not null unique,folio text,tipo tipo_factura not null,proveedor_id uuid references proveedores(id),sucursal_id uuid references sucursales(id),uuid_relacionado text,
  subtotal numeric(14,2) not null,descuento numeric(14,2) not null default 0,total numeric(14,2) not null check(total>=0),estado estado_factura not null default 'por_pagar');
 create table factura_ordenes(factura_id uuid not null references facturas(id),orden_id uuid not null references ordenes_compra(id),primary key(factura_id,orden_id));
 create table pagos(id uuid primary key default gen_random_uuid(),monto numeric(14,2) not null check(monto>0),anulado_en timestamptz);
 create table pago_aplicaciones(id bigserial primary key,pago_id uuid not null references pagos(id),factura_id uuid not null references facturas(id),monto numeric(14,2) not null check(monto>0),unique(pago_id,factura_id));
 create table apertura_proyectos(id uuid primary key,sucursal_id uuid not null unique references sucursales(id),responsable text not null,objetivo_desde date not null,objetivo_hasta date not null check(objetivo_hasta>=objetivo_desde),presupuesto numeric(16,2),revision integer not null default 1);
 insert into apertura_proyectos values('${P1}','${S1}','Julio','2026-11-01','2026-12-15',null,1),('${P2}','${S2}','Julio','2026-12-01','2027-01-15',null,1);
 create table apertura_items(id uuid primary key default gen_random_uuid(),proyecto_id uuid not null references apertura_proyectos(id),tipo text not null,categoria text,nombre text not null default 'Item',orden_id uuid references ordenes_compra(id),factura_id uuid references facturas(id));
 create table inversion_apertura_fuentes(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references sucursales(id),nombre text not null,fecha date not null,total numeric(16,2) not null,datos jsonb not null);
 grant usage on schema auth to authenticated;grant select on perfiles to authenticated;`;

export async function preparar(){const db=new PGlite();await db.exec(BASE);await db.exec(migracion);return db;}
export async function como(db,id){await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:id,role:'authenticated'})]);}
const aprobar=(db,p,rev,montos,motivo='Presupuesto inicial')=>db.query('select public.aprobar_capex_presupuesto($1,$2,$3::jsonb,$4) r',[p,rev,JSON.stringify(montos),motivo]).then(x=>x.rows[0].r);

test('capex: diez categorías con las claves del diseño',async()=>{
 const db=await preparar();
 try{assert.deepEqual((await db.query('select clave from capex_categorias order by orden')).rows.map(r=>r.clave),CATEGORIAS);}
 finally{await db.close();}
});

test('capex: aprobar presupuesto crea revisiones completas y detecta conflictos',async()=>{
 const db=await preparar();
 try{
  await como(db,ADMIN);
  assert.equal(await aprobar(db,P1,0,{obra_civil:1300000,equipo_cocina:450000.555}),1);
  const r1=(await db.query(`select categoria,monto::float8 m from capex_presupuestos where proyecto_id=$1 and revision=1 order by categoria`,[P1])).rows;
  assert.equal(r1.length,10);
  assert.equal(r1.find(x=>x.categoria==='obra_civil').m,1300000);
  assert.equal(r1.find(x=>x.categoria==='equipo_cocina').m,450000.56);
  assert.equal(r1.find(x=>x.categoria==='otros').m,0);
  await assert.rejects(aprobar(db,P1,0,{obra_civil:1}),/El presupuesto cambió/);
  assert.equal(await aprobar(db,P1,1,{obra_civil:1400000},'Ajuste por cotización de obra'),2);
  await assert.rejects(aprobar(db,P1,2,{pisos:1}),/Categoría inválida/);
  await assert.rejects(aprobar(db,P1,2,{obra_civil:-1}),/Monto inválido/);
  await assert.rejects(aprobar(db,P1,2,{obra_civil:'mil'}),/Monto inválido/);
  await assert.rejects(aprobar(db,P1,2,{},'Sin montos'),/al menos una categoría/);
  await assert.rejects(aprobar(db,P1,2,{obra_civil:1},'abc'),/motivo/);
  await assert.rejects(aprobar(db,'30000000-0000-0000-0000-000000000009',0,{obra_civil:1}),/La apertura no existe/);
  await como(db,CORP);
  await assert.rejects(aprobar(db,P1,2,{obra_civil:1}),/Solo administración/);
  assert.equal((await db.query(`select has_function_privilege('anon','public.aprobar_capex_presupuesto(uuid,integer,jsonb,text)','EXECUTE') p`)).rows[0].p,false);
 }finally{await db.close();}
});

export const orden=async(db,id,sucursal,estado,renglones)=>{
 await db.query('insert into ordenes_compra(id,folio,sucursal_id,estado) values($1,$2,$3,$4)',[id,'OC-'+id.slice(-4),sucursal,estado]);
 for(const [cantidad,precio] of renglones)await db.query('insert into orden_renglones(orden_id,cantidad,precio) values($1,$2,$3)',[id,cantidad,precio]);
};
export const factura=async(db,id,sucursal,{tipo='ingreso',subtotal,descuento=0,total,estado='por_pagar',uuid_relacionado=null})=>
 db.query('insert into facturas(id,uuid,folio,tipo,sucursal_id,subtotal,descuento,total,estado,uuid_relacionado) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,'U-'+id,'F-'+id.slice(-4),tipo,sucursal,subtotal,descuento,total,estado,uuid_relacionado]);
export const asignar=(db,tipo,doc,renglones,motivo='Asignación de prueba')=>db.query('select public.guardar_capex_asignacion($1,$2,$3::jsonb,$4)',[tipo,doc,JSON.stringify(renglones),motivo]);
const O1='40000000-0000-0000-0000-000000000001',O2='40000000-0000-0000-0000-000000000002',OF='40000000-0000-0000-0000-000000000003';
const F1='50000000-0000-0000-0000-000000000001',FC='50000000-0000-0000-0000-000000000002';

test('capex: asignar documentos valida sucursal, tope, cancelados, duplicados y deja historial',async()=>{
 const db=await preparar();
 try{
  await orden(db,O1,S1,'confirmada',[[10,1000]]);
  await orden(db,O2,S1,'confirmada',[[1,500],[3,0]]);
  await orden(db,OF,null,'confirmada',[[1,100]]);
  await factura(db,F1,S1,{subtotal:5000,descuento:500,total:5220});
  await factura(db,FC,S1,{subtotal:100,total:116,estado:'cancelada'});
  await como(db,ADMIN);
  await asignar(db,'orden',O1,[{proyecto_id:P1,categoria:'obra_civil',monto:6000},{proyecto_id:P1,categoria:'instalaciones',monto:4000,nota:'Tablero'}]);
  assert.equal((await db.query('select sum(monto)::float8 s from capex_asignaciones where orden_id=$1',[O1])).rows[0].s,10000);
  await assert.rejects(asignar(db,'orden',O1,[{proyecto_id:P1,categoria:'obra_civil',monto:6000},{proyecto_id:P1,categoria:'instalaciones',monto:4000.01}]),/pasa el subtotal/);
  await assert.rejects(asignar(db,'orden',O2,[{proyecto_id:P1,categoria:'otros',monto:500.01}]),/pasa el subtotal/);
  await asignar(db,'orden',O2,[{proyecto_id:P1,categoria:'otros',monto:500}]);
  await assert.rejects(asignar(db,'factura',F1,[{proyecto_id:P1,categoria:'otros',monto:4500.01}]),/pasa el subtotal/);
  await asignar(db,'factura',F1,[{proyecto_id:P1,categoria:'otros',monto:4500}]);
  await assert.rejects(asignar(db,'factura',F1,[{proyecto_id:P2,categoria:'otros',monto:1}]),/sucursal del documento/);
  await assert.rejects(asignar(db,'factura',F1,[{proyecto_id:'no-es-uuid',categoria:'otros',monto:1}]),/sucursal del documento/);
  await assert.rejects(asignar(db,'factura',F1,[{proyecto_id:P1,categoria:'pisos',monto:1}]),/Categoría inválida/);
  await assert.rejects(asignar(db,'factura',F1,[{proyecto_id:P1,categoria:'otros',monto:0}]),/Monto inválido/);
  await assert.rejects(asignar(db,'factura',F1,[{proyecto_id:P1,categoria:'otros',monto:'mil'}]),/Monto inválido/);
  await assert.rejects(asignar(db,'factura',F1,[{proyecto_id:P1,categoria:'otros',monto:1},{proyecto_id:P1,categoria:'otros',monto:2}]),/Repetiste/);
  await assert.rejects(asignar(db,'factura',FC,[{proyecto_id:P1,categoria:'otros',monto:1}]),/cancelado/);
  await assert.rejects(asignar(db,'orden',OF,[{proyecto_id:P1,categoria:'otros',monto:1}]),/Oficina/);
  await assert.rejects(asignar(db,'factura','50000000-0000-0000-0000-000000000099',[]),/El documento no existe/);
  await assert.rejects(asignar(db,'factura',F1,[],'abc'),/motivo/);
  await assert.rejects(asignar(db,'remision',F1,[]),/Tipo inválido/);
  await asignar(db,'orden',O1,[],'Ya no es CAPEX');
  assert.equal((await db.query('select count(*)::int n from capex_asignaciones where orden_id=$1',[O1])).rows[0].n,0);
  const h=(await db.query(`select anterior,nuevo,motivo from capex_asignacion_historial where documento_tipo='orden' and documento_id=$1 order by fecha,id`,[O1])).rows;
  assert.equal(h.length,2);
  assert.equal(h[0].anterior.length,0);assert.equal(h[0].nuevo.length,2);
  assert.equal(h[1].anterior.length,2);assert.equal(h[1].nuevo.length,0);assert.equal(h[1].motivo,'Ya no es CAPEX');
  await como(db,CORP);
  await assert.rejects(asignar(db,'factura',F1,[]),/Solo administración/);
 }finally{await db.close();}
});

const fila=async(db,p,c)=>(await db.query(`select presupuesto::float8,comprometido::float8,facturado::float8,pagado::float8,pagado_con_iva::float8,por_pagar_con_iva::float8,por_ejercer::float8,desviacion::float8
 from capex_resumen where proyecto_id=$1 and categoria=$2`,[p,c])).rows[0];
const pagar=async(db,facturaId,monto,anulado=false)=>{const g=(await db.query('insert into pagos(monto,anulado_en) values($1,$2) returning id',[monto,anulado?new Date().toISOString():null])).rows[0].id;
 await db.query('insert into pago_aplicaciones(pago_id,factura_id,monto) values($1,$2,$3)',[g,facturaId,monto]);};
const id=(p,n)=>`${p}0000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('capex: resumen cruza presupuesto, órdenes, facturas, notas de crédito y pagos',async()=>{
 const db=await preparar();
 try{
  await como(db,ADMIN);
  await db.query('select public.aprobar_capex_presupuesto($1,0,$2::jsonb,$3)',[P1,JSON.stringify({obra_civil:10000,instalaciones:5000}),'Presupuesto inicial']);
  await orden(db,id(4,11),S1,'confirmada',[[1,8000]]);
  await asignar(db,'orden',id(4,11),[{proyecto_id:P1,categoria:'obra_civil',monto:8000}]);
  await factura(db,id(5,11),S1,{subtotal:3000,total:3480});
  await db.query('insert into factura_ordenes values($1,$2)',[id(5,11),id(4,11)]);
  await asignar(db,'factura',id(5,11),[{proyecto_id:P1,categoria:'obra_civil',monto:3000}]);
  await pagar(db,id(5,11),1740);
  await factura(db,id(5,12),S1,{subtotal:2000,total:2320});
  await asignar(db,'factura',id(5,12),[{proyecto_id:P1,categoria:'instalaciones',monto:2000}]);
  await pagar(db,id(5,12),2320,true);
  await factura(db,id(5,13),S1,{tipo:'egreso',subtotal:500,total:580,uuid_relacionado:id(5,11)});
  await asignar(db,'factura',id(5,13),[{proyecto_id:P1,categoria:'obra_civil',monto:500}]);
  await factura(db,id(5,14),S1,{subtotal:1000,total:1160});
  await asignar(db,'factura',id(5,14),[{proyecto_id:P1,categoria:'obra_civil',monto:1000}]);
  await db.query(`update facturas set estado='cancelada' where id=$1`,[id(5,14)]);
  await orden(db,id(4,12),S1,'borrador',[[1,700]]);
  await asignar(db,'orden',id(4,12),[{proyecto_id:P1,categoria:'instalaciones',monto:700}]);
  // Total 0 (todo retenido): no debe dividir entre cero.
  await factura(db,id(5,15),S1,{subtotal:100,total:0});
  await asignar(db,'factura',id(5,15),[{proyecto_id:P1,categoria:'otros',monto:100}]);
  assert.deepEqual(await fila(db,P1,'obra_civil'),{presupuesto:10000,comprometido:5000,facturado:2500,pagado:1500,pagado_con_iva:1740,por_pagar_con_iva:1160,por_ejercer:2500,desviacion:-2500});
  assert.deepEqual(await fila(db,P1,'instalaciones'),{presupuesto:5000,comprometido:0,facturado:2000,pagado:0,pagado_con_iva:0,por_pagar_con_iva:2320,por_ejercer:3000,desviacion:-3000});
  assert.deepEqual(await fila(db,P1,'otros'),{presupuesto:0,comprometido:0,facturado:100,pagado:0,pagado_con_iva:0,por_pagar_con_iva:0,por_ejercer:-100,desviacion:100});
  assert.deepEqual(await fila(db,P1,'mobiliario'),{presupuesto:0,comprometido:0,facturado:0,pagado:0,pagado_con_iva:0,por_pagar_con_iva:0,por_ejercer:0,desviacion:0});
  await db.query(`update ordenes_compra set estado='cerrada' where id=$1`,[id(4,11)]);
  assert.equal((await fila(db,P1,'obra_civil')).comprometido,0);
 }finally{await db.close();}
});

test('capex: reparto 60/40 prorratea pago e IVA; sin presupuesto no hay desviación',async()=>{
 const db=await preparar();
 try{
  await como(db,ADMIN);
  await factura(db,id(5,21),S2,{subtotal:10000,total:11600});
  await asignar(db,'factura',id(5,21),[{proyecto_id:P2,categoria:'equipo_cocina',monto:6000},{proyecto_id:P2,categoria:'mobiliario',monto:4000}]);
  await pagar(db,id(5,21),5800);
  assert.deepEqual(await fila(db,P2,'equipo_cocina'),{presupuesto:null,comprometido:0,facturado:6000,pagado:3000,pagado_con_iva:3480,por_pagar_con_iva:3480,por_ejercer:null,desviacion:null});
  assert.deepEqual(await fila(db,P2,'mobiliario'),{presupuesto:null,comprometido:0,facturado:4000,pagado:2000,pagado_con_iva:2320,por_pagar_con_iva:2320,por_ejercer:null,desviacion:null});
 }finally{await db.close();}
});

test('capex: una factura de dos órdenes no deja comprometido negativo',async()=>{
 const db=await preparar();
 try{
  await como(db,ADMIN);
  await orden(db,id(4,31),S1,'confirmada',[[1,1000]]);
  await orden(db,id(4,32),S1,'confirmada',[[1,1000]]);
  for(const o of [id(4,31),id(4,32)])await asignar(db,'orden',o,[{proyecto_id:P1,categoria:'mobiliario',monto:1000}]);
  await factura(db,id(5,31),S1,{subtotal:1500,total:1740});
  for(const o of [id(4,31),id(4,32)])await db.query('insert into factura_ordenes values($1,$2)',[id(5,31),o]);
  await asignar(db,'factura',id(5,31),[{proyecto_id:P1,categoria:'mobiliario',monto:1500}]);
  const f=await fila(db,P1,'mobiliario');
  assert.equal(f.comprometido,0);
  assert.equal(f.facturado,1500);
 }finally{await db.close();}
});

test('capex: equivalencias cubren todos los pares de la carga de Zapopan-1',async()=>{
 const db=await preparar();
 try{
  const carga=load('supabase/cargas/inversion_zapopan_1.sql');
  const pares=new Set([...carga.matchAll(/"tipo": "([^"]*)", "categoria": "([^"]*)"/g)].map(m=>m[1]+'|'+m[2]));
  assert.equal(pares.size,23);
  const filas=(await db.query('select tipo,categoria_origen from capex_equivalencias_historico')).rows.map(r=>r.tipo+'|'+r.categoria_origen);
  assert.deepEqual([...filas].sort(),[...pares].sort());
 }finally{await db.close();}
});

test('capex: histórico agrupa por categoría, excluye lo que no es CAPEX y admin ajusta',async()=>{
 const db=await preparar();
 try{
  const detalles=[
   {id:'D1',tipo:'1. CAPEX – Activo fijo',categoria:'Mobiliario',monto:1000},
   {id:'D2',tipo:'1. CAPEX – Activo fijo',categoria:'Equipo de cocina mayor',monto:2000.5},
   {id:'D3',tipo:'3. Gastos preoperativos',categoria:'Renta',monto:500},
   {id:'D4',tipo:'X',categoria:'Nueva',monto:300}];
  await db.query(`insert into inversion_apertura_fuentes(sucursal_id,nombre,fecha,total,datos) values($1,'Zoho','2026-08-01',3800.5,$2::jsonb)`,[S2,JSON.stringify({detalles})]);
  const hist=async()=>Object.fromEntries((await db.query('select categoria,monto::float8 m from capex_historico order by categoria')).rows.map(r=>[r.categoria,r.m]));
  assert.deepEqual(await hist(),{equipo_cocina:2000.5,mobiliario:1000,otros:300});
  await como(db,ADMIN);
  await db.query(`select public.guardar_capex_equivalencia('X','Nueva','tecnologia')`);
  assert.deepEqual(await hist(),{equipo_cocina:2000.5,mobiliario:1000,tecnologia:300});
  await db.query(`select public.guardar_capex_equivalencia('X','Nueva',null)`);
  assert.deepEqual(await hist(),{equipo_cocina:2000.5,mobiliario:1000});
  await assert.rejects(db.query(`select public.guardar_capex_equivalencia('X','Nueva','pisos')`),/Categoría inválida/);
  await como(db,CORP);
  await assert.rejects(db.query(`select public.guardar_capex_equivalencia('X','Nueva','otros')`),/Solo administración/);
 }finally{await db.close();}
});
