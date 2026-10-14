import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node strip-types.
import {unidadesRappi,categoriaRappi} from './rappiProductos.ts';
import type {RappiGuardada} from './rappi';
const orden=(id:string,estado:RappiGuardada['estado'],sumar:boolean,lineas:[string,string,number][]):RappiGuardada=>({rappi_id:id,sucursal_id:'s',tienda_id:'t',fecha:'2026-10-13',hora:'12:00',estado,sumar,archivo:'x',registrado_en:'',pago:'',bruto:0,descuento_restaurante:0,subtotal_restaurante:0,descuento_rappi:0,facturar:0,rappi_lineas:lineas.map(([nombre,opciones,cantidad],i)=>({rappi_id:id,linea:i+1,producto_id:i+1,nombre,opciones,cantidad,importe:0}))});
test('Rappi unidades: consolida variantes, todas las fuentes, excluye canceladas y evita duplicados',()=>{
 const a=orden('1','Finalizado',true,[['Pepperoni','30 cm',2],['Dip de Ranch','',1]]);
 const r=unidadesRappi([a,a,orden('2','Finalizado',false,[['Pepperoni','35 cm',1]]),orden('3','Cancelado',true,[['Pepperoni','30 cm',9]])],[],[]);
 assert.equal(r.ordenes,2);assert.equal(r.enDodo,1);assert.equal(r.unidades,4);assert.equal(r.filas[0].unidades,3);assert.equal(r.filas[0].variantes.length,2);assert.equal(r.filas[0].ordenes,2);
 assert.equal(r.grupos.reduce((s,g)=>s+g.unidades,0),r.unidades);
});
test('Rappi categorías: catálogo primero, combos sin desarmar y desconocidos visibles',()=>{
 assert.deepEqual(categoriaRappi('Artículo vinculado','bebida'),{categoria:'bebida',inferido:false});
 assert.equal(categoriaRappi('Completo y Dulce','pizza').categoria,'combo');
 assert.equal(categoriaRappi('Nuevo producto',null).categoria,'sin_categoria');
 assert.equal(unidadesRappi([],[],[]).unidades,0);
});
