import {test} from 'node:test';
import assert from 'node:assert/strict';
import {U,como,nueva} from './correosBase.mjs';
export const rechaza=(p,re)=>assert.rejects(p,e=>{assert.match(e.message,re);return true;});
const v=async(db,id,sql)=>{await como(db,id);return (await db.query(sql)).rows[0];};

test('correos: puesto marketing sin sucursal y permisos de la sección',async()=>{
 const db=await nueva();
 try{
  for(const [id,ver,editar] of [[U.mkt,true,true],[U.admin,true,true],[U.corp,true,false],[U.gerente,false,false]]){
   const r=await v(db,id,`select public.puede_ver_correos() ver,public.puede_editar_correos() editar`);
   assert.deepEqual([r.ver,r.editar],[ver,editar],id);
  }
  await db.exec('reset role');
  await rechaza(db.exec(`insert into perfiles values('00000000-0000-0000-0000-0000000000b8','X','marketing','00000000-0000-0000-0000-0000000000e1',true,false)`),/perfiles_sin_sucursal/);
 }finally{await db.close();}
});
