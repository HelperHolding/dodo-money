import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerFinanzas } from "@/lib/roles";

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const {supabase,perfil}=await obtenerPerfil();
  if(!puedeVerFinanzas(perfil.rol)) return new Response("Sin acceso.",{status:403});
  const {id}=await params;
  if(!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id)) return new Response("Reporte no encontrado.",{status:404});
  const {data,error}=await supabase.from("banca_archivos").select("contenido").eq("importacion_id",id).maybeSingle<{contenido:string}>();
  if(error) return new Response("No se pudo consultar el archivo.",{status:500});
  if(!data) return new Response("Reporte no encontrado.",{status:404});
  const contenido=Buffer.from(data.contenido.replace(/^\\x/,""),"hex");
  return new Response(contenido,{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="Banregio-${id}.xlsx"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
