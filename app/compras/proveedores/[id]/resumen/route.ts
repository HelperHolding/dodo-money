import {obtenerPerfil} from '@/lib/contexto';
import {puedeVerCompras} from '@/lib/roles';
import {vigentes,TIPOS_DOCUMENTO,NOMBRE_DOCUMENTO,type TipoDocumento} from '@/lib/compras/documentos';
import {leerTodo} from '@/lib/ventas/paginar';
export const dynamic='force-dynamic';
type Proveedor={id:string;razon_social:string;nombre_comercial:string|null;rfc:string;banco:string|null;clabe:string|null;cuenta:string|null;contacto_nombre:string|null;correo:string|null;telefono:string|null;activo:boolean};
type Documento={id:string;tipo:TipoDocumento;fecha:string;subido_en:string;ruta:string};
const respuesta=(datos:unknown,status=200)=>Response.json(datos,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {supabase,perfil}=await obtenerPerfil();if(!puedeVerCompras(perfil.rol))return respuesta({error:'Sin acceso'},403);
 const {id}=await params;
 const {data:p,error}=await supabase.from('proveedores').select('id,razon_social,nombre_comercial,rfc,banco,clabe,cuenta,contacto_nombre,correo,telefono,activo').eq('id',id).maybeSingle<Proveedor>();
 if(error)return respuesta({error:'No se pudieron consultar los datos del proveedor.'},500);if(!p)return respuesta({error:'Proveedor no encontrado.'},404);
 const docs=await leerTodo<Documento>((d,h)=>supabase.from('documentos_proveedor').select('id,tipo,fecha,subido_en,ruta').eq('proveedor_id',id).order('id').range(d,h));
 const actuales=vigentes(docs);
 const documentos=await Promise.all(TIPOS_DOCUMENTO.map(async tipo=>{
  const doc=actuales[tipo];if(!doc)return {tipo,nombre:NOMBRE_DOCUMENTO[tipo],fecha:null,disponible:false,url:null,imagen:false};
  const {data,error}=await supabase.storage.from('documentos-proveedores').createSignedUrl(doc.ruta,300);
  return {tipo,nombre:NOMBRE_DOCUMENTO[tipo],fecha:doc.fecha,disponible:true,url:error?null:data?.signedUrl??null,imagen:/\.(jpg|jpeg|png|webp)$/i.test(doc.ruta)};
 }));
 return respuesta({proveedor:p,documentos});
}
