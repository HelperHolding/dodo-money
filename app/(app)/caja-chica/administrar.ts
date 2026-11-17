"use server";
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {obtenerContextoParaEscribir} from '@/lib/contexto';
import {BUCKET_FOTOS,rutaFoto,validarFoto} from '@/lib/fotos';
const volver=(t:string,m:string):never=>redirect(`/caja-chica?${t}=${encodeURIComponent(m)}`);
export async function administrarGasto(fd:FormData) {
 const {supabase,perfil,sucursal}=await obtenerContextoParaEscribir('/caja-chica');
 if(perfil.rol!=='admin')volver('error','Solo administración edita o elimina gastos.');
 const t=(k:string)=>String(fd.get(k)??'').trim(),accion=t('accion');
 if(accion!=='editar'&&accion!=='eliminar')volver('error','Acción inválida.');
 if(accion==='eliminar'&&fd.get('confirmado')!=='si')volver('error','Confirma que es una captura equivocada.');
 const {data:g,error:lectura}=await supabase.from('gastos_caja_chica').select('id').eq('id',t('id')).eq('sucursal_id',sucursal.id).maybeSingle();
 if(lectura||!g)volver('error','No se encontró el gasto en la sucursal activa.');
 const datos=accion==='editar'?{fecha:t('fecha'),concepto:t('concepto'),proveedor:t('proveedor'),monto:t('monto'),origen:t('origen'),pagado_por:t('pagado_por'),comprobante:t('comprobante'),uuid_cfdi:t('uuid_cfdi'),cuenta_pl:t('cuenta_pl')}:{};
 const {error}=await supabase.rpc('editar_anular_gasto_admin',{p_solicitud:t('solicitud'),p_id:t('id'),p_version:Number(t('version')),p_accion:accion,p_datos:datos,p_motivo:t('motivo')});
 if(error)volver('error',error.message);
 revalidatePath('/','layout');
 volver('ok',accion==='editar'?'Gasto corregido con historial; saldo y P&L actualizados.':'Captura eliminada con historial; saldo y P&L actualizados.');
}
/** Agrega la foto del ticket a un gasto registrado sin foto. No cambia importe, origen ni saldo. */
export async function agregarFotoGasto(fd:FormData) {
 const {supabase,perfil,sucursal}=await obtenerContextoParaEscribir('/caja-chica');
 if(perfil.rol!=='admin')volver('error','Solo administración agrega fotos a gastos registrados.');
 const t=(k:string)=>String(fd.get(k)??'').trim();
 const foto=fd.get('foto');const archivo=foto instanceof File&&foto.size>0?foto:null;
 if(!archivo)volver('error','Elige la foto del ticket.');
 const problema=validarFoto(archivo);if(problema)volver('error',problema);
 const {data:g,error:lectura}=await supabase.from('gastos_caja_chica').select('id,foto_path').eq('id',t('id')).eq('sucursal_id',sucursal.id).maybeSingle();
 if(lectura||!g)volver('error','No se encontró el gasto en la sucursal activa.');
 if(g!.foto_path)volver('error','El gasto ya tiene foto.');
 const ruta=rutaFoto(sucursal.id,crypto.randomUUID(),archivo!.type);
 const {error:subida}=await supabase.storage.from(BUCKET_FOTOS).upload(ruta,archivo!,{contentType:archivo!.type,upsert:false});
 if(subida)volver('error',`No se pudo subir la foto: ${subida.message}`);
 const {error}=await supabase.rpc('agregar_foto_gasto_admin',{p_solicitud:t('solicitud'),p_id:t('id'),p_version:Number(t('version')),p_foto:ruta});
 if(error){await supabase.storage.from(BUCKET_FOTOS).remove([ruta]);volver('error',error.message);}
 revalidatePath('/','layout');
 volver('ok','Foto agregada al gasto. El saldo y el P&L no cambian.');
}
