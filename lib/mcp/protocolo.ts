// JSON-RPC 2.0 mínimo para MCP sin estado (Streamable HTTP con respuestas JSON).
export const VERSIONES=['2025-06-18','2025-03-26'] as const;
export type Id=string|number;
export type Peticion={id?:Id;method:string;params?:Record<string,unknown>};
export type Respuesta={jsonrpc:'2.0';id:Id|null;result?:unknown;error?:{code:number;message:string}};

export const ok=(id:Id,result:unknown):Respuesta=>({jsonrpc:'2.0',id,result});
export const fallo=(id:Id|null,code:number,message:string):Respuesta=>({jsonrpc:'2.0',id,error:{code,message}});
export const esRespuesta=(x:Peticion|Respuesta):x is Respuesta=>'jsonrpc' in x;

export function leerPeticion(raw:string):Peticion|Respuesta {
 let v:unknown;
 try{v=JSON.parse(raw);}catch{return fallo(null,-32700,'JSON inválido.');}
 if(Array.isArray(v))return fallo(null,-32600,'No se aceptan lotes.');
 if(!v||typeof v!=='object')return fallo(null,-32600,'Petición inválida.');
 const o=v as Record<string,unknown>,id=o.id;
 if(id!==undefined&&typeof id!=='string'&&!(typeof id==='number'&&Number.isInteger(id)))return fallo(null,-32600,'Petición inválida.');
 const params=o.params;
 if(o.jsonrpc!=='2.0'||typeof o.method!=='string'||(params!==undefined&&(typeof params!=='object'||params===null||Array.isArray(params))))return fallo((id as Id|undefined)??null,-32600,'Petición inválida.');
 return {id:id as Id|undefined,method:o.method,params:params as Record<string,unknown>|undefined};
}

export function inicializar(pedida:unknown,instrucciones:string) {
 const protocolVersion=(VERSIONES as readonly unknown[]).includes(pedida)?pedida as string:VERSIONES[0];
 return {protocolVersion,capabilities:{tools:{}},serverInfo:{name:'dodo-money',version:'1.0.0'},instructions:instrucciones};
}

export const resultadoTexto=(valor:unknown,isError=false)=>({content:[{type:'text' as const,text:typeof valor==='string'?valor:JSON.stringify(valor)}],...(isError?{isError:true as const}:{})});
