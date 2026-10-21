import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const ts=(await import(pathToFileURL(process.argv[3]).href)).default;
for(const f of ['Expediente.tsx','page.tsx']){const r=ts.transpileModule(fs.readFileSync(new URL('../../../app/recolecciones/'+f,import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true,fileName:f});assert.deepEqual(r.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error),[]);}
const db=new PGlite();try{
 await db.exec(fs.readFileSync(process.argv[4],'utf8'));
 await db.query("select set_config('test.disponibilidad',$1,false)",[JSON.stringify({saldo:26600.28,fondo:4500,reservado:0,salidas:0,disponible:22100.28})]);
 const sql=fs.readFileSync(new URL('./migration.sql',import.meta.url),'utf8');
 await db.exec(sql.slice(0,sql.indexOf('CREATE OR REPLACE FUNCTION public.registrar_recoleccion'))+'commit;');
 const exp=(await db.query('select vista_recoleccion(mi_sucursal(),current_date,current_date) exp')).rows[0].exp;
 assert.equal(exp.permite_entrega_parcial,true);assert.equal(exp.maximo,22100.28);assert.equal(exp.incremento_periodo,0);
 console.log('Vista SQL completa y TSX aprobados: flag de entrega parcial y máximo protegido sin cambios.');
}finally{await db.close();}
