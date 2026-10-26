import type { SupabaseClient } from '@supabase/supabase-js';
import { columnasComparativo, type Periodo } from '@/lib/finanzas/periodo';
import { hoyMX } from '@/lib/formato';
import { INICIO_FECHA } from '@/lib/finanzas/pl';
import { leerTodo } from '@/lib/ventas/paginar';
import { agruparCuentas, detalleTotal, type AportacionPL, type GrupoCuenta } from '@/lib/finanzas/reporteCuentas';
import type { MovimientoContable, AsignacionContable } from '@/lib/finanzas/asignacion';
import { datosPL, vistaPL } from './datos';

export type CeldaCuenta={monto:number|null;grupos:GrupoCuenta[]};
export type FilaCuenta={clave:string;nombre:string;tipo:string;celdas:CeldaCuenta[]};
export async function cuentasPL(supabase:SupabaseClient,p:Periodo,sucursal?:string){
  const {columnas}=columnasComparativo(p,hoyMX(),INICIO_FECHA);
  const desde=columnas[0]?.rango.desde??p.desde,hasta=columnas.at(-1)?.rango.hasta??p.hasta;
  const [cargas,movs,asigs]=await Promise.all([
    Promise.all(columnas.map(c=>datosPL(supabase,c.rango))),
    leerTodo<MovimientoContable>((d,h)=>supabase.from('contabilidad_movimientos').select('*').lte('cubre_desde',hasta).gte('cubre_hasta',desde).order('clave').range(d,h).returns<MovimientoContable[]>()),
    leerTodo<AsignacionContable>((d,h)=>supabase.from('contabilidad_actual').select('*').order('clave').range(d,h).returns<AsignacionContable[]>()),
  ]);
  const movimientos=new Map(movs.map(m=>[m.clave,m])),asignaciones=new Map(asigs.map(a=>[a.clave,a]));
  const vistas=cargas.map(d=>vistaPL(d,sucursal));
  const sucursales=cargas[0]?.porSucursal??[];
  const filas:FilaCuenta[]=vistas[0]?.filas.filter(f=>f.tipo!=='detalle').map(f=>({clave:f.clave,nombre:f.nombre,tipo:f.tipo,celdas:[]}))??[];
  filas.push({clave:'memo_insumos',nombre:'Compras de insumos · fuera del resultado',tipo:'memo',celdas:[]},{clave:'memo_inversiones',nombre:'Inversiones · fuera del resultado',tipo:'memo',celdas:[]});
  for(const [i,d] of cargas.entries()){
    const vista=vistas[i];
    for(const fila of filas){
      const monto=fila.clave==='memo_insumos'?vista.entrada.memos.insumos:fila.clave==='memo_inversiones'?vista.entrada.memos.inversiones:vista.filas.find(f=>f.clave===fila.clave)?.monto??null;
      const detalleDe=(clave:string):AportacionPL[]=>(vista.suc?[vista.suc]:d.porSucursal).flatMap(s=>(d.detalle.get(`${s.id}|${clave}`)??[]).map(item=>({...item,nota:`${s.nombre}${item.nota?` · ${item.nota}`:''}`})));
      const total=detalleTotal(fila.clave,vista.filas,detalleDe);
      const items=total.length?total:detalleDe(fila.clave);
      fila.celdas.push({monto,grupos:monto===null?[]:agruparCuentas(items,monto,movimientos,asignaciones)});
    }
  }
  return {titulo:vistas[0]?.titulo??'Consolidado',sucursales,sucursal:vistas[0]?.suc?.id,columnas:columnas.map(c=>({etiqueta:c.etiqueta,...c.rango})),filas,
    avisos:[...new Set(vistas.flatMap(v=>v.avisos))]};
}
