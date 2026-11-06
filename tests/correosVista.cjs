const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const leer=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('correos vista: permisos, vista previa aislada y acciones por RPC',()=>{
 const layout=leer('app/correos/layout.tsx'),acc=leer('app/correos/acciones.ts'),form=leer('app/correos/FormCampana.tsx');
 assert.match(layout,/puedeVerCorreos\(perfil\.rol\)/);
 assert.match(acc,/puedeEditarCorreos/);assert.match(acc,/limpiarHtml\(/);
 assert.match(acc,/export async function duplicarCampana/);
 for(const r of ['correo_guardar_campana','correo_cambiar_estado','correo_mandar_prueba'])assert.match(acc,new RegExp(r));
 assert.match(form,/<iframe[^>]*sandbox=""/);assert.match(form,/accept="\.html,text\/html"/);
});
