import {test} from 'node:test';
import assert from 'node:assert/strict';
import {manejarMCP,type Conexion,type Dependencias,type Entrada} from './servidor.ts';

const LLAVE='llave-de-prueba-0123456789abcdef';
const rpc=(method:string,params?:unknown,id:number|null=1)=>JSON.stringify({jsonrpc:'2.0',...(id===null?{}:{id}),method,...(params===undefined?{}:{params})});
const post=(cuerpo:string,autorizacion:string|null=`Bearer ${LLAVE}`):Entrada=>({metodo:'POST',autorizacion,cuerpo});
function conexion(over:Partial<Conexion>={}){
 const registro:string[]=[];
 const c:Conexion={rol:'corporativo',
  async reservar(h,a){registro.push(`reservar ${h} ${JSON.stringify(a)}`);return 'id-1';},
  async cerrar(id,estado,error){registro.push(`cerrar ${id} ${estado}${error?` ${error}`:''}`);},
  async ejecutar(a){registro.push(`ejecutar ${a.herramienta}`);return {herramienta:a.herramienta};},...over};
 return {c,registro};
}
const deps=(c?:Conexion,over:Partial<Dependencias>={}):Dependencias=>({llave:LLAVE,configurada:true,conectar:async()=>{if(!c)throw Error('no debería conectar');return c;},...over});
const texto=(s:{cuerpo?:unknown})=>(s.cuerpo as {result:{content:{text:string}[];isError?:boolean}}).result;

test('servidor: configuración, llave y método',async()=>{
 assert.equal((await manejarMCP(post(rpc('ping')),deps(undefined,{llave:undefined}))).status,503);
 assert.equal((await manejarMCP(post(rpc('ping')),deps(undefined,{configurada:false}))).status,503);
 assert.equal((await manejarMCP(post(rpc('ping'),null),deps())).status,401);
 assert.equal((await manejarMCP(post(rpc('ping'),'Bearer otra'),deps())).status,401);
 assert.equal((await manejarMCP({metodo:'GET',autorizacion:`Bearer ${LLAVE}`,cuerpo:''},deps())).status,405);
 assert.equal((await manejarMCP(post('x'.repeat(65537)),deps())).status,413);
});
test('servidor: errores de JSON-RPC, notificaciones y métodos',async()=>{
 const malo=await manejarMCP(post('{no'),deps());assert.equal(malo.status,400);assert.equal((malo.cuerpo as {error:{code:number}}).error.code,-32700);
 assert.equal((await manejarMCP(post(rpc('notifications/initialized',undefined,null)),deps())).status,202);
 const ini=await manejarMCP(post(rpc('initialize',{protocolVersion:'2025-03-26'})),deps());
 assert.equal((ini.cuerpo as {result:{protocolVersion:string}}).result.protocolVersion,'2025-03-26');
 const lista=await manejarMCP(post(rpc('tools/list')),deps());
 assert.equal((lista.cuerpo as {result:{tools:unknown[]}}).result.tools.length,6);
 assert.deepEqual((await manejarMCP(post(rpc('ping')),deps())).cuerpo,{jsonrpc:'2.0',id:1,result:{}});
 const desconocido=await manejarMCP(post(rpc('resources/list')),deps());
 assert.equal((desconocido.cuerpo as {error:{code:number}}).error.code,-32601);
});
test('servidor: tools/call reserva, ejecuta y cierra',async()=>{
 const {c,registro}=conexion();
 const s=await manejarMCP(post(rpc('tools/call',{name:'ventas',arguments:{desde:'2026-11-01',hasta:'2026-11-07'}})),deps(c));
 assert.equal(s.status,200);
 assert.deepEqual(texto(s),{content:[{type:'text',text:'{"herramienta":"ventas"}'}]});
 assert.deepEqual(registro,['reservar ventas {"desde":"2026-11-01","hasta":"2026-11-07","sucursal":null}','ejecutar ventas','cerrar id-1 completada']);
});
test('servidor: sin arguments equivale a {}',async()=>{
 const {c,registro}=conexion();
 const s=await manejarMCP(post(rpc('tools/call',{name:'sucursales'})),deps(c));
 assert.equal(texto(s).isError,undefined);assert.deepEqual(registro,['reservar sucursales {}','ejecutar sucursales','cerrar id-1 completada']);
});
test('servidor: validación falla sin conectar',async()=>{
 const s=await manejarMCP(post(rpc('tools/call',{name:'ventas',arguments:{desde:'2026-11-07',hasta:'2026-11-01'}})),deps());
 assert.deepEqual(texto(s),{content:[{type:'text',text:'Consulta un rango de 1 a 31 días.'}],isError:true});
});
test('servidor: fallas de conexión, límite, consulta, tiempo y cierre',async()=>{
 const sinCuenta=await manejarMCP(post(rpc('tools/call',{name:'sucursales'})),deps(undefined,{conectar:async()=>{throw Error('La cuenta de Grok no está configurada.');}}));
 assert.equal(texto(sinCuenta).content[0].text,'La cuenta de Grok no está configurada.');assert.equal(texto(sinCuenta).isError,true);

 const limite=conexion({async reservar(){throw Error('Espera un minuto: límite de diez llamadas por minuto.');}});
 const sl=await manejarMCP(post(rpc('tools/call',{name:'sucursales'})),deps(limite.c));
 assert.match(texto(sl).content[0].text,/Espera un minuto/);assert.deepEqual(limite.registro,[]);

 const falla=conexion({async ejecutar(){throw Error('Sucursal no disponible.');}});
 const sf=await manejarMCP(post(rpc('tools/call',{name:'sucursales'})),deps(falla.c));
 assert.equal(texto(sf).isError,true);assert.deepEqual(falla.registro,['reservar sucursales {}','cerrar id-1 error Sucursal no disponible.']);

 const lenta=conexion({ejecutar:()=>new Promise(()=>{})});
 const st=await manejarMCP(post(rpc('tools/call',{name:'sucursales'})),deps(lenta.c,{tiempoLimite:20}));
 assert.match(texto(st).content[0].text,/tardó demasiado/);assert.match(lenta.registro.at(-1)!,/^cerrar id-1 error La consulta tardó/);

 const sinCierre=conexion({async cerrar(){throw Error('rpc caída');}});
 const sc=await manejarMCP(post(rpc('tools/call',{name:'sucursales'})),deps(sinCierre.c));
 assert.deepEqual(texto(sc),{content:[{type:'text',text:'La respuesta no pudo registrarse. Vuelve a intentar.'}],isError:true});
});
