import test from 'node:test';
import assert from 'node:assert/strict';
import {periodoInicioVentas} from './inicio.ts';
test('inicio ventas: mes actual termina hoy; meses completos respetan febrero bisiesto',()=>{
 assert.deepEqual(periodoInicioVentas(undefined,'2026-10-09'),{desde:'2026-10-01',hasta:'2026-10-09'});
 assert.deepEqual(periodoInicioVentas('2024-02','2026-10-09'),{desde:'2024-02-01',hasta:'2024-02-29'});
 assert.deepEqual(periodoInicioVentas('2026-09','2026-10-09'),{desde:'2026-09-01',hasta:'2026-09-30'});
});
test('inicio ventas: meses futuros o inválidos regresan al actual',()=>{
 for(const mes of ['2026-11','2026-13','2026-00','invalido','2026-2'])assert.deepEqual(periodoInicioVentas(mes,'2026-10-09'),{desde:'2026-10-01',hasta:'2026-10-09'});
});
