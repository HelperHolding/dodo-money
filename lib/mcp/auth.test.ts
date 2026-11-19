import {test} from 'node:test';
import assert from 'node:assert/strict';
import {llaveValida} from './auth.ts';

const LLAVE='llave-de-prueba-0123456789abcdef';
test('llave: acepta Bearer correcto con mayúsculas o espacios',()=>{
 assert.equal(llaveValida(`Bearer ${LLAVE}`,LLAVE),true);
 assert.equal(llaveValida(`bearer ${LLAVE}`,LLAVE),true);
 assert.equal(llaveValida(`  Bearer ${LLAVE}  `,LLAVE),true);
});
test('llave: rechaza ausente, otro esquema, distinta o de otra longitud',()=>{
 assert.equal(llaveValida(null,LLAVE),false);
 assert.equal(llaveValida('',LLAVE),false);
 assert.equal(llaveValida(LLAVE,LLAVE),false);
 assert.equal(llaveValida(`Basic ${LLAVE}`,LLAVE),false);
 assert.equal(llaveValida(`Bearer ${LLAVE}x`,LLAVE),false);
 assert.equal(llaveValida('Bearer corta',LLAVE),false);
 assert.equal(llaveValida(`Bearer ${LLAVE}`,''),false);
});
