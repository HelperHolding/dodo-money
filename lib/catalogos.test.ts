import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogosPara} from './catalogos.ts';
import {enlacesDelMenu,grupoAbierto,menuLateral} from './roles.ts';

test('catálogos: operación no accede al directorio y corporativo no recibe enlaces administrativos',()=>{
  for(const rol of ['operacion','encargado','gerente'] as const){
    assert.deepEqual(catalogosPara(rol),[]);
    assert.equal(menuLateral(rol).grupos.some(g=>g.titulo==='Catálogos'),false);
  }
  assert.ok(catalogosPara('admin').some(c=>c.href==='/administracion/usuarios'));
  assert.equal(catalogosPara('corporativo').some(c=>c.href.startsWith('/administracion')),false);
});

test('catálogos: navegación específica y destinos únicos conservan las secciones existentes',()=>{
  for(const rol of ['admin','corporativo'] as const){
    const menu=menuLateral(rol),destinos=enlacesDelMenu(menu).map(e=>e.href);
    assert.equal(new Set(destinos).size,destinos.length);
    assert.equal(grupoAbierto(menu,'/catalogos'),'Catálogos');
    assert.equal(grupoAbierto(menu,'/finanzas/asignacion/concepto:123'),'Catálogos');
    assert.equal(grupoAbierto(menu,'/finanzas/catalogo'),'Catálogos');
    assert.equal(grupoAbierto(menu,'/compras/razones-sociales'),'Catálogos');
    assert.equal(grupoAbierto(menu,'/compras/proveedores/123'),'Compras');
    assert.equal(new Set(catalogosPara(rol).map(c=>c.href)).size,catalogosPara(rol).length);
  }
});
