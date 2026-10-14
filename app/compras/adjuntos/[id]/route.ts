import {obtenerPerfil} from '@/lib/contexto';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const {supabase,perfil}=await obtenerPerfil();
 if(!['admin','corporativo'].includes(perfil.rol))return new Response('Sin acceso',{status:403});
 const {id}=await params;
 const {data:a}=await supabase.from('compra_adjuntos').select('ruta,nombre,mime').eq('id',id).not('confirmado_en','is',null).maybeSingle<{ruta:string;nombre:string;mime:string}>();
 if(!a)return new Response('Documento no encontrado',{status:404});
 const {data,error}=await supabase.storage.from('adjuntos-compras').download(a.ruta);
 if(error||!data)return new Response('No se pudo descargar el adjunto',{status:404});
 const nombre=encodeURIComponent(a.nombre).replace(/['()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
 return new Response(await data.arrayBuffer(),{headers:{'Content-Type':a.mime,'Content-Disposition':`attachment; filename*=UTF-8''${nombre}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
