'use server';
import {createHash} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {obtenerPerfil} from '@/lib/contexto';
import {leerHojas} from '@/lib/ventas/xlsx';
import {leerFinancieroRappi,resumenFinancieroRappi} from '@/lib/banca/rappi';
import {hoyCalendarioMX} from '@/lib/formato';
export type RevisionFinRappi={huella:string;resumen:ReturnType<typeof resumenFinancieroRappi>;desde:string;hasta:string;sustituye:number;empresa:string;sucursal:string};
export type ResultadoFinRappi={error:string}|{revision:RevisionFinRappi}|{id:string};
async function preparar(fd:FormData){
 const {supabase,perfil}=await obtenerPerfil();if(perfil.rol!=='admin')throw Error('Solo administración importa reportes financieros.');
 const archivo=fd.get('archivo');if(!(archivo instanceof File)||!archivo.size||archivo.size>2*1024*1024||archivo.name.length>200||!/\.xlsx$/i.test(archivo.name))throw Error('Selecciona el reporte financiero .xlsx, hasta 2 MB.');
 const bytes=Buffer.from(await archivo.arrayBuffer()),reporte=leerFinancieroRappi(leerHojas(bytes),hoyCalendarioMX()),resumen=resumenFinancieroRappi(reporte.movimientos);
 if(Math.abs(resumen.diferenciaBases)>.02)throw Error('Las bases de retención por IVA e ISR no coinciden. Revisa el reporte antes de aplicarlo al P&L.');
 const sucursal=String(fd.get('sucursal')??''),rfc=String(fd.get('rfc')??''),motivo=String(fd.get('motivo')??'').trim();
 if(motivo.length<12||motivo.length>1000)throw Error('Explica el motivo de la importación o corrección, de 12 a 1,000 caracteres.');
 const {data:empresa,error:e}=await supabase.from('razones_sociales').select('rfc,razon_social,activa,razon_social_sucursales(sucursal_id)').eq('rfc',rfc).single();
 if(e||!empresa?.activa||!empresa.razon_social_sucursales.some((s:{sucursal_id:string})=>s.sucursal_id===sucursal))throw Error('Selecciona una sucursal asociada a la razón social.');
 const {data:previos,error}=await supabase.from('rappi_fin_importaciones').select('id,desde,hasta,rfc').eq('sucursal_id',sucursal).is('sustituida_en',null).lte('desde',reporte.hasta).gte('hasta',reporte.desde).order('id');
 if(error)throw Error('No se pudo consultar el historial financiero. Revisa la migración de Rappi financiero.');
 if(previos?.some(p=>p.desde<reporte.desde||p.hasta>reporte.hasta||p.rfc!==rfc))throw Error('El nuevo reporte debe cubrir completos los reportes que sustituye, con la misma razón social.');
 const ids=(previos??[]).map(p=>String(p.id));
 const huella=createHash('sha256').update(bytes).update(JSON.stringify({sucursal,rfc,motivo,ids})).digest('hex');
 const revision:RevisionFinRappi={huella,resumen,desde:reporte.desde,hasta:reporte.hasta,sustituye:ids.length,empresa:empresa.razon_social,sucursal};
 return {supabase,bytes,reporte,revision,sucursal,rfc,motivo,ids,archivo};
}
export async function revisarFinRappi(fd:FormData):Promise<ResultadoFinRappi>{try{return {revision:(await preparar(fd)).revision};}catch(e){return {error:e instanceof Error?e.message:'No se pudo revisar el reporte.'};}}
export async function confirmarFinRappi(fd:FormData):Promise<ResultadoFinRappi>{try{
 const p=await preparar(fd);if(fd.get('huella')!==p.revision.huella||fd.get('confirmar')!=='si')throw Error('El archivo o la asignación cambió. Revisa y confirma nuevamente.');
 const id=String(fd.get('solicitud')??'');if(!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id))throw Error('Solicitud inválida.');
 const {data,error}=await p.supabase.rpc('importar_rappi_financiero',{p_id:id,p_sucursal:p.sucursal,p_rfc:p.rfc,p_archivo:p.archivo.name,p_original:p.bytes.toString('base64'),p_reporte:p.reporte,p_previos:p.ids,p_motivo:p.motivo});if(error)throw Error(error.message);
 revalidatePath('/banca');revalidatePath('/ventas/rappi');revalidatePath('/finanzas');return {id:String(data)};
}catch(e){return {error:e instanceof Error?e.message:'No se pudo guardar el reporte.'};}}
