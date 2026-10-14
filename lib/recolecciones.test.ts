import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node strip-types.
import {resumirCierresRecoleccion} from './recolecciones.ts';
const cierre={id:'1',fecha:'2026-10-12',efectivo:1000,boveda_inicial:4500,boveda_contado:5500,retiros_dia:1000,aperturas_dia:0,deposito_dia:0,gastos_boveda_dia:200};
test('recolección: agrupa cierres sin sumar saldos acumulados ni descontar pagos otra vez',()=>{
 const r=resumirCierresRecoleccion([cierre,cierre,{...cierre,id:'2',fecha:'2026-10-13',boveda_inicial:5500,boveda_contado:6200}],{saldo:6200,fondo:4500,reservado:300,salidas:100,disponible:1300});
 assert.equal(r.cantidad,2);assert.equal(r.ventasEfectivo,2000);assert.equal(r.bovedaUltimoCierre,6200);assert.equal(r.gastosYaDescontados,400);assert.equal(r.disponibleActual,1300);
});
test('recolección: conserva fondo y compromisos aunque la disponibilidad recibida sea mayor',()=>{
 assert.equal(resumirCierresRecoleccion([],{saldo:5000,fondo:4500,reservado:300,salidas:100,disponible:9999}).disponibleActual,100);
});
