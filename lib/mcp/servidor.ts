// @ts-expect-error Node strip-types requiere extensión explícita.
import {llaveValida} from './auth.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {leerPeticion,esRespuesta,ok,fallo,inicializar,resultadoTexto} from './protocolo.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {HERRAMIENTAS,INSTRUCCIONES,validarArgumentos,type Argumentos} from './herramientas.ts';

export type Conexion={rol:string;reservar(herramienta:string,argumentos:Record<string,unknown>):Promise<string>;cerrar(id:string,estado:'completada'|'error',error:string|null):Promise<void>;ejecutar(a:Argumentos):Promise<unknown>};
export type Dependencias={llave:string|undefined;configurada:boolean;conectar():Promise<Conexion>;tiempoLimite?:number};
export type Entrada={metodo:string;autorizacion:string|null;cuerpo:string};
export type Salida={status:number;cuerpo?:unknown};
export const LIMITE_CUERPO=65536;

const mensaje=(e:unknown)=>(e instanceof Error&&e.message?e.message:'Error desconocido.').slice(0,500);
async function conTiempo<T>(p:Promise<T>,ms:number):Promise<T> {
 let t:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([p,new Promise<never>((_,no)=>{t=setTimeout(()=>no(Error('La consulta tardó demasiado. Reduce el rango e intenta otra vez.')),ms);})]);}
 finally{clearTimeout(t);}
}

export async function manejarMCP(e:Entrada,d:Dependencias):Promise<Salida> {
 if(!d.llave||!d.configurada)return {status:503,cuerpo:{error:'Conector no configurado.'}};
 if(!llaveValida(e.autorizacion,d.llave))return {status:401,cuerpo:{error:'No autorizado.'}};
 if(e.metodo!=='POST')return {status:405,cuerpo:{error:'Método no permitido.'}};
 if(e.cuerpo.length>LIMITE_CUERPO)return {status:413,cuerpo:fallo(null,-32600,'Petición demasiado grande.')};
 const p=leerPeticion(e.cuerpo);
 if(esRespuesta(p))return {status:400,cuerpo:p};
 if(p.id===undefined)return {status:202};
 switch(p.method){
  case 'initialize':return {status:200,cuerpo:ok(p.id,inicializar(p.params?.protocolVersion,INSTRUCCIONES))};
  case 'ping':return {status:200,cuerpo:ok(p.id,{})};
  case 'tools/list':return {status:200,cuerpo:ok(p.id,{tools:HERRAMIENTAS})};
  case 'tools/call':return {status:200,cuerpo:ok(p.id,await llamar(p.params,d))};
  default:return {status:200,cuerpo:fallo(p.id,-32601,'Método no soportado.')};
 }
}

async function llamar(params:Record<string,unknown>|undefined,d:Dependencias) {
 let a:Argumentos,c:Conexion,id:string;
 try{a=validarArgumentos(params?.name,params?.arguments??{});}catch(e){return resultadoTexto(mensaje(e),true);}
 try{c=await d.conectar();}catch(e){return resultadoTexto(mensaje(e),true);}
 const {herramienta,...argumentos}=a;
 try{id=await c.reservar(herramienta,argumentos);}catch(e){return resultadoTexto(mensaje(e),true);}
 let r:unknown;
 try{r=await conTiempo(c.ejecutar(a),d.tiempoLimite??45000);}
 catch(e){const m=mensaje(e);await c.cerrar(id,'error',m).catch(()=>{});return resultadoTexto(m,true);}
 try{await c.cerrar(id,'completada',null);}catch{return resultadoTexto('La respuesta no pudo registrarse. Vuelve a intentar.',true);}
 return resultadoTexto(r);
}
