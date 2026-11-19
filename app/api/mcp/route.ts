import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {manejarMCP,LIMITE_CUERPO,type Conexion} from '@/lib/mcp/servidor';
import {ejecutarHerramienta} from '@/lib/mcp/ejecutar';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

// Conector MCP de solo lectura para Grok Bot (docs/superpowers/specs/2026-11-19-grok-mcp-design.md).
async function conectar(origen:string):Promise<Conexion> {
 const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await supabase.auth.signInWithPassword({email:process.env.GROK_MCP_CUENTA_EMAIL!.trim(),password:process.env.GROK_MCP_CUENTA_PASSWORD!});
 if(error||!data.user){console.error('grok-mcp: inicio de sesión fallido',error?.message);throw Error('La cuenta de Grok no está configurada.');}
 const {data:perfil}=await supabase.from('perfiles').select('rol,activo,debe_cambiar_contrasena').eq('id',data.user.id).maybeSingle<{rol:string;activo:boolean;debe_cambiar_contrasena:boolean}>();
 if(!perfil||!perfil.activo||perfil.debe_cambiar_contrasena||!['admin','corporativo'].includes(perfil.rol))throw Error('Sin acceso al conector.');
 return {
  rol:perfil.rol,
  async reservar(herramienta,argumentos){
   const {data:id,error:e}=await supabase.rpc('mcp_reservar_llamada',{p_herramienta:herramienta,p_argumentos:argumentos});
   if(e||typeof id!=='string'){if(e&&e.code!=='P0001')console.error('grok-mcp: reservar',e.message);throw Error(e?.code==='P0001'?e.message:'No se pudo registrar la llamada.');}
   return id;
  },
  async cerrar(id,estado,err){
   const {error:e}=await supabase.rpc('mcp_cerrar_llamada',{p_id:id,p_estado:estado,p_error:err});
   if(e){console.error('grok-mcp: cerrar',e.message);throw Error('No se pudo cerrar el registro de la llamada.');}
  },
  ejecutar:a=>ejecutarHerramienta(supabase,perfil.rol,a,origen),
 };
}

async function atender(req:NextRequest) {
 const largo=Number(req.headers.get('content-length')??0);
 const cuerpo=req.method==='POST'&&largo<=LIMITE_CUERPO?await req.text():req.method==='POST'?'x'.repeat(LIMITE_CUERPO+1):'';
 const s=await manejarMCP({metodo:req.method,autorizacion:req.headers.get('authorization'),cuerpo},{
  llave:process.env.GROK_MCP_KEY,
  configurada:!!(process.env.GROK_MCP_CUENTA_EMAIL&&process.env.GROK_MCP_CUENTA_PASSWORD),
  conectar:()=>conectar(req.nextUrl.origin),
 });
 const headers={'Cache-Control':'no-store'};
 return s.cuerpo===undefined?new NextResponse(null,{status:s.status,headers}):NextResponse.json(s.cuerpo,{status:s.status,headers});
}
export const POST=atender;
export const GET=atender;
export const DELETE=atender;
