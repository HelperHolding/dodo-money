import {NextRequest,NextResponse} from 'next/server';
import {crearClienteServidor} from '@/lib/supabase/server';
import type {Perfil} from '@/lib/tipos';
import {alcanceIA,mensajesIA} from '@/lib/ia/validacion';
import {responderIA} from '@/lib/ia/agente';
export const runtime='nodejs';
export const maxDuration=60;
const error=(mensaje:string,status:number)=>NextResponse.json({error:mensaje},{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:NextRequest) {
 if(request.headers.get('origin')!==request.nextUrl.origin)return error('Origen de petición inválido.',403);
 const supabase=await crearClienteServidor();const {data:{user}}=await supabase.auth.getUser();if(!user)return error('Inicia sesión para usar el asistente.',401);
 const {data:perfil}=await supabase.from('perfiles').select('id,rol,sucursal_id,activo,debe_cambiar_contrasena').eq('id',user.id).maybeSingle<Perfil>();
 if(!perfil||!perfil.activo||perfil.debe_cambiar_contrasena||!['admin','corporativo','gerente'].includes(perfil.rol))return error('Sin acceso al asistente.',403);
 if(!process.env.ANTHROPIC_API_KEY||!process.env.ANTHROPIC_MODEL)return error('El chat todavía no está conectado a Anthropic. Administración debe configurar la conexión.',503);
 let sucursal:string|null,mensajes:ReturnType<typeof mensajesIA>;
 try{const raw=await request.text();if(raw.length>30000)return error('La conversación es demasiado larga. Inicia una nueva.',400);const cuerpo=JSON.parse(raw);if(cuerpo.sucursal!==null&&typeof cuerpo.sucursal!=='string')throw Error('Sucursal inválida.');sucursal=alcanceIA(perfil,cuerpo.sucursal||null);mensajes=mensajesIA(cuerpo.mensajes);}catch(e){return error(e instanceof Error?e.message:'Petición inválida.',400);}
 if(sucursal){const {data:s,error:es}=await supabase.from('sucursales').select('id').eq('id',sucursal).maybeSingle();if(es||!s)return error('Sucursal no disponible.',403);}
 const {data:id,error:er}=await supabase.rpc('ia_reservar_consulta');if(er)return er.code==='P0001'?error(er.message,429):error('El asistente no pudo habilitar la consulta. Administración debe revisar su configuración.',503);
 try{
 const r=await responderIA({supabase,sucursal,rol:perfil.rol,mensajes,signal:AbortSignal.any([request.signal,AbortSignal.timeout(45000)])});
 const {error:ec}=await supabase.rpc('ia_cerrar_consulta',{p_id:id,p_estado:'completada',p_modelo:r.modelo,p_entrada:r.tokensEntrada,p_salida:r.tokensSalida,p_fuentes:r.fuentes});
 if(ec)return error('La respuesta no pudo registrarse. Vuelve a intentar.',500);
 return NextResponse.json({texto:r.texto,fuentes:r.fuentes},{headers:{'Cache-Control':'no-store'}});
 }catch{
 await supabase.rpc('ia_cerrar_consulta',{p_id:id,p_estado:'error',p_modelo:process.env.ANTHROPIC_MODEL,p_entrada:null,p_salida:null,p_fuentes:[]});
 return error('No se pudo completar la consulta con Anthropic. Verifica la conexión o vuelve a intentar.',502);
 }
}
