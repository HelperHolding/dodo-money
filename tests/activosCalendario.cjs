const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const base=fs.readFileSync('tests/pagosVista.cjs','utf8');
const {CalendarioMantenimiento}=new Function('require',base.slice(0,base.indexOf('const {CalendarioPagos}'))+"return cargar('app/activos/CalendarioMantenimiento.tsx');")(require);
const servicio={id:'s1',activo_id:'a1',activoNombre:'Horno de cocina',codigo:1,sucursal:'Zapopan-1',tipo:'preventivo',tarea:'Limpieza de horno',programado:'2026-10-10',estado:'pendiente',realizado:null,costo:null,tecnico:'Proveedor técnico',evidencia:null,revision:1};
test('calendario de activos: mes, vencidos, filtro inicial y enlace al servicio',()=>{
 const html=renderToStaticMarkup(React.createElement(CalendarioMantenimiento,{hoy:'2026-10-16',servicios:[servicio,{...servicio,id:'cancelado',estado:'anulado',tarea:'Trabajo cancelado'},{...servicio,id:'otro',programado:'2026-11-01',tarea:'Trabajo de noviembre'}]}));
 assert.match(html,/octubre de 2026/);assert.match(html,/Limpieza de horno/);assert.match(html,/Vencido/);assert.match(html,/1 pendientes vencidos/);assert.match(html,/activos\/a1#servicio-s1/);assert.match(html,/Zapopan-1/);assert.ok(!html.includes('Trabajo cancelado'));assert.ok(!html.includes('Trabajo de noviembre'));
});
test('calendario de activos: completado usa fecha real y conserva fecha programada',()=>{
 const html=renderToStaticMarkup(React.createElement(CalendarioMantenimiento,{hoy:'2026-10-16',servicios:[{...servicio,estado:'completado',programado:'2026-09-30',realizado:'2026-10-03'}]}));
 assert.match(html,/Completado/);assert.match(html,/Realizado/);assert.match(html,/3 oct 2026/);assert.match(html,/30 sep 2026/);assert.match(html,/0 pendientes vencidos/);
});
