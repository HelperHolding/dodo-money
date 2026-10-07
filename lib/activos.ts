export const CATEGORIAS = {cocina:'Equipo de cocina',refrigeracion:'Refrigeración',mobiliario:'Mobiliario',tecnologia:'Tecnología',instalaciones:'Instalaciones',otros:'Otros'};
export const ESTADOS_ACTIVO = {recibido:'Recibido',instalado:'Instalado',en_uso:'En uso',en_mantenimiento:'En mantenimiento',fuera_servicio:'Fuera de servicio',baja:'Baja'};
export type Activo = {id:string;codigo:number;sucursal_id:string;nombre:string;categoria:keyof typeof CATEGORIAS;estado:keyof typeof ESTADOS_ACTIVO;ubicacion:string|null;responsable:string|null;marca:string|null;modelo:string|null;serie:string|null;condicion:string|null;evidencia:string|null;adquirido:string|null;costo:number|null;garantia_hasta:string|null;proveedor_id:string|null;factura_id:string|null;apertura_item_id:string|null;revision:number;sucursales?:{nombre:string}|null};
export type Valuacion = {orden:number;id:string;activo_id:string;fecha:string;valor:number;criterio:string;evidencia:string|null;creado_en:string};
export type Mantenimiento = {id:string;activo_id:string;tipo:string;tarea:string;programado:string;estado:string;realizado:string|null;costo:number|null;tecnico:string|null;evidencia:string|null;revision:number};
export const codigoActivo = (codigo:number) => `ACT-${String(codigo).padStart(5,'0')}`;
export const fechaActivo = (fecha:string) => new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${fecha}T12:00:00Z`));
export function avisoMantenimiento(m:Mantenimiento,hoy:string) {
 if(m.estado!=='pendiente')return m.estado==='completado'?'Completado':'Anulado';
 if(m.programado<hoy)return 'Vencido';
 const limite=new Date(`${hoy}T12:00:00Z`);limite.setUTCDate(limite.getUTCDate()+7);
 return m.programado<=limite.toISOString().slice(0,10)?'Próximo (7 días)':'Programado';
}
export function valoresVigentes(valuaciones:Valuacion[]) {
 const porActivo=new Map<string,Valuacion>();
 for(const v of valuaciones){const a=porActivo.get(v.activo_id);if(!a||v.fecha>a.fecha||(v.fecha===a.fecha&&(v.orden>a.orden)))porActivo.set(v.activo_id,v);}
 return porActivo;
}
