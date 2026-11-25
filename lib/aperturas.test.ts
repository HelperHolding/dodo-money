import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resumenApertura,estadosPara,type ItemApertura} from './aperturas.ts';
const item=(d:Partial<ItemApertura>):ItemApertura=>({id:'i',proyecto_id:'p',clave:'e',tipo:'equipo',etapa:'P4',nombre:'Horno',fuente:'plano',original:{},estado:'pedido',responsable:null,inicio:null,fin:null,cantidad:2,recibido:0,precio:100,evidencia:null,notas:null,orden_id:null,factura_id:null,revision:1,categoria:null,...d});
test('aperturas: pedido o recibido no significan verificado; no aplicar sale del avance',()=>{
 const r=resumenApertura([item({}),item({estado:'recibido'}),item({estado:'verificado'}),item({estado:'no_aplica'})]);
 assert.equal(r.total,3);assert.equal(r.terminados,1);assert.equal(r.cotizado,600);
});
test('aperturas: referencia por validar no infla el costo; precio desconocido queda pendiente',()=>{
 const r=resumenApertura([item({tipo:'referencia',estado:'por_validar',cantidad:2000,precio:100}),item({precio:null}),item({cantidad:null})]);
 assert.equal(r.cotizado,0);assert.equal(r.sinPrecio,2);assert.equal(r.porValidar,1);
 assert.ok(!estadosPara('actividad').includes('pedido'));assert.ok(estadosPara('equipo').includes('verificado'));
});

import {indicadoresApertura,grupoApertura} from './aperturas.ts';
test('panel de apertura: el avance es el global ponderado por bloque',()=>{
 const r=indicadoresApertura([item({tipo:'actividad',estado:'completado'}),item({tipo:'actividad',estado:'en_curso'}),item({tipo:'actividad',estado:'no_aplica'}),item({estado:'verificado'})],'2026-10-08');
 // Todo cae en Compras (P4 / equipo): (1 + 1/3 + 1) / 3 = 0.78 → 78.
 assert.equal(r.avance,78);assert.equal(r.terminadas,1);assert.equal(r.actividades.length,2);
 assert.equal(indicadoresApertura([],'2026-10-08').avance,null);
});
test('panel de apertura: recibe parcialmente sin inflar por excedentes ni referencias',()=>{
 const r=indicadoresApertura([item({cantidad:4,recibido:2}),item({cantidad:2,recibido:3}),item({cantidad:null,recibido:10}),item({tipo:'referencia',cantidad:500,recibido:500}),item({estado:'por_validar',cantidad:100})],'2026-10-08');
 assert.equal(r.unidades,6);assert.equal(r.recibidas,4);assert.equal(r.recepcion,67);assert.equal(r.sinCantidad,1);assert.equal(r.porValidar,1);
 assert.equal(indicadoresApertura([],'2026-10-08').recepcion,null);
});
test('panel de apertura: alertas únicas, hoy no vencido y terminados excluidos',()=>{
 const r=indicadoresApertura([item({id:'a',estado:'bloqueado',fin:'2026-10-07'}),item({id:'b',fin:'2026-10-08'}),item({id:'c',estado:'verificado',fin:'2026-10-07'}),item({id:'d',estado:'no_aplica',fin:'2026-10-07'})],'2026-10-08');
 assert.equal(r.alertas.length,1);assert.equal(r.bloqueados.length,1);assert.equal(r.atrasados.length,1);
});
test('panel de apertura: grupos conservan diferencia entre recepción y verificación',()=>{
 assert.equal(grupoApertura(item({estado:'recibido'})),'recibido');
 assert.equal(grupoApertura(item({estado:'verificado'})),'terminado');
 assert.equal(grupoApertura(item({estado:'recibido_parcial'})),'en_curso');
});
import {avanceCategorias,esCategoria} from './aperturas.ts';
test('categorías de apertura: la obra no infla el equipo recibido',()=>{
 const r=indicadoresApertura([item({categoria:'equipo_cocina',cantidad:2,recibido:2,estado:'recibido'}),item({categoria:'pisos',cantidad:30,recibido:0,estado:'por_cotizar'})],'2026-11-02');
 assert.equal(r.unidades,2);assert.equal(r.recepcion,100);assert.equal(r.equipo.length,1);
});
test('categorías de apertura: avance por puntos de etapa, sin no aplica ni por validar',()=>{
 const c=avanceCategorias([item({categoria:'iluminacion',estado:'instalado'}),item({categoria:'iluminacion',estado:'pedido'}),item({categoria:'iluminacion',estado:'no_aplica'}),item({categoria:'iluminacion',estado:'bloqueado'}),item({estado:'verificado'}),item({tipo:'referencia',estado:'cotizado'}),item({tipo:'actividad',estado:'completado'})]);
 const luz=c.find(x=>x.clave==='iluminacion')!;
 assert.equal(luz.conceptos,3);assert.equal(luz.listos,1);assert.equal(luz.porcentaje,50/* instalado 1 + pedido 0.5 + bloqueado 0 = 1.5 / 3 */);assert.equal(luz.pedidos,1);assert.equal(luz.bloqueados,1);assert.equal(luz.obra,true);
 assert.deepEqual(c.map(x=>x.clave),['iluminacion',null]);
 assert.equal(esCategoria('pisos'),true);assert.equal(esCategoria('toString'),false);assert.equal(esCategoria(''),false);
});
import {checklistApertura} from './aperturas.ts';
test('checklist de apertura: módulos por etapa, equipo por categoría y general ponderado por bloque',()=>{
 const c=checklistApertura([
  item({id:'a1',tipo:'actividad',etapa:'P1',estado:'completado'}),item({id:'a2',tipo:'actividad',etapa:'P2',estado:'en_curso'}),item({id:'a3',tipo:'actividad',etapa:'P3',estado:'no_aplica'}),
  item({id:'t1',tipo:'tecnico',etapa:'P2',estado:'completado'}),item({id:'t2',tipo:'tecnico',etapa:'P2',estado:'bloqueado'}),
  item({categoria:'equipo_cocina',estado:'verificado'}),item({categoria:'equipo_cocina',estado:'pedido'}),item({categoria:'equipo_cocina',estado:'por_validar'}),item({estado:'por_cotizar'}),
  item({categoria:'pisos',estado:'instalado'}),item({categoria:'pisos',estado:'instalado'}),item({tipo:'referencia',estado:'cotizado'}),
 ]);
 const [proyecto,compras,obra,apertura]=c.modulos;
 assert.deepEqual(proyecto.lineas.map(l=>[l.nombre,l.marca,l.listos,l.total]),[['Validaciones técnicas','bloqueado',1,2],['Horno','listo',1,1],['Horno','curso',0,1]]);
 // Proyecto: (1 + 1/3 + 1 + 0) / 4 = 0.58 → 58.
 assert.equal(proyecto.porcentaje,58);
 assert.deepEqual(compras.lineas.map(l=>[l.clave,l.marca,l.listos,l.total]),[['equipo_cocina','curso',1,2],['sin','pendiente',0,1]]);
 // Compras: verificado 1 + pedido 0.5 + por cotizar 0 + referencia cotizada 0.25 = 1.75 / 4 → 44.
 assert.equal(compras.porcentaje,44);
 assert.deepEqual(obra.lineas.map(l=>[l.clave,l.marca,l.listos,l.total]),[['pisos','listo',2,2]]);
 // General: (0.20·0.583 + 0.35·0.4375 + 0.30·1) / 0.85 = 0.67 → 67 (Apertura vacía reparte su peso).
 assert.equal(apertura.porcentaje,null);assert.equal(c.general,67);
 assert.deepEqual(checklistApertura([]).general,null);
 assert.deepEqual(proyecto.lineas[0].hijos,['t1','t2']);
 const con=checklistApertura([item({id:'a',tipo:'actividad',etapa:'P1',estado:'completado',categoria:'iluminacion'}),item({id:'b',tipo:'tecnico',etapa:'P2',estado:'en_curso',categoria:'iluminacion'}),item({id:'c',categoria:'iluminacion',estado:'instalado'})]);
 const luz=con.modulos[2].lineas.find(l=>l.clave==='iluminacion')!;
 assert.deepEqual([luz.listos,luz.total,luz.hijos],[2,3,['a','b','c']]);assert.equal(con.modulos[0].lineas.length,0);
 assert.deepEqual(avanceCategorias([item({tipo:'actividad',estado:'completado',categoria:'pisos'}),item({tipo:'actividad',estado:'en_curso',categoria:'pisos'}),item({tipo:'tecnico',estado:'por_validar',categoria:'pisos'})]).map(x=>[x.listos,x.conceptos,x.pedidos]),[[1,3,1]]);assert.equal(proyecto.lineas[1].hijos,undefined);
 const v=checklistApertura([item({tipo:'tecnico',etapa:'P7',estado:'por_validar'}),item({tipo:'tecnico',etapa:'P7',estado:'por_validar'})]).modulos[3].lineas[0];
 assert.deepEqual([v.marca,v.listos,v.total],['pendiente',0,2]);
});
import {datosCambioEstado,validarCambioEstado} from './aperturas.ts';
test('checklist: el cambio rápido pide lo mismo que la base y conserva lo capturado',()=>{
 const sin={evidencia:'',cantidad:'',recibido:''};
 assert.equal(validarCambioEstado('actividad',{...sin,estado:'en_curso'}),null);
 assert.equal(validarCambioEstado('actividad',{...sin,estado:'completado'}),'Registra evidencia o el motivo de no aplicar.');
 assert.equal(validarCambioEstado('actividad',{...sin,estado:'completado',evidencia:'Contrato firmado'}),null);
 assert.equal(validarCambioEstado('actividad',{...sin,estado:'pedido'}),'Estado inválido para este registro.');
 assert.equal(validarCambioEstado('equipo',{...sin,estado:'recibido'}),'Confirma la cantidad necesaria.');
 assert.equal(validarCambioEstado('equipo',{...sin,estado:'instalado',cantidad:'4',recibido:'3'}),'Confirma la cantidad necesaria y la recepción completa.');
 assert.equal(validarCambioEstado('equipo',{...sin,estado:'recibido_parcial',cantidad:'4',recibido:'4'}),'La recepción parcial debe ser mayor que cero y menor a la cantidad necesaria.');
 assert.equal(validarCambioEstado('equipo',{...sin,estado:'verificado',cantidad:'4',recibido:'4',evidencia:'Prueba de arranque'}),null);
 const i=item({tipo:'actividad',responsable:'Julio',inicio:'2026-11-01',fin:'2026-11-05',cantidad:null,precio:null,orden_id:'o1'});
 assert.deepEqual(datosCambioEstado(i,{estado:'completado',evidencia:'Listo en obra',notas:'',cantidad:'9'}),{estado:'completado',responsable:'Julio',inicio:'2026-11-01',fin:'2026-11-05',cantidad:'',recibido:'0',precio:'',evidencia:'Listo en obra',notas:'',orden_id:'o1',factura_id:''});
 assert.equal(datosCambioEstado(item({cantidad:2,recibido:0,precio:150}),{estado:'recibido',evidencia:'',notas:'',cantidad:'2',recibido:'2'}).recibido,'2');
});
import {aItemChecklist,fusionarItems} from './aperturas.ts';
test('checklist en vivo: gana la revisión más nueva y los números de Realtime se normalizan',()=>{
 const a=aItemChecklist({...item({id:'x',revision:2,estado:'pedido'}),original:{unidad:'m²'}});
 assert.deepEqual([a.cantidad,a.recibido,a.unidad,a.revision],[2,0,'m²',2]);
 const desdeRealtime=aItemChecklist({...item({id:'x',estado:'recibido'}),cantidad:'2' as unknown as number,recibido:'2' as unknown as number,revision:'3' as unknown as number,original:null});
 assert.deepEqual([desdeRealtime.cantidad,desdeRealtime.recibido,desdeRealtime.revision,desdeRealtime.unidad],[2,2,3,null]);
 const base={x:a};
 assert.equal(fusionarItems(base,[{...a,estado:'cotizado',revision:1}]),base);
 assert.equal(fusionarItems(base,[a]),base);
 const nuevo=fusionarItems(base,[desdeRealtime,{...a,id:'y',revision:1}]);
 assert.deepEqual([nuevo.x.estado,nuevo.y.id,Object.keys(nuevo).length],['recibido','y',2]);
});

import {avancePorProyecto,cuentaRegresiva,ordenarProyectos} from './aperturas.ts';
test('portada: avance por proyecto con el global ponderado (no aplica fuera; listas = partidas con 1 punto)',()=>{
 const x=(proyecto_id:string,tipo:ItemApertura['tipo'],etapa:ItemApertura['etapa'],estado:string)=>({proyecto_id,tipo,etapa,estado,categoria:null});
 const a=avancePorProyecto([x('a','actividad','P1','completado'),x('a','equipo','P4','verificado'),x('a','actividad','P1','en_curso'),x('a','actividad','P1','no_aplica'),x('b','actividad','P1','pendiente')]);
 // a: Proyecto (1 + 1/3) / 2 = 0.667 y Compras 1 → (0.20·0.667 + 0.35·1) / 0.55 = 0.88 → 88.
 assert.deepEqual(a,{a:{listos:2,total:3,porcentaje:88},b:{listos:0,total:1,porcentaje:0}});
});
test('portada, checklist y avance general dan el mismo % para los mismos items',()=>{
 const items=[
  item({id:'a1',tipo:'actividad',etapa:'P1',estado:'completado'}),item({id:'a2',tipo:'actividad',etapa:'P2',estado:'por_cerrar'}),item({id:'a3',tipo:'actividad',etapa:'P6',estado:'en_curso'}),
  item({id:'t1',tipo:'tecnico',etapa:'P5',estado:'en_curso'}),item({id:'t2',tipo:'tecnico',etapa:'P2',estado:'bloqueado'}),
  item({categoria:'equipo_cocina',estado:'recibido'}),item({categoria:'equipo_cocina',estado:'pedido'}),item({estado:'por_cotizar'}),
  item({categoria:'pisos',estado:'instalado'}),item({categoria:'iluminacion',estado:'aprobado'}),item({tipo:'referencia',estado:'cotizado'}),
 ];
 const g=avanceApertura(items).general;
 assert.ok(g!==null&&g>0&&g<100);
 assert.equal(checklistApertura(items).general,g);
 assert.equal(avancePorProyecto(items).p.porcentaje,g);
 const bloques=Object.fromEntries(avanceApertura(items).bloques.map(b=>[b.clave,b.porcentaje]));
 for(const m of checklistApertura(items).modulos)assert.equal(m.porcentaje,bloques[m.clave],m.clave);
});
test('portada: cuenta regresiva según la ventana objetivo y el avance',()=>{
 const listo={terminados:5,total:5},falta={terminados:2,total:5};
 assert.deepEqual(cuentaRegresiva('2026-12-15','2026-12-20','2026-11-18',falta),{texto:'Abre en 27 días',tono:'info'});
 assert.deepEqual(cuentaRegresiva('2026-11-25','2026-11-30','2026-11-18',falta),{texto:'Abre en 7 días',tono:'aviso'});
 assert.deepEqual(cuentaRegresiva('2026-11-19','2026-11-30','2026-11-18',falta),{texto:'Abre mañana',tono:'aviso'});
 assert.deepEqual(cuentaRegresiva('2026-11-15','2026-11-20','2026-11-18',falta),{texto:'En ventana de apertura',tono:'aviso'});
 assert.deepEqual(cuentaRegresiva('2026-11-01','2026-11-05','2026-11-18',listo),{texto:'Abierta',tono:'ok'});
 assert.deepEqual(cuentaRegresiva('2026-11-01','2026-11-05','2026-11-18',falta),{texto:'Objetivo vencido',tono:'alerta'});
 assert.deepEqual(cuentaRegresiva('2026-11-01','2026-11-05','2026-11-18',{terminados:0,total:0}),{texto:'Objetivo vencido',tono:'alerta'});
});
test('portada: primero la apertura más próxima; las ya pasadas al final, la más reciente primero',()=>{
 const p=(id:string,objetivo_hasta:string)=>({id,objetivo_desde:objetivo_hasta,objetivo_hasta});
 const orden=ordenarProyectos([p('vieja','2026-09-01'),p('lejana','2027-02-01'),p('reciente','2026-11-10'),p('proxima','2026-12-15')],'2026-11-18').map(x=>x.id);
 assert.deepEqual(orden,['proxima','lejana','reciente','vieja']);
});

test('aperturas: atrasados usa el criterio de listo del Checklist y la fecha de inicio si no hay fin',()=>{
 const r=indicadoresApertura([
  item({id:'a',estado:'instalado',cantidad:1,recibido:1,fin:'2026-11-01'}),   // listo: no atrasado
  item({id:'b',tipo:'actividad',estado:'pendiente',inicio:'2026-11-01'}),     // solo inicio pasado: atrasado
  item({id:'c',tipo:'actividad',estado:'completado',fin:'2026-11-01'}),
 ],'2026-11-24');
 assert.deepEqual(r.atrasados.map(i=>i.id),['b']);
 assert.deepEqual(r.alertas.map(i=>i.id),['b']);
});

import {puntosItem,bloqueDe,avanceApertura,nombreEstado,conteoEtapasEquipo} from './aperturas.ts';
test('puntosItem: etapas de equipo y pasos de actividad', () => {
  const e = (estado: string) => puntosItem({ tipo: 'equipo', estado });
  assert.deepEqual(['por_validar','por_cotizar','bloqueado','cotizado','aprobado','pedido','recibido_parcial','recibido','instalado','verificado'].map(e), [0,0,0,0.25,0.25,0.5,0.5,0.75,1,1]);
  const a = (estado: string) => puntosItem({ tipo: 'actividad', estado });
  assert.deepEqual(['pendiente','por_validar','bloqueado','en_curso','por_cerrar','completado'].map(a), [0,0,0,1/3,2/3,1]);
  assert.equal(puntosItem({ tipo: 'tecnico', estado: 'por_cerrar' }), 2/3);
});

test('bloqueDe: etapa y categoría de obra', () => {
  assert.equal(bloqueDe({ tipo: 'actividad', etapa: 'P2', categoria: null }), 'proyecto');
  assert.equal(bloqueDe({ tipo: 'equipo', etapa: 'P4', categoria: 'equipo_cocina' }), 'compras');
  assert.equal(bloqueDe({ tipo: 'equipo', etapa: 'P4', categoria: 'contactos' }), 'obra');
  assert.equal(bloqueDe({ tipo: 'actividad', etapa: 'P5', categoria: null }), 'obra');
  assert.equal(bloqueDe({ tipo: 'actividad', etapa: 'P7', categoria: null }), 'apertura');
  assert.equal(bloqueDe({ tipo: 'equipo', etapa: 'P5', categoria: null }), 'compras');
  assert.equal(bloqueDe({ tipo: 'equipo', etapa: 'P2', categoria: null }), 'compras');
  assert.equal(bloqueDe({ tipo: 'referencia', etapa: 'P2', categoria: null }), 'compras');
  assert.equal(bloqueDe({ tipo: 'actividad', etapa: 'P5', categoria: null }), 'obra');
});

test('avanceApertura: pondera 20/35/30/15, reparte bloques vacíos y topa en 99', () => {
  const it = (tipo: string, etapa: string, estado: string, categoria: string | null = null) => ({ tipo, etapa, estado, categoria }) as never;
  const r = avanceApertura([it('actividad','P1','completado'), it('equipo','P4','pedido'), it('actividad','P5','en_curso'), it('actividad','P7','pendiente')]);
  assert.deepEqual(r.bloques.map(b => [b.clave, b.porcentaje]), [['proyecto',100],['compras',50],['obra',33],['apertura',0]]);
  assert.equal(r.general, Math.round(20*1 + 35*0.5 + 30*(1/3) + 15*0)); // 48
  const sinObra = avanceApertura([it('actividad','P1','completado'), it('equipo','P4','cotizado')]);
  assert.equal(sinObra.general, Math.round((0.20*1 + 0.35*0.25) / 0.55 * 100)); // 52
  assert.equal(avanceApertura([]).general, null);
  assert.equal(avanceApertura([it('actividad','P1','no_aplica'), it('equipo','P4','por_validar')]).general, null);
  const casi = avanceApertura([...Array(199)].map(() => it('actividad','P1','completado')).concat([it('actividad','P1','por_cerrar')]));
  assert.equal(casi.general, 99); assert.equal(casi.completo, false);
  const todo = avanceApertura([it('actividad','P1','completado'), it('equipo','P4','verificado')]);
  assert.equal(todo.general, 100); assert.equal(todo.completo, true);
});

test('avanceApertura: ejemplo del ticket — 72 pedidos y 9 recibidos de 112 equipos ≈ 38 %', () => {
  const eq = (estado: string) => ({ tipo: 'equipo', etapa: 'P4', estado, categoria: 'equipo_cocina' }) as never;
  const items = [...Array(72)].map(() => eq('pedido')).concat([...Array(9)].map(() => eq('recibido')), [...Array(31)].map(() => eq('por_cotizar')));
  assert.equal(avanceApertura(items).bloques.find(b => b.clave === 'compras')!.porcentaje, Math.round((72*0.5 + 9*0.75) / 112 * 100)); // 38
});

test('nombreEstado: etiquetas por bloque solo en actividades', () => {
  assert.equal(nombreEstado({ tipo: 'actividad', etapa: 'P3', categoria: null, estado: 'por_cerrar' }), 'Ingresado / en revisión');
  assert.equal(nombreEstado({ tipo: 'actividad', etapa: 'P5', categoria: null, estado: 'en_curso' }), 'Cotizado / aprobado');
  assert.equal(nombreEstado({ tipo: 'actividad', etapa: 'P7', categoria: null, estado: 'completado' }), 'Listo');
  assert.equal(nombreEstado({ tipo: 'actividad', etapa: 'P4', categoria: null, estado: 'por_cerrar' }), 'Por cerrar');
  assert.equal(nombreEstado({ tipo: 'equipo', etapa: 'P4', categoria: null, estado: 'pedido' }), 'Pedido');
  assert.equal(nombreEstado({ tipo: 'actividad', etapa: 'P1', categoria: null, estado: 'bloqueado' }), 'Bloqueado');
});

test('estadosPara y validarCambioEstado: por_cerrar solo en actividades', () => {
  assert.ok(estadosPara('actividad').includes('por_cerrar')); assert.ok(estadosPara('tecnico').includes('por_cerrar'));
  assert.ok(!estadosPara('equipo').includes('por_cerrar'));
  assert.equal(validarCambioEstado('actividad', { estado: 'por_cerrar', evidencia: '', cantidad: '', recibido: '' }), null);
  assert.equal(validarCambioEstado('equipo', { estado: 'por_cerrar', evidencia: '', cantidad: '', recibido: '' }), 'Estado inválido para este registro.');
});

test('conteoEtapasEquipo', () => {
  const eq = (estado: string) => ({ tipo: 'equipo', estado }) as never;
  assert.deepEqual(conteoEtapasEquipo(['por_cotizar','bloqueado','cotizado','aprobado','pedido','recibido_parcial','recibido','instalado','verificado','no_aplica','por_validar'].map(eq)),
    { sinCotizar: 2, cotizados: 2, pedidos: 2, entregados: 1, instalados: 2 });
});
test('todo % (bloque, módulo, categoría, etapa) muestra 100 solo si todas sus partidas tienen 1 punto; si no, tope 99',()=>{
 // 199 completadas + 1 por cerrar: (199 + 2/3) / 200 = 0.998 → redondea a 100, pero falta algo → 99.
 const casi=[...Array.from({length:199},(_,n)=>item({id:`a${n}`,tipo:'actividad',etapa:'P1',estado:'completado',categoria:'pisos'})),item({id:'z',tipo:'actividad',etapa:'P1',estado:'por_cerrar',categoria:'pisos'})];
 const obra=avanceApertura(casi).bloques.find(b=>b.clave==='obra')!;
 assert.equal(obra.porcentaje,99);assert.equal(checklistApertura(casi).modulos[2].porcentaje,99);assert.equal(checklistApertura(casi).general,99);
 assert.equal(avanceCategorias(casi)[0].porcentaje,99);assert.equal(avancePorProyecto(casi).p.porcentaje,99);
 const todas=casi.map(i=>({...i,estado:'completado'}));
 assert.equal(avanceApertura(todas).bloques.find(b=>b.clave==='obra')!.porcentaje,100);assert.equal(checklistApertura(todas).modulos[2].porcentaje,100);
 assert.equal(avanceCategorias(todas)[0].porcentaje,100);assert.equal(checklistApertura(todas).general,100);
});
