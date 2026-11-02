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

// Vista checklist: cuatro módulos por etapa. Primero los resúmenes por grupo (equipo por categoría, validaciones técnicas) y después cada actividad.
export const MODULOS_CHECKLIST = [
 {clave:'proyecto',nombre:'Proyecto y permisos',etapas:['P1','P2','P3'],equipo:null},
 {clave:'compras',nombre:'Equipo y compras',etapas:['P4'],equipo:'compra'},
 {clave:'obra',nombre:'Obra',etapas:['P5'],equipo:'obra'},
 {clave:'apertura',nombre:'Preparación y apertura',etapas:['P6','P7'],equipo:null},
] as const;
export type MarcaChecklist = 'listo'|'curso'|'bloqueado'|'pendiente';
export const MARCAS:Record<MarcaChecklist,{texto:string;icono:string}>={listo:{texto:'Listo',icono:'✓'},curso:{texto:'En curso',icono:'◐'},bloqueado:{texto:'Bloqueado',icono:'!'},pendiente:{texto:'Pendiente',icono:''}};
export type LineaChecklist = {clave:string;nombre:string;marca:MarcaChecklist;listos:number;total:number;destino:{item:string}|{vista:string;etapa?:string;cat?:string};hijos?:string[]};
export const marcaItem = (i:ItemApertura):MarcaChecklist => i.estado==='completado'||i.estado==='verificado'||(i.tipo==='equipo'&&i.estado==='instalado')?'listo':i.estado==='bloqueado'?'bloqueado':['pendiente','por_validar','por_cotizar'].includes(i.estado)?'pendiente':'curso';
const marcaGrupo = (de:ItemApertura[]):MarcaChecklist => {const m=de.map(marcaItem);return m.every(x=>x==='listo')?'listo':m.includes('bloqueado')?'bloqueado':m.some(x=>x!=='pendiente')?'curso':'pendiente';};
export function checklistApertura(items:ItemApertura[]) {
 // Misma base que los indicadores: sin no aplica, y el equipo y las referencias por validar quedan fuera.
 const aplicables=items.filter(i=>i.estado!=='no_aplica'&&!(['equipo','referencia'].includes(i.tipo)&&i.estado==='por_validar'));
 const modulos=MODULOS_CHECKLIST.map(m=>{
  const etapas:readonly string[]=m.etapas,lineas:LineaChecklist[]=[];
  const tecnico=aplicables.filter(i=>i.tipo==='tecnico'&&etapas.includes(i.etapa));
  if(tecnico.length)lineas.push({clave:'tecnico',nombre:'Validaciones técnicas',marca:marcaGrupo(tecnico),listos:tecnico.filter(i=>marcaItem(i)==='listo').length,total:tecnico.length,destino:{vista:'tecnico',etapa:etapas.length===1?etapas[0]:undefined},hijos:tecnico.map(i=>i.id)});
  if(m.equipo)for(const c of [...Object.keys(CATEGORIAS) as CategoriaApertura[],null]){
   if((c===null?false:CATEGORIAS[c].obra)!==(m.equipo==='obra'))continue;
   const de=aplicables.filter(i=>(i.tipo==='equipo'||(i.tipo==='referencia'&&i.categoria!==null))&&i.categoria===c);
   if(de.length)lineas.push({clave:c??'sin',nombre:c?CATEGORIAS[c].nombre:'Equipo sin categoría',marca:marcaGrupo(de),listos:de.filter(i=>marcaItem(i)==='listo').length,total:de.length,destino:{vista:'compras',cat:c??'sin'},hijos:de.map(i=>i.id)});
  }
  for(const i of aplicables.filter(i=>i.tipo==='actividad'&&etapas.includes(i.etapa)))lineas.push({clave:i.id,nombre:i.nombre,marca:marcaItem(i),listos:marcaItem(i)==='listo'?1:0,total:1,destino:{item:i.id}});
  const listos=lineas.reduce((s,l)=>s+l.listos,0),total=lineas.reduce((s,l)=>s+l.total,0);
  return {clave:m.clave,nombre:m.nombre,etapas:m.etapas,lineas,listos,total,porcentaje:total?Math.round(listos/total*100):null};
 });
 // El general promedia los módulos para que las cientos de piezas de compras no tapen al resto.
 const conAvance=modulos.filter(m=>m.porcentaje!==null);
 return {modulos,general:conAvance.length?Math.round(conAvance.reduce((s,m)=>s+(m.porcentaje??0),0)/conAvance.length):null};
}

// Cambio rápido de estado desde el checklist. Mismas reglas que actualizar_apertura_item, para pedir en la ventana lo que falte.
export const requisitosEstado = (tipo:ItemApertura['tipo'],estado:string) => ({
 evidencia:['completado','verificado','no_aplica'].includes(estado),
 cantidades:(tipo==='equipo'||tipo==='referencia')&&['recibido_parcial','recibido','instalado','verificado'].includes(estado),
 completa:['recibido','instalado','verificado'].includes(estado),
});
export function validarCambioEstado(tipo:ItemApertura['tipo'],c:{estado:string;evidencia:string;cantidad:string;recibido:string}) {
 const r=requisitosEstado(tipo,c.estado);
 if(!estadosPara(tipo).includes(c.estado))return 'Estado inválido para este registro.';
 if(r.evidencia&&c.evidencia.trim().length<5)return 'Registra evidencia o el motivo de no aplicar.';
 if(!r.cantidades)return null;
 const cantidad=Number(c.cantidad),recibido=Number(c.recibido||0);
 if(!c.cantidad||!(cantidad>0))return 'Confirma la cantidad necesaria.';
 if(r.completa&&recibido<cantidad)return 'Confirma la cantidad necesaria y la recepción completa.';
 if(c.estado==='recibido_parcial'&&(recibido<=0||recibido>=cantidad))return 'La recepción parcial debe ser mayor que cero y menor a la cantidad necesaria.';
 return null;
}
// Conserva todo lo capturado del registro; solo cambian estado, evidencia, notas y, en compras, cantidades.
export function datosCambioEstado(i:ItemApertura,c:{estado:string;evidencia:string;notas:string;cantidad?:string;recibido?:string}) {
 const v=(x:unknown)=>x===null||x===undefined?'':String(x),compra=i.tipo==='equipo'||i.tipo==='referencia';
 return {estado:c.estado,responsable:v(i.responsable),inicio:v(i.inicio),fin:v(i.fin),
  cantidad:compra&&c.cantidad!==undefined?c.cantidad:v(i.cantidad),recibido:compra&&c.recibido!==undefined?c.recibido:v(i.recibido),
  precio:v(i.precio),evidencia:c.evidencia,notas:c.notas,orden_id:v(i.orden_id),factura_id:v(i.factura_id)};
}
