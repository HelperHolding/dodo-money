export const ETAPAS = {P1:'Local y alcance',P2:'Proyecto y validación técnica',P3:'Permisos y contratación',P4:'Compras y abastecimiento',P5:'Obra e instalaciones',P6:'Montaje y pruebas',P7:'Preparación y apertura'};
export const ESTADOS: Record<string,string> = {pendiente:'Pendiente',por_validar:'Por validar',en_curso:'En curso',bloqueado:'Bloqueado',completado:'Completado',no_aplica:'No aplica',por_cotizar:'Por cotizar',cotizado:'Cotizado',aprobado:'Aprobado',pedido:'Pedido',recibido_parcial:'Recibido parcial',recibido:'Recibido',instalado:'Instalado',verificado:'Verificado'};
// Pestañas de especificaciones del plano (equipo.xlsx). La 11 resume los contactos de la 09. Obra: se instala en sitio y no cuenta como equipo recibido.
export const CATEGORIAS = {
 equipo_cocina:{nombre:'Equipo de cocina',hoja:'01',obra:false},mobiliario:{nombre:'Mobiliario',hoja:'02',obra:false},camara_fria:{nombre:'Cámara fría',hoja:'03',obra:false},
 puertas:{nombre:'Puertas',hoja:'04',obra:true},zoclos:{nombre:'Zoclos',hoja:'05',obra:true},pisos:{nombre:'Pisos',hoja:'06',obra:true},acabados:{nombre:'Acabados de muros y plafón',hoja:'07',obra:true},
 paneles:{nombre:'Paneles de muro',hoja:'08',obra:true},contactos:{nombre:'Contactos de cocina',hoja:'09 y 11',obra:true},salidas_cable:{nombre:'Salidas de cable',hoja:'10',obra:true},
 baja_tension:{nombre:'Baja tensión (audio y red)',hoja:'12',obra:true},iluminacion:{nombre:'Iluminación',hoja:'13',obra:true},plafones:{nombre:'Plafones',hoja:'14',obra:true},
 sanitarios:{nombre:'Sanitarios',hoja:'15',obra:true},senaletica_interior:{nombre:'Señalética interior',hoja:'16',obra:false},senaletica_fachada:{nombre:'Señalética de fachada',hoja:'17',obra:false},
} as const;
export type CategoriaApertura = keyof typeof CATEGORIAS;
export const esCategoria = (v:unknown):v is CategoriaApertura => typeof v==='string'&&Object.hasOwn(CATEGORIAS,v);
export type ProyectoApertura = {id:string;sucursal_id:string;responsable:string;objetivo_desde:string;objetivo_hasta:string;presupuesto:number|null;revision:number;sucursales:{nombre:string}|null};
export type ItemApertura = {id:string;proyecto_id:string;clave:string;tipo:'actividad'|'equipo'|'referencia'|'tecnico';etapa:keyof typeof ETAPAS;nombre:string;fuente:string;original:Record<string,unknown>;estado:string;responsable:string|null;inicio:string|null;fin:string|null;cantidad:number|null;recibido:number;precio:number|null;evidencia:string|null;notas:string|null;orden_id:string|null;factura_id:string|null;revision:number;categoria:CategoriaApertura|null};
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
export const esObra = (i:ItemApertura) => i.categoria!==null&&CATEGORIAS[i.categoria]?.obra===true;
// Avance por categoría: instalado o verificado sobre los conceptos aplicables (sin no aplica ni por validar).
export function avanceCategorias(items:ItemApertura[]) {
 const compras=items.filter(i=>(i.tipo==='equipo'||(i.tipo==='referencia'&&i.categoria!==null))&&i.estado!=='no_aplica'&&i.estado!=='por_validar');
 const claves=[...Object.keys(CATEGORIAS) as CategoriaApertura[],null];
 return claves.map(clave=>{
  const de=compras.filter(i=>i.categoria===clave),listos=de.filter(i=>i.estado==='instalado'||i.estado==='verificado').length;
  return {clave,nombre:clave?CATEGORIAS[clave].nombre:'Sin categoría',hoja:clave?CATEGORIAS[clave].hoja:null,obra:clave?CATEGORIAS[clave].obra:false,conceptos:de.length,listos,
   pedidos:de.filter(i=>['aprobado','pedido','recibido_parcial'].includes(i.estado)).length,recibidos:de.filter(i=>i.estado==='recibido').length,bloqueados:de.filter(i=>i.estado==='bloqueado').length,
   porcentaje:de.length?Math.round(listos/de.length*100):null};
 }).filter(c=>c.conceptos>0);
}
export function indicadoresApertura(items:ItemApertura[],hoy:string) {
 const aplicables=items.filter(i=>i.estado!=='no_aplica');
 const actividades=aplicables.filter(i=>i.tipo==='actividad');
 const equipo=aplicables.filter(i=>i.tipo==='equipo'&&i.estado!=='por_validar'&&!esObra(i));
 const terminadas=actividades.filter(i=>i.estado==='completado').length;
 const conCantidad=equipo.filter(i=>i.cantidad!==null&&Number(i.cantidad)>0);
 const unidades=conCantidad.reduce((s,i)=>s+Number(i.cantidad),0);
 const recibidas=conCantidad.reduce((s,i)=>s+Math.min(Number(i.cantidad),Math.max(0,Number(i.recibido))),0);
 const atrasados=aplicables.filter(i=>i.fin&&i.fin<hoy&&!['completado','verificado'].includes(i.estado));
 const bloqueados=aplicables.filter(i=>i.estado==='bloqueado');
 return {actividades,equipo,terminadas,avance:actividades.length?Math.round(terminadas/actividades.length*100):null,unidades,recibidas,recepcion:unidades?Math.round(recibidas/unidades*100):null,sinCantidad:equipo.length-conCantidad.length,porValidar:aplicables.filter(i=>['equipo','referencia'].includes(i.tipo)&&i.estado==='por_validar').length,atrasados,bloqueados,alertas:aplicables.filter(i=>i.estado==='bloqueado'||atrasados.includes(i))};
}
