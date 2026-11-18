import type {SupabaseClient} from '@supabase/supabase-js';
import {leerTodo} from '@/lib/ventas/paginar';
import {ventasMensuales,ventasHorarias,type PedidoHora} from '@/lib/ventas/graficasReporte';
import {ventaDiariaDesde} from './datos';
import {cargarAgregadorDodo} from './rappi/datos';
import {claveDia,diasConAgregador} from '@/lib/ventas/rappi';
import {moverMes,mesDe} from '@/lib/ventas/calendario';
import type {Periodo} from '@/lib/ventas/calculos';

export async function datosGraficasReporte(s:SupabaseClient,sucursal:string|null,periodo:Periodo){
 const inicio=moverMes(mesDe(periodo.hasta),-11);
 const desde=`${inicio.anio}-${String(inicio.mes).padStart(2,'0')}-01`;
 const [venta,pos,rappi,agregador]=await Promise.all([
  ventaDiariaDesde(s,sucursal,desde),
  leerTodo<PedidoHora>((a,b)=>{
   let q=s.from('pedidos').select('fecha,hora,total').gte('fecha',periodo.desde).lte('fecha',periodo.hasta).eq('estado','entregado').neq('tipo','personal');
   if(sucursal)q=q.eq('sucursal_id',sucursal);
   return q.order('dodo_id').range(a,b);
  }),
  leerTodo<{sucursal_id:string;fecha:string;hora:string;subtotal_restaurante:number}>((a,b)=>{
   let q=s.from('rappi_ordenes').select('sucursal_id,fecha,hora,subtotal_restaurante').gte('fecha',periodo.desde).lte('fecha',periodo.hasta).eq('estado','Finalizado').eq('sumar',true);
   if(sucursal)q=q.eq('sucursal_id',sucursal);
   return q.order('rappi_id').range(a,b);
  }),
  cargarAgregadorDodo(s,sucursal,periodo.desde,periodo.hasta),
 ]);
 // Los días en que Dodo IS ya trae venta de agregador, sus pedidos ya están en pos.
 const cubiertos=diasConAgregador(agregador);
 const detalle=ventasHorarias([...pos,...rappi.filter(p=>!cubiertos.has(claveDia(p.sucursal_id,p.fecha))).map(p=>({fecha:p.fecha,hora:p.hora,total:p.subtotal_restaurante}))]);
 return{desde,hasta:periodo.hasta,mensuales:ventasMensuales(venta,desde,periodo.hasta),...detalle};
}
