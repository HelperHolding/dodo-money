import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
// Cuerpo de una función exportada (hasta la siguiente exportación o el final del archivo).
const cuerpo=(fuente,nombre)=>{const i=fuente.indexOf(`export async function ${nombre}(`);assert.ok(i>=0,`no existe ${nombre}`);const j=fuente.indexOf('export ',i+10);return fuente.slice(i,j<0?undefined:j);};
const antes=(texto,a,b)=>{const i=texto.indexOf(a),j=texto.indexOf(b);assert.ok(i>=0,`falta ${a}`);assert.ok(j>=0,`falta ${b}`);assert.ok(i<j,`${a} debe ir antes de ${b}`);};

test('UUID único: el helper consulta buscar_uuid_cfdi',()=>{
 assert.match(load('lib/compras/uuidCfdi.ts'),/rpc\("buscar_uuid_cfdi"/);
});

test('UUID único: alta o importación de facturas con XML avisa antes de subir y registrar',()=>{
 const f=cuerpo(load('app/compras/facturas/acciones.ts'),'subirFacturas');
 antes(f,'buscarUuidRepetido(','.upload(');antes(f,'buscarUuidRepetido(','rpc("registrar_factura"');
 assert.match(f,/avisoDeError\(error\)/,'si el trigger salta por una carrera se muestra su mensaje y su liga');
 assert.match(load('app/compras/facturas/subir/FormSubir.tsx'),/r\.liga/);
});

test('UUID único: la captura manual del UUID avisa antes de guardar, excluyendo la propia factura',()=>{
 const f=cuerpo(load('app/compras/facturas/acciones.ts'),'guardarUuidManualFactura');
 antes(f,'buscarUuidRepetido(','guardar_uuid_manual_factura');
 assert.match(f,/buscarUuidRepetido\(supabase,.*,id\)/);
 assert.match(load('app/compras/facturas/[id]/page.tsx'),/<Aviso[^>]*liga=/);
});

test('UUID único: gasto de caja chica avisa antes de guardar al registrar y al editar',()=>{
 const r=cuerpo(load('app/(app)/caja-chica/actions.ts'),'registrarGasto');
 antes(r,'buscarUuidRepetido(','.upload(');antes(r,'buscarUuidRepetido(','rpc("registrar_gasto_sucursal"');
 const a=cuerpo(load('app/(app)/caja-chica/administrar.ts'),'administrarGasto');
 antes(a,'buscarUuidRepetido(','editar_anular_gasto_admin');
 assert.match(a,/buscarUuidRepetido\(supabase,.*,t\('id'\)\)/);
 for(const f of [r,a])assert.match(f,/avisoDeError\(error\)/);
 assert.match(load('app/(app)/caja-chica/page.tsx'),/<Aviso[^>]*liga=/);
});

test('UUID único: el aviso muestra la liga solo si es una ruta interna segura',()=>{
 const aviso=load('components/Aviso.tsx');
 assert.match(aviso,/ligaSegura\(liga\)/);
 // El componente común no depende de Compras: la regla de ligas vive en un módulo neutral.
 assert.match(aviso,/from "@\/lib\/ligas"/);assert.doesNotMatch(aviso,/lib\/compras/);
});
