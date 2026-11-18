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
