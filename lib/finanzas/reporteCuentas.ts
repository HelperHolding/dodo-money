import { CATALOGO_HELPER } from './catalogoHelper';
import { estadoAsignacion, type MovimientoContable, type AsignacionContable } from './asignacion';

export type AportacionPL = {
  texto:string; monto:number; href?:string; nota?:string; clave?:string;
  fecha?:string; proveedor?:string; uuid?:string|null; rfc?:string|null;
};
export type GrupoCuenta = { id:string; nombre:string; codigo:string|null; estado:string; items:AportacionPL[]; monto:number };
const centavos=(n:number)=>Math.round(n*100)/100;

/** Totales del estado: solo hojas, sin repetir venta, merma ni subtotales. */
export function detalleTotal(clave:string,filas:readonly {clave:string;tipo:string;monto:number|null}[],detalle:(clave:string)=>readonly AportacionPL[]):AportacionPL[]{
  const ingresos=['venta_neta_dodo','venta_neta_rappi','rappi_fuera_base','rappi_excedente'];
  const costos=['alimento','merma_productos','merma_insumos'];
  const operacion=filas.filter(f=>f.tipo==='gasto'&&!['alimento','merma','oficina'].includes(f.clave)).map(f=>f.clave);
  const claves=clave==='venta_neta'?['venta_neta_dodo','venta_neta_rappi']:clave==='merma'?['merma_productos','merma_insumos']:
    clave==='margen_bruto'?[...ingresos.slice(0,2),...costos]:clave==='ebitda_tienda'?[...ingresos,...costos,...operacion]:clave==='ebitda'?[...ingresos,...costos,...operacion,'oficina']:[];
  const signos=new Set(clave==='venta_neta'||clave==='merma'?[]:ingresos);
  return claves.flatMap(k=>detalle(k).map(item=>({...item,monto:item.monto*(clave==='venta_neta'||clave==='merma'||signos.has(k)?1:-1)})));
}

/** Clasifica aportaciones YA devengadas. Nunca suma el importe bruto de la vista contable. */
export function agruparCuentas(items:readonly AportacionPL[], esperado:number,
  movimientos:ReadonlyMap<string,MovimientoContable>, asignaciones:ReadonlyMap<string,AsignacionContable>):GrupoCuenta[] {
  const grupos=new Map<string,GrupoCuenta>();
  for(const item of items){
    const m=item.clave?movimientos.get(item.clave):undefined;
    const a=item.clave?asignaciones.get(item.clave):undefined;
    const vigente=m&&estadoAsignacion(m,a)==='Asignada';
    const codigo=vigente?a!.codigo:null;
    const estado=codigo?'Cuenta confirmada':m&&a?.codigo?'Revisar: cambió el origen':item.clave?'Pendiente de cuenta':'Fuente calculada';
    const id=codigo??estado;
    const grupo=grupos.get(id)??{id,nombre:codigo?(CATALOGO_HELPER.find(c=>c.codigo===codigo)?.nombre??codigo):estado,codigo,estado,items:[],monto:0};
    grupo.items.push({...item,rfc:m?.rfc??a?.rfc??item.rfc});
    grupo.monto=centavos(grupo.monto+item.monto);grupos.set(id,grupo);
  }
  // El cálculo del P&L redondea por concepto y por fuente. Mostrar explícitamente cualquier diferencia,
  // también si falta un desglose; nunca inventar facturas ni esconder parte del total.
  const diferencia=centavos(esperado-[...grupos.values()].reduce((s,g)=>s+g.monto,0));
  if(diferencia){
    const redondeo=Math.abs(diferencia)<=.05;
    grupos.set('conciliacion',{id:'conciliacion',nombre:redondeo?'Redondeo del periodo':'Diferencia pendiente de desglose',codigo:null,estado:'Conciliación',monto:diferencia,
      items:[{texto:redondeo?'Redondeo entre conceptos y total del P&L':'Importe del P&L que aún no tiene desglose individual',monto:diferencia}]});
  }
  return [...grupos.values()].sort((a,b)=>(a.codigo??'z').localeCompare(b.codigo??'z')||a.nombre.localeCompare(b.nombre));
}
