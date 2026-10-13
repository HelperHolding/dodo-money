'use server';
import {createHash} from 'node:crypto';import {revalidatePath} from 'next/cache';import {obtenerPerfil} from '@/lib/contexto';import {hoyMX} from '@/lib/formato';import {leerCsvOperacion} from '@/lib/ventas/operacion';import {puedeImportarVentas} from '@/lib/roles';
export type ResultadoOperacion={error?:string;mensaje?:string};
export async function cargar(_prev:ResultadoOperacion,fd:FormData):Promise<ResultadoOperacion>{
 try{const {supabase,perfil}=await obtenerPerfil();if(!puedeImportarVentas(perfil.rol))throw Error('Solo administración importa operación.');
 const file=fd.get('archivo');if(!(file instanceof File)||!file.name.toLowerCase().endsWith('.csv')||file.size<1||file.size>2*1024*1024)throw Error('Carga un CSV de hasta 2 MB.');
 const sucursal=String(fd.get('sucursal')??'');const actualizado=String(fd.get('actualizado')??'');if(fd.get('confirmar_sucursal')!=='si')throw Error('Confirma que el CSV corresponde a la sucursal seleccionada.');
 const bytes=Buffer.from(await file.arrayBuffer());const dias=leerCsvOperacion(bytes.toString('utf8'),hoyMX());if(!/^\d{4}-\d{2}-\d{2}$/.test(actualizado)||actualizado<dias.at(-1)!.fecha||actualizado>hoyMX())throw Error('La cobertura debe incluir los días del archivo y no ser futura.');
 if(fd.get('accion')==='revisar')return {mensaje:`CSV válido: ${dias.length} días, del ${dias[0].fecha} al ${dias.at(-1)!.fecha}. Revisa la sucursal y usa Importar para guardar.`};
 const {error}=await supabase.rpc('importar_operacion_analytics',{p_sucursal:sucursal,p_archivo:file.name,p_sha256:createHash('sha256').update(bytes).digest('hex'),p_actualizado:actualizado,p_dias:dias,p_reemplazar:fd.get('reemplazar')==='si'});if(error)throw Error(error.message);revalidatePath('/ventas/operacion');return {mensaje:`Importación completada: ${dias.length} días. No modifica ventas ni P&L.`};
 }catch(e){return {error:e instanceof Error?e.message:'No se pudo importar.'};}
}
