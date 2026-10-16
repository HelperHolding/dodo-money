import {obtenerPerfil} from '@/lib/contexto';
import {puedeVerCompras} from '@/lib/roles';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {supabase,perfil}=await obtenerPerfil();if(!puedeVerCompras(perfil.rol))return new Response('Sin acceso',{status:403});
 const tipo=new URL(request.url).searchParams.get('tipo');if(tipo!=='pdf'&&tipo!=='xml'&&tipo!=='comprobante')return new Response('Formato inválido',{status:400});
 const {id}=await params;
 const {data:f,error}=await supabase.from('facturas').select('pdf_ruta,xml_ruta').eq('id',id).maybeSingle<{pdf_ruta:string|null;xml_ruta:string|null}>();
 if(error)return new Response('No se pudo consultar el documento',{status:500});
 if(!f)return new Response('Factura no encontrada',{status:404});
 let ruta=tipo==='xml'?f.xml_ruta:f.pdf_ruta,bucket='facturas';
 if(tipo==='pdf'&&!ruta?.toLowerCase().endsWith('.pdf')){
  const {data:adjuntos,error:fallo}=await supabase.from('compra_adjuntos').select('ruta').eq('factura_id',id).eq('mime','application/pdf').not('confirmado_en','is',null).is('retirado_en',null).order('creado_en',{ascending:false}).order('id').limit(1).returns<{ruta:string}[]>();
  if(fallo)return new Response('No se pudieron consultar los adjuntos',{status:500});ruta=adjuntos?.[0]?.ruta??null;bucket='adjuntos-compras';
 }
 if(tipo==='comprobante'&&!/\.(pdf|jpe?g|png|webp)$/i.test(ruta??''))return new Response('Comprobante pendiente',{status:404});
 if(!ruta)return new Response('Archivo pendiente',{status:404});
 const {data,error:fallo}=await supabase.storage.from(bucket).createSignedUrl(ruta,300);
 if(fallo||!data)return new Response('Archivo no disponible',{status:404});
 return new Response(null,{status:302,headers:{Location:data.signedUrl,'Cache-Control':'private, no-store'}});
}
