import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HERRAMIENTAS,INSTRUCCIONES,validarArgumentos,absolutizar} from './herramientas.ts';

const SUC='0c9a8b7e-1234-4abc-8def-0123456789ab';
test('herramientas: trece, con esquema cerrado',()=>{
 assert.deepEqual(HERRAMIENTAS.map(h=>h.name),['sucursales','ventas','productos','bi','tiempos','por_pagar','pagos','compras','ordenes','cortes','costos','manuales','pl']);
 for(const h of HERRAMIENTAS){assert.equal((h.inputSchema as {additionalProperties:boolean}).additionalProperties,false,h.name);assert.ok(h.description.length>20,h.name);}
 assert.match(INSTRUCCIONES,/no es cero/);
 assert.match(HERRAMIENTAS.find(h=>h.name==='productos')!.description,/porSabor/);
});
test('validar: casos válidos',()=>{
 assert.deepEqual(validarArgumentos('sucursales',{}),{herramienta:'sucursales'});
 assert.deepEqual(validarArgumentos('ventas',{desde:'2026-11-01',hasta:'2026-11-07'}),{herramienta:'ventas',desde:'2026-11-01',hasta:'2026-11-07',sucursal:null});
 assert.deepEqual(validarArgumentos('cortes',{desde:'2026-11-01',hasta:'2026-11-01',sucursal:SUC.toUpperCase()}),{herramienta:'cortes',desde:'2026-11-01',hasta:'2026-11-01',sucursal:SUC});
 for(const vacio of ['',null])assert.equal((validarArgumentos('ventas',{desde:'2026-11-01',hasta:'2026-11-02',sucursal:vacio}) as {sucursal:string|null}).sucursal,null);
 assert.deepEqual(validarArgumentos('costos',{busqueda:' Pepperoni ',fecha:'2026-11-10'}),{herramienta:'costos',busqueda:'Pepperoni',fecha:'2026-11-10'});
 assert.deepEqual(validarArgumentos('manuales',{busqueda:'apertura'}),{herramienta:'manuales',busqueda:'apertura'});
 assert.deepEqual(validarArgumentos('pl',{tipo:'mes',clave:'2026-10'}),{herramienta:'pl',tipo:'mes',clave:'2026-10',sucursal:null});
 assert.deepEqual(validarArgumentos('pl',{tipo:'semana',clave:'2026-W45',sucursal:SUC}),{herramienta:'pl',tipo:'semana',clave:'2026-W45',sucursal:SUC});
});
test('validar: productos con búsqueda y categoría opcionales',()=>{
 assert.deepEqual(validarArgumentos('productos',{desde:'2026-11-09',hasta:'2026-11-15'}),{herramienta:'productos',desde:'2026-11-09',hasta:'2026-11-15',sucursal:null,busqueda:null,categoria:null});
 assert.deepEqual(validarArgumentos('productos',{desde:'2026-11-09',hasta:'2026-11-15',sucursal:SUC,busqueda:' Pepperoni ',categoria:'pizza'}),{herramienta:'productos',desde:'2026-11-09',hasta:'2026-11-15',sucursal:SUC,busqueda:'Pepperoni',categoria:'pizza'});
 for(const vacio of ['',null])assert.deepEqual(validarArgumentos('productos',{desde:'2026-11-09',hasta:'2026-11-09',busqueda:vacio,categoria:vacio}),{herramienta:'productos',desde:'2026-11-09',hasta:'2026-11-09',sucursal:null,busqueda:null,categoria:null});
 const casos:[unknown,RegExp][]=[[{desde:'2026-11-15',hasta:'2026-11-09'},/1 a 31 días/],[{desde:'2026-11-09',hasta:'2026-11-15',busqueda:'p'},/2 a 100 caracteres/],[{desde:'2026-11-09',hasta:'2026-11-15',categoria:'pizzas'},/categoria inválida/],[{desde:'2026-11-09',hasta:'2026-11-15',limite:5},/no permitido: limite/]];
 for(const [a,re] of casos)assert.throws(()=>validarArgumentos('productos',a),re,JSON.stringify(a));
});
test('validar: bi hasta 93 días, canal y comparación',()=>{
 assert.deepEqual(validarArgumentos('bi',{desde:'2026-11-09',hasta:'2026-11-15'}),{herramienta:'bi',desde:'2026-11-09',hasta:'2026-11-15',sucursal:null,canal:null,comparar:'anterior',dias:null});
 assert.deepEqual(validarArgumentos('bi',{desde:'2026-08-01',hasta:'2026-10-31',sucursal:SUC,canal:'rappi',comparar:'anio'}),{herramienta:'bi',desde:'2026-08-01',hasta:'2026-10-31',sucursal:SUC,canal:'rappi',comparar:'anio',dias:null});
 assert.deepEqual(validarArgumentos('bi',{desde:'2026-11-16',hasta:'2026-11-19',comparar:'semana',dias:[6,5,5]}),{herramienta:'bi',desde:'2026-11-16',hasta:'2026-11-19',sucursal:null,canal:null,comparar:'semana',dias:[5,6]});
 assert.equal((validarArgumentos('bi',{desde:'2026-11-16',hasta:'2026-11-19',dias:[]}) as {dias:unknown}).dias,null);
 assert.equal((validarArgumentos('bi',{desde:'2026-11-09',hasta:'2026-11-15',canal:'',comparar:null}) as {canal:unknown}).canal,null);
 const casos:[unknown,RegExp][]=[[{desde:'2026-08-01',hasta:'2026-11-02'},/1 a 93 días/],[{desde:'2026-11-15',hasta:'2026-11-09'},/1 a 93 días/],[{desde:'2026-11-09',hasta:'2026-11-15',canal:'uber'},/canal/],[{desde:'2026-11-09',hasta:'2026-11-15',comparar:'mes'},/comparar/],[{desde:'2026-11-09',hasta:'2026-11-15',dias:[8]},/dias/],[{desde:'2026-11-09',hasta:'2026-11-15',dias:'viernes'},/dias/],[{desde:'2026-02-30',hasta:'2026-03-01'},/Fecha inválida/]];
 for(const [a,re] of casos)assert.throws(()=>validarArgumentos('bi',a),re,JSON.stringify(a));
});
test('validar: tiempos hasta 31 días',()=>{
 assert.deepEqual(validarArgumentos('tiempos',{desde:'2026-11-09',hasta:'2026-11-15',sucursal:SUC}),{herramienta:'tiempos',desde:'2026-11-09',hasta:'2026-11-15',sucursal:SUC});
 assert.throws(()=>validarArgumentos('tiempos',{desde:'2026-10-01',hasta:'2026-11-15'}),/1 a 31 días/);
 assert.throws(()=>validarArgumentos('tiempos',{desde:'2026-11-09',hasta:'2026-11-15',canal:'pos'}),/no permitido: canal/);
});
test('validar: errores claros sin llegar a Supabase',()=>{
 const casos:[string,unknown,RegExp][]=[
  ['borrar',{},/Herramienta desconocida/],
  ['ventas',[],/Argumentos inválidos/],
  ['sucursales',{x:1},/no permitido: x/],
  ['ventas',{desde:'2026-11-07',hasta:'2026-11-01'},/1 a 31 días/],
  ['ventas',{desde:'2026-10-01',hasta:'2026-11-15'},/1 a 31 días/],
  ['ventas',{desde:'2026-02-30',hasta:'2026-03-01'},/Fecha inválida/],
  ['ventas',{desde:'2026-11-01',hasta:'2026-11-02',sucursal:'Zapopan-1 La Calma'},/herramienta sucursales/],
  ['ventas',{desde:'2026-11-01',hasta:'2026-11-02',extra:true},/no permitido: extra/],
  ['costos',{busqueda:'a',fecha:'2026-11-01'},/2 a 100 caracteres/],
  ['manuales',{busqueda:'x'.repeat(101)},/2 a 100 caracteres/],
  ['pl',{tipo:'año',clave:'2026'},/mes o semana/],
  ['pl',{tipo:'mes',clave:'2026-13'},/clave inválida/],
  ['pl',{tipo:'semana',clave:'2026-10'},/clave inválida/],
 ];
 for(const [n,a,re] of casos)assert.throws(()=>validarArgumentos(n,a),re,`${n} ${JSON.stringify(a)}`);
});
test('absolutizar: fuente y href relativos a URL completa, sin tocar lo demás',()=>{
 const r=absolutizar({fuente:'/ventas?x=1',nota:'/no-es-enlace',lista:[{href:'/conocimiento/manuales/7',titulo:'M'}],externo:{href:'https://otra.com/a'},doble:{href:'//evil.com'},n:5},'https://dodo.test');
 assert.deepEqual(r,{fuente:'https://dodo.test/ventas?x=1',nota:'/no-es-enlace',lista:[{href:'https://dodo.test/conocimiento/manuales/7',titulo:'M'}],externo:{href:'https://otra.com/a'},doble:{href:'//evil.com'},n:5});
});

test('validar: compras y pagos con proveedor por nombre y sucursal',()=>{
 assert.deepEqual(validarArgumentos('por_pagar',{}),{herramienta:'por_pagar',sucursal:null,proveedor:null});
 assert.deepEqual(validarArgumentos('por_pagar',{proveedor:' Lácteos ',sucursal:SUC}),{herramienta:'por_pagar',sucursal:SUC,proveedor:'Lácteos'});
 assert.deepEqual(validarArgumentos('ordenes',{proveedor:''}),{herramienta:'ordenes',sucursal:null,proveedor:null});
 assert.deepEqual(validarArgumentos('pagos',{desde:'2026-10-01',hasta:'2026-10-31'}),{herramienta:'pagos',desde:'2026-10-01',hasta:'2026-10-31',sucursal:null,proveedor:null});
 assert.deepEqual(validarArgumentos('compras',{desde:'2026-08-01',hasta:'2026-10-31',proveedor:'harinas'}),{herramienta:'compras',desde:'2026-08-01',hasta:'2026-10-31',sucursal:null,proveedor:'harinas'});
 const casos:[string,unknown,RegExp][]=[['pagos',{desde:'2026-07-01',hasta:'2026-10-31'},/1 a 93 días/],['compras',{hasta:'2026-10-31'},/Fecha inválida/],['por_pagar',{proveedor:'x'},/2 a 100 caracteres/],['ordenes',{estado:'cerrada'},/no permitido: estado/],['por_pagar',{rfc:'ABC'},/no permitido: rfc/]];
 for(const [n,a,re] of casos)assert.throws(()=>validarArgumentos(n,a),re,n+JSON.stringify(a));
});
test('herramientas: compras y pagos avisan que no traen datos bancarios ni RFC',()=>{
 for(const n of ['por_pagar','pagos','compras','ordenes'])assert.match(HERRAMIENTAS.find(h=>h.name===n)!.description,/proveedor/,n);
 assert.match(HERRAMIENTAS.find(h=>h.name==='por_pagar')!.description,/estimad/);
});
