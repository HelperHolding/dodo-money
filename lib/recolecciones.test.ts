import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node strip-types.
import {resumirCierresRecoleccion,semanaRecoleccion,esSemanaRecoleccion} from './recolecciones.ts';
const cierre={id:'1',fecha:'2026-10-12',efectivo:1000,boveda_inicial:4500,boveda_contado:5500,retiros_dia:1000,aperturas_dia:0,deposito_dia:0,gastos_boveda_dia:200};

test('recolección: semana cerrada lunes a domingo durante toda la semana siguiente',()=>{
 assert.equal(esSemanaRecoleccion('2026-10-12','2026-10-18'),true);
 assert.equal(esSemanaRecoleccion('2026-10-13','2026-10-19'),false);
 assert.equal(esSemanaRecoleccion('2026-10-12','2026-10-25'),false);
 assert.equal(esSemanaRecoleccion('',''),false);
 for(const dia of ['19','20','21','22','23','24','25'])assert.deepEqual(semanaRecoleccion(`2026-10-${dia}`),{desde:'2026-10-12',hasta:'2026-10-18'});
 assert.deepEqual(semanaRecoleccion('2026-10-26'),{desde:'2026-10-19',hasta:'2026-10-25'});
 assert.deepEqual(semanaRecoleccion('2027-01-04'),{desde:'2026-12-28',hasta:'2027-01-03'});
 assert.deepEqual(semanaRecoleccion('2026-03-02'),{desde:'2026-02-23',hasta:'2026-03-01'});
});
test('recolección: agrupa cierres sin sumar saldos acumulados ni descontar pagos otra vez',()=>{
 const r=resumirCierresRecoleccion([cierre,cierre,{...cierre,id:'2',fecha:'2026-10-13',boveda_inicial:5500,boveda_contado:6200}],{saldo:6200,fondo:4500,reservado:300,salidas:100,disponible:1300});
 assert.equal(r.cantidad,2);assert.equal(r.ventasEfectivo,2000);assert.equal(r.bovedaUltimoCierre,6200);assert.equal(r.gastosYaDescontados,400);assert.equal(r.disponibleActual,1300);
});
test('recolección: conserva fondo y compromisos aunque la disponibilidad recibida sea mayor',()=>{
 assert.equal(resumirCierresRecoleccion([],{saldo:5000,fondo:4500,reservado:300,salidas:100,disponible:9999}).disponibleActual,100);
});


test('recolección: el efectivo acumulado sigue disponible aunque el incremento del rango sea cero',()=>{
 const r=resumirCierresRecoleccion([{...cierre,boveda_inicial:26868.26,boveda_contado:26868.26}],{saldo:26868.26,fondo:4500,reservado:0,salidas:0,disponible:22368.26});
 assert.equal(r.bovedaUltimoCierre!-r.bovedaInicial!,0);
 assert.equal(r.disponibleActual,22368.26);
});

test('recolección: saldo acumulado conserva reservas, salidas pendientes y el fondo',()=>{
 const r=resumirCierresRecoleccion([cierre],{saldo:26868.26,fondo:4500,reservado:3000,salidas:10000,disponible:22368.26});
 assert.equal(r.disponibleActual,9368.26);
 assert.equal(resumirCierresRecoleccion([cierre],{saldo:4000,fondo:4500,reservado:0,salidas:0,disponible:0}).disponibleActual,0);
});
