import test from 'node:test';
import assert from 'node:assert/strict';
import {leerContacto} from './contactos.ts';
const leer=(d:Record<string,string>)=>leerContacto(c=>d[c]??'');
test('contactos: exige nombre y medio de contacto; valida correo y límites',()=>{
 for(const d of [{telefono:'555'},{nombre:'Ana'},{nombre:'Ana',correo:'no-valido'},{nombre:'a'.repeat(201),telefono:'555'},{nombre:'Ana',telefono:'5'.repeat(101)},{nombre:'Ana',correo:'a@b.mx',puesto:'a'.repeat(201)}])assert.ok('error' in leer(d));
});
test('contactos: conserva teléfono internacional y extensión; normaliza vacíos',()=>{
 assert.deepEqual(leer({nombre:' Ana ',puesto:' Ventas ',telefono:' +52 33 1234 5678 ext. 2 '}),{datos:{nombre:'Ana',puesto:'Ventas',telefono:'+52 33 1234 5678 ext. 2',correo:null}});
 assert.deepEqual(leer({nombre:'Ana',correo:' ana@example.com '}),{datos:{nombre:'Ana',puesto:null,telefono:null,correo:'ana@example.com'}});
});
