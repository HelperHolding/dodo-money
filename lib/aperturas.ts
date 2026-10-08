export const ETAPAS = {P1:'Local y alcance',P2:'Proyecto y validación técnica',P3:'Permisos y contratación',P4:'Compras y abastecimiento',P5:'Obra e instalaciones',P6:'Montaje y pruebas',P7:'Preparación y apertura'};
export const ESTADOS: Record<string,string> = {pendiente:'Pendiente',por_validar:'Por validar',en_curso:'En curso',bloqueado:'Bloqueado',completado:'Completado',no_aplica:'No aplica',por_cotizar:'Por cotizar',cotizado:'Cotizado',aprobado:'Aprobado',pedido:'Pedido',recibido_parcial:'Recibido parcial',recibido:'Recibido',instalado:'Instalado',verificado:'Verificado'};
export type ProyectoApertura = {id:string;sucursal_id:string;responsable:string;objetivo_desde:string;objetivo_hasta:string;presupuesto:number|null;revision:number;sucursales:{nombre:string}|null};
export type ItemApertura = {id:string;proyecto_id:string;clave:string;tipo:'actividad'|'equipo'|'referencia'|'tecnico';etapa:keyof typeof ETAPAS;nombre:string;fuente:string;original:Record<string,unknown>;estado:string;responsable:string|null;inicio:string|null;fin:string|null;cantidad:number|null;recibido:number;precio:number|null;evidencia:string|null;notas:string|null;orden_id:string|null;factura_id:string|null;revision:number};
export function resumenApertura(items:ItemApertura[]) {
 const aplicables=items.filter(i=>i.estado!=='no_aplica');
 const terminados=aplicables.filter(i=>i.estado==='completado'||i.estado==='verificado').length;
 const compras=aplicables.filter(i=>['equipo','referencia'].includes(i.tipo)&&i.estado!=='por_validar');
 return {total:aplicables.length,terminados,bloqueados:aplicables.filter(i=>i.estado==='bloqueado').length,
   porValidar:aplicables.filter(i=>i.estado==='por_validar').length,
   cotizado:compras.reduce((s,i)=>s+(i.cantidad!==null&&i.precio!==null?Number(i.cantidad)*Number(i.precio):0),0),
   sinPrecio:compras.filter(i=>i.precio===null||i.cantidad===null).length,
   cotizaciones:compras.filter(i=>i.precio!==null&&i.cantidad!==null).length};
}
export const estadosPara = (tipo:ItemApertura['tipo']) => tipo==='actividad'||tipo==='tecnico'
 ? ['pendiente','por_validar','en_curso','bloqueado','completado','no_aplica']
 : ['por_validar','por_cotizar','cotizado','aprobado','pedido','recibido_parcial','recibido','instalado','verificado','bloqueado','no_aplica'];
export function ventanaEtapa(items:ItemApertura[]) {
 return {desde:items.flatMap(i=>i.inicio?[i.inicio]:[]).sort()[0],hasta:items.flatMap(i=>i.fin?[i.fin]:[]).sort().at(-1)};
}

export function grupoApertura(i:ItemApertura) {
 if(i.estado==='bloqueado')return 'bloqueado';
 if(i.estado==='completado'||i.estado==='verificado')return 'terminado';
 if(['recibido','instalado'].includes(i.estado))return 'recibido';
 if(['en_curso','aprobado','pedido','recibido_parcial'].includes(i.estado))return 'en_curso';
 return 'pendiente';
}
export function indicadoresApertura(items:ItemApertura[],hoy:string) {
 const aplicables=items.filter(i=>i.estado!=='no_aplica');
 const actividades=aplicables.filter(i=>i.tipo==='actividad');
 const equipo=aplicables.filter(i=>i.tipo==='equipo'&&i.estado!=='por_validar');
 const terminadas=actividades.filter(i=>i.estado==='completado').length;
 const conCantidad=equipo.filter(i=>i.cantidad!==null&&Number(i.cantidad)>0);
 const unidades=conCantidad.reduce((s,i)=>s+Number(i.cantidad),0);
 const recibidas=conCantidad.reduce((s,i)=>s+Math.min(Number(i.cantidad),Math.max(0,Number(i.recibido))),0);
 const atrasados=aplicables.filter(i=>i.fin&&i.fin<hoy&&!['completado','verificado'].includes(i.estado));
 const bloqueados=aplicables.filter(i=>i.estado==='bloqueado');
 return {actividades,equipo,terminadas,avance:actividades.length?Math.round(terminadas/actividades.length*100):null,unidades,recibidas,recepcion:unidades?Math.round(recibidas/unidades*100):null,sinCantidad:equipo.length-conCantidad.length,porValidar:aplicables.filter(i=>['equipo','referencia'].includes(i.tipo)&&i.estado==='por_validar').length,atrasados,bloqueados,alertas:aplicables.filter(i=>i.estado==='bloqueado'||atrasados.includes(i))};
}
