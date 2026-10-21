import type {SupabaseClient} from '@supabase/supabase-js';
import {leerTodo} from '@/lib/ventas/paginar';
import {ventasMensuales,ventasHorarias,type PedidoHora} from '@/lib/ventas/graficasReporte';
import {ventaDiariaDesde} from './datos';
import {moverMes,mesDe} from '@/lib/ventas/calendario';
import type {Periodo} from '@/lib/ventas/calculos';

export async function datosGraficasReporte(s:SupabaseClient,sucursal:string|null,periodo:Periodo){
 const inicio=moverMes(mesDe(periodo.hasta),-11);
 const desde=`${inicio.anio}-${String(inicio.mes).padStart(2,'0')}-01`;
 const [venta,pos,rappi]=await Promise.all([
  ventaDiariaDesde(s,sucursal,desde),
  leerTodo<PedidoHora>((a,b)=>{
   let q=s.from('pedidos').select('fecha,hora,total').gte('fecha',periodo.desde).lte('fecha',periodo.hasta).eq('estado','entregado').neq('tipo','personal');
   if(sucursal)q=q.eq('sucursal_id',sucursal);
   return q.order('dodo_id').range(a,b);
  }),
  leerTodo<{fecha:string;hora:string;subtotal_restaurante:number}>((a,b)=>{
   let q=s.from('rappi_ordenes').select('fecha,hora,subtotal_restaurante').gte('fecha',periodo.desde).lte('fecha',periodo.hasta).eq('estado','Finalizado').eq('sumar',true);
   if(sucursal)q=q.eq('sucursal_id',sucursal);
   return q.order('rappi_id').range(a,b);
  }),
 ]);
 const detalle=ventasHorarias([...pos,...rappi.map(p=>({...p,total:p.subtotal_restaurante}))]);
 return{desde,hasta:periodo.hasta,mensuales:ventasMensuales(venta,desde,periodo.hasta),...detalle};
}
