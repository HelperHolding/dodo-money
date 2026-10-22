import {obtenerPerfil} from '@/lib/contexto';
import {puedeVerFinanzas} from '@/lib/roles';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const {supabase,perfil}=await obtenerPerfil(),{id}=await params;
 if(!puedeVerFinanzas(perfil.rol))return new Response('Sin acceso.',{status:403});
 if(!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id))return new Response('Archivo no disponible.',{status:404});
 const {data,error}=await supabase.from('rappi_fin_archivos').select('contenido').eq('importacion_id',id).maybeSingle<{contenido:string}>();
 if(error||!data)return new Response('Archivo no disponible.',{status:404});
 const bytes=Buffer.from(data.contenido.replace(/^\\x/,''),'hex');
 return new Response(bytes,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="Rappi-financiero.xlsx"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
