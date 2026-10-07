import type {Perfil} from '../tipos.ts';
export type MensajeIA={role:'user'|'assistant';content:string};
export type FuenteIA={titulo:string;href:string};
export function alcanceIA(perfil:Pick<Perfil,'rol'|'activo'|'sucursal_id'>,solicitada:string|null) {
 if(!perfil.activo||!['admin','corporativo','gerente'].includes(perfil.rol))throw Error('Sin acceso al asistente.');
 if(perfil.rol==='gerente'){
 if(!perfil.sucursal_id||(solicitada&&solicitada!==perfil.sucursal_id))throw Error('Solo puedes consultar tu sucursal.');
 return perfil.sucursal_id;
 }
 if(solicitada&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(solicitada))throw Error('Sucursal inválida.');
 return solicitada;
}
export function fechaIA(fecha:unknown):string {
 if(typeof fecha!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||!Number.isFinite(Date.parse(`${fecha}T12:00:00Z`))||new Date(`${fecha}T12:00:00Z`).toISOString().slice(0,10)!==fecha)throw Error('Fecha inválida.');
 return fecha;
}
export function rangoIA(desde:unknown,hasta:unknown) {
 const d=fechaIA(desde),h=fechaIA(hasta);const dias=(Date.parse(h)-Date.parse(d))/86400000+1;
 if(dias<1||dias>31)throw Error('Consulta un rango de 1 a 31 días.');return {desde:d,hasta:h};
}
export function mensajesIA(valor:unknown):MensajeIA[] {
 if(!Array.isArray(valor)||valor.length<1||valor.length>10)throw Error('Conversación inválida.');
 let total=0;
 const mensajes=valor.map((x,i)=>{if(!x||typeof x!=='object'||!['user','assistant'].includes(x.role)||typeof x.content!=='string'||!x.content.trim()||x.content.length>(x.role==='user'?2000:8000)||(i>0&&valor[i-1].role===x.role))throw Error('Conversación inválida.');total+=x.content.length;return {role:x.role,content:x.content.trim()} as MensajeIA;});
 if(mensajes[0].role!=='user'||mensajes.at(-1)?.role!=='user'||total>20000)throw Error('Conversación inválida.');return mensajes;
}
