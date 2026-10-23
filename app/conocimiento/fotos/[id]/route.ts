import {obtenerPerfil} from '@/lib/contexto';
// La política de kb_fotos aplica la misma audiencia que el manual: si no ves el manual, no ves la foto.
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const {supabase}=await obtenerPerfil();
 const {id}=await params;
 const {data:f}=await supabase.from('kb_fotos').select('ruta,mime').eq('id',id).not('confirmado_en','is',null).maybeSingle<{ruta:string;mime:string}>();
 if(!f)return new Response('Foto no encontrada',{status:404});
 const {data,error}=await supabase.storage.from('manuales').download(f.ruta);
 if(error||!data)return new Response('No se pudo cargar la foto',{status:404});
 return new Response(await data.arrayBuffer(),{headers:{'Content-Type':f.mime,'Content-Disposition':'inline','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
}
