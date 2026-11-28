import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {ItemApertura} from './aperturas.ts';
import {barrasSemana,claveGrupo,datosFechas,enCalendario,esMes,gruposCalendario,moverMesTexto,rangoItem,semanasCalendario,textoSobre,validarFechas} from './aperturasCalendario.ts';

const it=(nombre:string,inicio:string|null,fin:string|null)=>({nombre,inicio,fin});

test('calendario de aperturas: semanas completas de lunes a domingo con días vecinos marcados',()=>{
 const s=semanasCalendario('2026-11');
 assert.equal(s[0][0].dia,'2026-10-26');assert.equal(s[0][0].delMes,false);
 assert.equal(s[0][6].dia,'2026-11-01');assert.equal(s[0][6].delMes,true);
 assert.equal(s.at(-1)!.at(-1)!.dia,'2026-12-06');
 assert.ok(s.every(w=>w.length===7));
 assert.equal(s.flat().filter(c=>c.delMes).length,30);
});
test('calendario de aperturas: mover entre meses y validar el parámetro',()=>{
 assert.equal(moverMesTexto('2026-12',1),'2027-01');assert.equal(moverMesTexto('2026-01',-1),'2025-12');
 assert.ok(esMes('2026-11'));assert.ok(!esMes('2026-13'));assert.ok(!esMes('nov'));
});
test('calendario de aperturas: una sola fecha ocupa ese día y no aplica no se muestra',()=>{
 assert.deepEqual(rangoItem({inicio:null,fin:'2026-11-05'}),{desde:'2026-11-05',hasta:'2026-11-05'});
 assert.deepEqual(rangoItem({inicio:'2026-11-05',fin:null}),{desde:'2026-11-05',hasta:'2026-11-05'});
 assert.equal(rangoItem({inicio:null,fin:null}),null);
 assert.ok(!enCalendario({inicio:'2026-11-05',fin:'2026-11-06',estado:'no_aplica'}));
 assert.ok(enCalendario({inicio:'2026-11-05',fin:'2026-11-06',estado:'pendiente'}));
});
test('calendario de aperturas: barras recortadas a la semana y en carriles sin encimarse',()=>{
 const semana=semanasCalendario('2026-11')[1]; // 2 al 8 de noviembre
 const {barras,carriles}=barrasSemana([
  it('Larga','2026-10-20','2026-11-20'),it('Martes','2026-11-03','2026-11-03'),it('Mar-jue','2026-11-03','2026-11-05'),it('Domingo','2026-11-08','2026-11-08'),it('Otra semana','2026-11-10','2026-11-11'),
 ],semana);
 const de=(n:string)=>barras.find(b=>b.item.nombre===n)!;
 assert.equal(barras.length,4);
 assert.deepEqual({col:de('Larga').col,span:de('Larga').span,antes:de('Larga').empiezaAntes,despues:de('Larga').sigueDespues},{col:0,span:7,antes:true,despues:true});
 assert.equal(de('Larga').carril,0);
 assert.notEqual(de('Martes').carril,de('Mar-jue').carril);
 assert.equal(de('Domingo').col,6);assert.equal(de('Domingo').carril,1);
 assert.equal(carriles,3);
});
test('calendario de aperturas: colores guardados reemplazan al predeterminado y lo inválido se ignora',()=>{
 const g=gruposCalendario('etapa',[{agrupacion:'etapa',clave:'P2',color:'#ABCDEF'},{agrupacion:'etapa',clave:'P3',color:'rojo'},{agrupacion:'categoria',clave:'P1',color:'#000000'}]);
 assert.equal(g.length,7);
 assert.equal(g.find(x=>x.clave==='P2')!.color,'#abcdef');
 assert.equal(g.find(x=>x.clave==='P3')!.color,g.find(x=>x.clave==='P3')!.predeterminado);
 assert.equal(g.find(x=>x.clave==='P1')!.color,g.find(x=>x.clave==='P1')!.predeterminado);
 const c=gruposCalendario('categoria',[]);
 assert.equal(c.length,17);assert.equal(c.at(-1)!.clave,'sin');
 assert.equal(claveGrupo('categoria',{etapa:'P1',categoria:null}),'sin');
 assert.equal(claveGrupo('etapa',{etapa:'P4',categoria:'pisos'}),'P4');
});
test('calendario de aperturas: el texto se lee sobre fondos claros y oscuros',()=>{
 assert.equal(textoSobre('#ffffff'),'#111111');assert.equal(textoSobre('#eab308'),'#111111');
 assert.equal(textoSobre('#000000'),'#ffffff');assert.equal(textoSobre('#2563eb'),'#ffffff');
});
test('calendario de aperturas: fechas válidas y cambio que conserva el resto del registro',()=>{
 assert.equal(validarFechas('',''),null);
 assert.match(validarFechas('2026-11-05','')!,/las dos/);
 assert.match(validarFechas('2026-11-05','2026-11-01')!,/anterior/);
 assert.equal(validarFechas('2026-11-05','2026-11-05'),null);
 const i={id:'i',proyecto_id:'p',clave:'e',tipo:'equipo',etapa:'P4',nombre:'Horno',fuente:'plano',original:{},estado:'pedido',responsable:'Julio',inicio:null,fin:null,cantidad:2,recibido:1,precio:100,evidencia:'cotización',notas:null,orden_id:'o',factura_id:null,revision:3,categoria:'equipo_cocina'} as ItemApertura;
 assert.deepEqual(datosFechas(i,'2026-11-05','2026-11-07'),{estado:'pedido',responsable:'Julio',inicio:'2026-11-05',fin:'2026-11-07',cantidad:'2',recibido:'1',precio:'100',evidencia:'cotización',notas:'',orden_id:'o',factura_id:''});
});

// ── Responsables (HD-7/HD-8) ──
import {clavePersona,conteoDia,diaPorPersona,esActividad,esDia,momentoEnDia,moverDias,nombrePersona,personasDe,semanaDe,SIN_ASIGNAR,tituloSemana} from './aperturasCalendario.ts';
const tarea=(id:string,responsable:string|null,inicio:string|null,fin:string|null,tipo:'actividad'|'equipo'='actividad',estado='pendiente')=>({id,clave:id,nombre:id,tipo,etapa:'P5' as const,categoria:null,estado,responsable,inicio,fin,revision:1});

test('responsables: se juntan sin acentos, sin paréntesis y con el traspaso a quien recibe',()=>{
 assert.equal(nombrePersona('Diego Barreto (Julio revisa al regresar)'),'Diego Barreto');
 assert.equal(nombrePersona('Julio Verdeja → Diego Barreto desde 28-nov'),'Diego Barreto');
 assert.equal(nombrePersona('César (360°)'),'César');
 assert.equal(clavePersona('  JOSÉ  villa '),clavePersona('José Villa'));
 assert.equal(clavePersona(null),SIN_ASIGNAR.clave);assert.equal(clavePersona('  '),SIN_ASIGNAR.clave);
});
test('responsables: iniciales únicas, color estable y sin asignar al final',()=>{
 const p=personasDe([tarea('a','José Villa',null,null),tarea('b','Julio Verdeja',null,null),tarea('c','Diego Barreto (revisa)',null,null),tarea('d',null,null,null),tarea('e','Renata y equipo de marketing',null,null),tarea('f','Celeste',null,null),tarea('g','jose villa',null,null)]);
 assert.deepEqual(p.map(x=>x.nombre),['Celeste','Diego Barreto','José Villa','Julio Verdeja','Renata y equipo de marketing','Sin asignar']);
 assert.deepEqual(p.map(x=>x.iniciales),['CE','DB','JoV','JuV','RE','—']);
 // Celeste y César darían CE y CÉ: se distinguen con tres letras.
 assert.deepEqual(personasDe([tarea('a','Celeste',null,null),tarea('b','César (360°)',null,null)]).map(x=>x.iniciales),['Cel','Cés']);
 assert.equal(new Set(p.map(x=>x.color)).size,p.length);
 // Filtrar no cambia el color: depende del orden alfabético de todo el proyecto.
 const solo=personasDe([tarea('b','Julio Verdeja',null,null)]);assert.equal(solo[0].iniciales,'JV');
});
test('responsables: empieza, continúa, termina o solo ese día',()=>{
 const t=tarea('x','Ana','2026-12-01','2026-12-03');
 assert.equal(momentoEnDia(t,'2026-12-01'),'empieza');assert.equal(momentoEnDia(t,'2026-12-02'),'continua');assert.equal(momentoEnDia(t,'2026-12-03'),'termina');
 assert.equal(momentoEnDia(t,'2026-12-04'),null);assert.equal(momentoEnDia(tarea('y','Ana',null,'2026-12-05'),'2026-12-05'),'solo');
});
test('responsables: el día se agrupa por persona y las de varios días salen todos los días',()=>{
 const items=[tarea('Pintar','José Villa','2026-12-01','2026-12-04'),tarea('Gas','Diego Barreto','2026-12-02','2026-12-02'),tarea('Campana','José Villa','2026-12-02','2026-12-02'),tarea('No va','José Villa','2026-12-02','2026-12-02','actividad','no_aplica'),tarea('Sin','',  '2026-12-02','2026-12-02')];
 const p=personasDe(items);
 const g=diaPorPersona(items,'2026-12-02',p);
 assert.deepEqual(g.map(x=>[x.persona.nombre,x.tareas.map(t=>`${t.item.nombre}:${t.momento}`)]),[['Diego Barreto',['Gas:solo']],['José Villa',['Campana:solo','Pintar:continua']],['Sin asignar',['Sin:solo']]]);
 assert.deepEqual(conteoDia(items,'2026-12-04',p).map(x=>[x.persona.iniciales,x.n]),[['JV',1]]);
 assert.ok(esActividad(tarea('a',null,null,null)));assert.ok(!esActividad(tarea('b',null,null,null,'equipo')));
});
test('semana: de lunes a domingo, moverse y título',()=>{
 const s=semanaDe('2026-12-03');
 assert.deepEqual([s[0].dia,s[6].dia],['2026-11-30','2026-12-06']);
 assert.equal(semanaDe('2026-12-06')[0].dia,'2026-11-30');assert.equal(semanaDe('2026-11-30')[0].dia,'2026-11-30');
 assert.equal(moverDias('2026-11-30',7),'2026-12-07');
 assert.ok(esDia('2026-12-14'));assert.ok(!esDia('2026-02-30'));assert.ok(!esDia('dic'));
 assert.match(tituloSemana(s),/30 nov.* – 6 dic.* 2026/);
});
import {sugerenciasResponsable} from './aperturasCalendario.ts';
test('responsables: sugerencias de usuarios y nombres ya usados, sin repetir',()=>{
 assert.deepEqual(sugerenciasResponsable(['Sebastián Cervera','Julio Verdeja',null,' '],['José Villa','jose villa (obra)','Julio Verdeja → Diego Barreto desde 28-nov',null,'Sebastian Cervera']),
  ['Diego Barreto','José Villa','Julio Verdeja','Sebastián Cervera']);
});

// Estilo Google Calendar.
import {COLORES_PERSONA,conteoPorPersona,esDeUnDia,esModoCalendario,filtrarOcultos,leerOcultos,miniMes,modoCalendario,ocultasPorDia,tituloPeriodo} from './aperturasCalendario.ts';
test('calendario google: modos mes y semana, con los viejos cayendo a mes',()=>{
 assert.ok(esModoCalendario('mes'));assert.ok(esModoCalendario('semana'));assert.ok(!esModoCalendario('cuadros'));
 assert.equal(modoCalendario('cuadros'),'mes');assert.equal(modoCalendario('barras'),'mes');assert.equal(modoCalendario(undefined),'mes');assert.equal(modoCalendario('semana'),'semana');
});
test('calendario google: paleta sin el rojo de alerta y sin asignar en gris',()=>{
 assert.equal(COLORES_PERSONA.length,10);assert.ok(!COLORES_PERSONA.includes('#d50000'));
 assert.equal(SIN_ASIGNAR.color,'#a0a0a0');
});
test('calendario google: el mini mes siempre tiene 6 semanas',()=>{
 for(const m of ['2026-02','2026-11','2027-01'])assert.equal(miniMes(m).length,6);
 const f=miniMes('2026-02');assert.equal(f[0][0].dia,'2026-01-26');assert.ok(f.every(s=>s.length===7));
});
test('calendario google: tareas de un día y de varios días',()=>{
 assert.ok(esDeUnDia({inicio:'2026-11-05',fin:'2026-11-05'}));assert.ok(esDeUnDia({inicio:null,fin:'2026-11-05'}));
 assert.ok(!esDeUnDia({inicio:'2026-11-05',fin:'2026-11-06'}));
});
test('calendario google: ocultar personas y contar por persona en el periodo',()=>{
 const t=(responsable:string|null,inicio:string|null,fin:string|null,estado='pendiente')=>({responsable,inicio,fin,estado});
 const items=[t('Ana Ruiz','2026-11-02','2026-11-04'),t('ana ruiz','2026-11-20','2026-11-20'),t(null,'2026-11-03','2026-11-03'),t('Luis','2026-12-01','2026-12-02'),t('Luis','2026-11-05','2026-11-05','no_aplica')];
 assert.equal(filtrarOcultos(items,new Set(['sin'])).length,4);
 assert.deepEqual(conteoPorPersona(items,'2026-11-01','2026-11-30'),{'ana ruiz':2,sin:1});
});
test('calendario google: ocultos guardados se leen con cuidado',()=>{
 assert.deepEqual([...leerOcultos('["ana ruiz","fantasma"]',['ana ruiz','sin'])],['ana ruiz']);
 assert.deepEqual([...leerOcultos('{roto',['ana ruiz'])],[]);
 assert.deepEqual([...leerOcultos(null,['ana ruiz'])],[]);
 assert.deepEqual([...leerOcultos('"texto"',['ana ruiz'])],[]);
});
test('calendario google: «N más» por día con 4 renglones',()=>{
 const semana=semanasCalendario('2026-11')[1];
 const items=Array.from({length:6},(_,n)=>({nombre:`T${n}`,inicio:'2026-11-03',fin:'2026-11-03'}));
 const {barras}=barrasSemana(items,semana);
 assert.deepEqual(ocultasPorDia(barras,semana,4),[0,2,0,0,0,0,0]);
});
test('calendario google: título del periodo, también cruzando año',()=>{
 assert.equal(tituloPeriodo('mes','2026-11','2026-11-23'),'noviembre de 2026');
 assert.equal(tituloPeriodo('semana','2026-12','2026-12-28'),'28 dic – 3 ene 2027');
});

// ── Responsables del catálogo (HD-27) ──
import {claveResponsable,conCatalogo} from './aperturasCalendario.ts';
test('catálogo: agrupa por responsable_id con el nombre del catálogo y une el texto viejo que coincide',()=>{
 const cat=[{id:'u1',nombre:'José Villa'},{id:'u2',nombre:'Diego Barreto'}];
 const con=(id:string,responsable:string|null,responsable_id:string|null)=>({...tarea(id,responsable,'2026-12-02','2026-12-02'),responsable_id});
 const items=conCatalogo([con('a','Jose Villa (obra)','u1'),con('b','jose villa',null),con('c','Julio Verdeja',null),con('d',null,null),con('e','Pepe','u2')],cat);
 // Con id manda el catálogo; sin id, el texto que coincide con un nombre del catálogo se une a esa persona.
 assert.deepEqual(items.map(i=>[i.responsable,i.responsable_id]),[['José Villa','u1'],['José Villa','u1'],['Julio Verdeja',null],[null,null],['Diego Barreto','u2']]);
 assert.equal(claveResponsable(items[0]),'r:u1');assert.equal(claveResponsable(items[2]),clavePersona('Julio Verdeja'));
 const p=personasDe(items);
 assert.deepEqual(p.map(x=>x.nombre),['Diego Barreto','José Villa','Julio Verdeja','Sin asignar'],'una sola José Villa');
 assert.deepEqual(diaPorPersona(items,'2026-12-02',p).map(g=>[g.persona.nombre,g.tareas.length]),[['Diego Barreto',1],['José Villa',2],['Julio Verdeja',1],['Sin asignar',1]]);
 assert.deepEqual(conteoPorPersona(items,'2026-12-01','2026-12-31'),{'r:u2':1,'r:u1':2,[clavePersona('Julio Verdeja')]:1,sin:1});
 assert.equal(filtrarOcultos(items,new Set(['r:u1'])).length,3);
 // Sin catálogo (migración pendiente) todo sigue por texto.
 assert.deepEqual(conCatalogo([con('x','Ana',null)],null).map(i=>i.responsable),['Ana']);
 // Un id que ya no está en el catálogo conserva el texto.
 assert.deepEqual(conCatalogo([con('y','Ana','u9')],cat).map(i=>[i.responsable,i.responsable_id]),[['Ana','u9']]);
});
