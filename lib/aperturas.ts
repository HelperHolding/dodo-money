export const ETAPAS = {P1:'Local y alcance',P2:'Proyecto y validación técnica',P3:'Permisos y contratación',P4:'Compras y abastecimiento',P5:'Obra e instalaciones',P6:'Montaje y pruebas',P7:'Preparación y apertura'};
export const ESTADOS: Record<string,string> = {pendiente:'Pendiente',por_validar:'Por validar',en_curso:'En curso',por_cerrar:'Por cerrar',bloqueado:'Bloqueado',completado:'Completado',no_aplica:'No aplica',por_cotizar:'Por cotizar',cotizado:'Cotizado',aprobado:'Aprobado',pedido:'Pedido',recibido_parcial:'Recibido parcial',recibido:'Recibido',instalado:'Instalado',verificado:'Verificado'};
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
 ? ['pendiente','por_validar','en_curso','por_cerrar','bloqueado','completado','no_aplica']
 : ['por_validar','por_cotizar','cotizado','aprobado','pedido','recibido_parcial','recibido','instalado','verificado','bloqueado','no_aplica'];
export function ventanaEtapa(items:ItemApertura[]) {
 return {desde:items.flatMap(i=>i.inicio?[i.inicio]:[]).sort()[0],hasta:items.flatMap(i=>i.fin?[i.fin]:[]).sort().at(-1)};
}

export function grupoApertura(i:Pick<ItemApertura,'estado'>) {
 if(i.estado==='bloqueado')return 'bloqueado';
 if(i.estado==='completado'||i.estado==='verificado')return 'terminado';
 if(['recibido','instalado'].includes(i.estado))return 'recibido';
 if(['en_curso','por_cerrar','aprobado','pedido','recibido_parcial'].includes(i.estado))return 'en_curso';
 return 'pendiente';
}
export const esObra = (i:ItemApertura) => i.categoria!==null&&CATEGORIAS[i.categoria]?.obra===true;
// Avance por categoría: instalado o verificado sobre los conceptos aplicables (sin no aplica ni por validar).
export function avanceCategorias(items:ItemApertura[]) {
 const compras=items.filter(i=>(i.tipo==='equipo'||i.categoria!==null)&&i.estado!=='no_aplica'&&!(['equipo','referencia'].includes(i.tipo)&&i.estado==='por_validar'));
 const claves=[...Object.keys(CATEGORIAS) as CategoriaApertura[],null];
 return claves.map(clave=>{
  const de=compras.filter(i=>i.categoria===clave),listos=de.filter(i=>marcaItem(i)==='listo').length;
  return {clave,nombre:clave?CATEGORIAS[clave].nombre:'Sin categoría',hoja:clave?CATEGORIAS[clave].hoja:null,obra:clave?CATEGORIAS[clave].obra:false,conceptos:de.length,listos,
   pedidos:de.filter(i=>['aprobado','pedido','recibido_parcial','en_curso'].includes(i.estado)).length,recibidos:de.filter(i=>i.estado==='recibido').length,bloqueados:de.filter(i=>i.estado==='bloqueado').length,
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
 // Vencido: su última fecha (fin, o inicio si no hay fin) ya pasó y no está listo con el criterio del Checklist (equipo instalado es listo).
 const atrasados=aplicables.filter(i=>{const f=i.fin??i.inicio;return !!f&&f<hoy&&marcaItem(i)!=='listo';});
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
export const marcaItem = (i:Pick<ItemApertura,'tipo'|'estado'>):MarcaChecklist => i.estado==='completado'||i.estado==='verificado'||(i.tipo==='equipo'&&i.estado==='instalado')?'listo':i.estado==='bloqueado'?'bloqueado':['pendiente','por_validar','por_cotizar'].includes(i.estado)?'pendiente':'curso';

export type BloqueApertura = 'proyecto'|'compras'|'obra'|'apertura';
export const PESOS_BLOQUE: Record<BloqueApertura, number> = { proyecto: 0.20, compras: 0.35, obra: 0.30, apertura: 0.15 };
const BLOQUES: BloqueApertura[] = ['proyecto','compras','obra','apertura'];
const PUNTOS_EQUIPO: Record<string, number> = { cotizado: 0.25, aprobado: 0.25, pedido: 0.5, recibido_parcial: 0.5, recibido: 0.75, instalado: 1, verificado: 1 };
const PUNTOS_ACTIVIDAD: Record<string, number> = { en_curso: 1/3, por_cerrar: 2/3, completado: 1 };
/** Puntos de una partida (0 a 1) según su etapa: equipo por cotizado/comprado/entregado/instalado; actividades por pasos. */
export const puntosItem = (i: Pick<ItemApertura,'tipo'|'estado'>) =>
  (i.tipo === 'equipo' || i.tipo === 'referencia' ? PUNTOS_EQUIPO : PUNTOS_ACTIVIDAD)[i.estado] ?? 0;
/** Bloque del avance: lo de categoría de obra va a Obra aunque su etapa sea otra (igual que el checklist). */
export function bloqueDe(i: Pick<ItemApertura,'tipo'|'etapa'|'categoria'>): BloqueApertura {
  if (i.categoria !== null && CATEGORIAS[i.categoria]?.obra === true) return 'obra';
  if (i.categoria !== null || i.tipo === 'equipo' || i.tipo === 'referencia' || i.etapa === 'P4') return 'compras';
  if (i.etapa === 'P5') return 'obra';
  return i.etapa === 'P6' || i.etapa === 'P7' ? 'apertura' : 'proyecto';
}
const cuenta = (i: Pick<ItemApertura,'tipo'|'estado'>) => i.estado !== 'no_aplica' && !((i.tipo === 'equipo' || i.tipo === 'referencia') && i.estado === 'por_validar');
/** Avance ponderado por bloque (20/35/30/15). Un bloque vacío reparte su peso; 100 solo si todo está completo. */
export function avanceApertura(items: Pick<ItemApertura,'tipo'|'etapa'|'estado'|'categoria'>[]) {
  const de = items.filter(cuenta);
  const bloques = BLOQUES.map(clave => {
    const p = de.filter(i => bloqueDe(i) === clave);
    const fr = p.length ? p.reduce((s, i) => s + puntosItem(i), 0) / p.length : null;
    return { clave, peso: PESOS_BLOQUE[clave], partidas: p.length, fraccion: fr, porcentaje: fr === null ? null : Math.round(fr * 100) };
  });
  const con = bloques.filter(b => b.fraccion !== null), pesos = con.reduce((s, b) => s + b.peso, 0);
  const completo = de.length > 0 && de.every(i => puntosItem(i) === 1);
  const bruto = pesos ? con.reduce((s, b) => s + b.peso * (b.fraccion as number), 0) / pesos * 100 : null;
  return { bloques: bloques.map(({ fraccion: _f, ...b }) => b), completo,
    general: bruto === null ? null : completo ? 100 : Math.min(99, Math.round(bruto)) };
}
const NOMBRES_BLOQUE: Partial<Record<BloqueApertura, Record<string, string>>> = {
  proyecto: { en_curso: 'Expediente armado / enviado', por_cerrar: 'Ingresado / en revisión', completado: 'Aprobado' },
  obra: { en_curso: 'Cotizado / aprobado', por_cerrar: 'En ejecución', completado: 'Terminado' },
  apertura: { en_curso: 'En curso', por_cerrar: 'Casi listo', completado: 'Listo' },
};
/** Nombre visible del estado: las actividades usan el paso de su bloque; lo demás, ESTADOS. */
export const nombreEstado = (i: Pick<ItemApertura,'tipo'|'etapa'|'categoria'|'estado'>) =>
  (i.tipo === 'actividad' || i.tipo === 'tecnico' ? NOMBRES_BLOQUE[bloqueDe(i)]?.[i.estado] : undefined) ?? ESTADOS[i.estado] ?? i.estado;
export function conteoEtapasEquipo(items: Pick<ItemApertura,'tipo'|'estado'>[]) {
  const r = { sinCotizar: 0, cotizados: 0, pedidos: 0, entregados: 0, instalados: 0 };
  for (const i of items) {
    if ((i.tipo !== 'equipo' && i.tipo !== 'referencia') || !cuenta(i)) continue;
    const p = puntosItem(i);
    if (p === 0) r.sinCotizar++; else if (p === 0.25) r.cotizados++; else if (p === 0.5) r.pedidos++; else if (p === 0.75) r.entregados++; else r.instalados++;
  }
  return r;
}
const marcaGrupo = (de:Pick<ItemApertura,'tipo'|'estado'>[]):MarcaChecklist => {const m=de.map(marcaItem);return m.every(x=>x==='listo')?'listo':m.includes('bloqueado')?'bloqueado':m.some(x=>x!=='pendiente')?'curso':'pendiente';};
export function checklistApertura(items:Pick<ItemApertura,'id'|'nombre'|'tipo'|'etapa'|'estado'|'categoria'>[]) {
 // Misma base que los indicadores: sin no aplica, y el equipo y las referencias por validar quedan fuera.
 const aplicables=items.filter(i=>i.estado!=='no_aplica'&&!(['equipo','referencia'].includes(i.tipo)&&i.estado==='por_validar'));
 const modulos=MODULOS_CHECKLIST.map(m=>{
  const etapas:readonly string[]=m.etapas,lineas:LineaChecklist[]=[];
  // Lo que tiene categoría vive en el grupo de su categoría, no suelto en su etapa.
  const tecnico=aplicables.filter(i=>i.tipo==='tecnico'&&i.categoria===null&&etapas.includes(i.etapa));
  if(tecnico.length)lineas.push({clave:'tecnico',nombre:'Validaciones técnicas',marca:marcaGrupo(tecnico),listos:tecnico.filter(i=>marcaItem(i)==='listo').length,total:tecnico.length,destino:{vista:'tecnico',etapa:etapas.length===1?etapas[0]:undefined},hijos:tecnico.map(i=>i.id)});
  if(m.equipo)for(const c of [...Object.keys(CATEGORIAS) as CategoriaApertura[],null]){
   if((c===null?false:CATEGORIAS[c].obra)!==(m.equipo==='obra'))continue;
   const de=aplicables.filter(i=>c===null?i.tipo==='equipo'&&i.categoria===null:i.categoria===c);
   if(de.length)lineas.push({clave:c??'sin',nombre:c?CATEGORIAS[c].nombre:'Equipo sin categoría',marca:marcaGrupo(de),listos:de.filter(i=>marcaItem(i)==='listo').length,total:de.length,destino:{vista:'compras',cat:c??'sin'},hijos:de.map(i=>i.id)});
  }
  for(const i of aplicables.filter(i=>i.tipo==='actividad'&&i.categoria===null&&etapas.includes(i.etapa)))lineas.push({clave:i.id,nombre:i.nombre,marca:marcaItem(i),listos:marcaItem(i)==='listo'?1:0,total:1,destino:{item:i.id}});
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

// Lo que el checklist necesita en el navegador de cada concepto; llega de la página, del guardado o de Realtime.
export type ItemChecklist = Pick<ItemApertura,'id'|'nombre'|'tipo'|'etapa'|'estado'|'categoria'|'evidencia'|'notas'|'revision'> & {cantidad:number|null;recibido:number;unidad:string|null};
export const aItemChecklist = (i:Pick<ItemApertura,'id'|'nombre'|'tipo'|'etapa'|'estado'|'categoria'|'evidencia'|'notas'|'revision'|'cantidad'|'recibido'> & {original?:Record<string,unknown>|null}):ItemChecklist => ({
 id:i.id,nombre:i.nombre,tipo:i.tipo,etapa:i.etapa,estado:i.estado,categoria:i.categoria??null,evidencia:i.evidencia??null,notas:i.notas??null,revision:Number(i.revision),
 cantidad:i.cantidad===null||i.cantidad===undefined?null:Number(i.cantidad),recibido:Number(i.recibido??0),unidad:typeof i.original?.unidad==='string'?i.original.unidad:null});
// Gana la revisión más nueva: un aviso de Realtime atrasado o una página recargada antes de tiempo no deshacen un cambio.
export function fusionarItems(actual:Record<string,ItemChecklist>,nuevos:ItemChecklist[]) {
 let cambio=false;const r={...actual};
 for(const n of nuevos){const a=r[n.id];if(a&&a.revision>=n.revision)continue;r[n.id]=n;cambio=true;}
 return cambio?r:actual;
}

/** Portada de Aperturas: actividades terminadas de las aplicables por proyecto (misma regla que resumenApertura). */
export function avancePorProyecto(items:readonly {proyecto_id:string;estado:string}[]):Record<string,{terminados:number;total:number}>{
 const r:Record<string,{terminados:number;total:number}>={};
 for(const i of items){
  if(i.estado==='no_aplica')continue;
  const a=r[i.proyecto_id]??={terminados:0,total:0};
  a.total++;if(i.estado==='completado'||i.estado==='verificado')a.terminados++;
 }
 return r;
}

const diasEntre=(desde:string,hasta:string)=>Math.round((Date.parse(`${hasta}T12:00:00Z`)-Date.parse(`${desde}T12:00:00Z`))/86_400_000);
/**
 * Estado de la portada según la ventana objetivo: cuenta regresiva antes de abrir (aviso en la última semana),
 * «En ventana» dentro de ella y, ya pasada, «Abierta» si todo está terminado u «Objetivo vencido» si falta algo.
 */
export function cuentaRegresiva(desde:string,hasta:string,hoy:string,avance:{terminados:number;total:number}):{texto:string;tono:'ok'|'aviso'|'alerta'|'info'}{
 if(hoy<desde){const d=diasEntre(hoy,desde);return {texto:d===1?'Abre mañana':`Abre en ${d} días`,tono:d<=7?'aviso':'info'};}
 if(hoy<=hasta)return {texto:'En ventana de apertura',tono:'aviso'};
 return avance.total>0&&avance.terminados===avance.total?{texto:'Abierta',tono:'ok'}:{texto:'Objetivo vencido',tono:'alerta'};
}

/** Primero las aperturas por venir (la más próxima arriba); las que ya pasaron al final, la más reciente primero. */
export function ordenarProyectos<T extends {objetivo_desde:string;objetivo_hasta:string}>(lista:readonly T[],hoy:string):T[]{
 const vienen=lista.filter(p=>p.objetivo_hasta>=hoy).sort((a,b)=>a.objetivo_desde.localeCompare(b.objetivo_desde));
 const pasaron=lista.filter(p=>p.objetivo_hasta<hoy).sort((a,b)=>b.objetivo_hasta.localeCompare(a.objetivo_hasta));
 return [...vienen,...pasaron];
}

/** Porcentaje entero de actividades terminadas; 100 solo si de verdad está todo, y null si no hay actividades. */
export function porcentajeAvance(a:{terminados:number;total:number}):number|null{
 if(!a.total)return null;
 const p=Math.round(a.terminados/a.total*100);
 return a.terminados<a.total?Math.min(99,p):100;
}
