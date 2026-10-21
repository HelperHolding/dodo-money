export type MesVenta={mes:string;total:number;dias:number};
export type HoraVenta={fecha:string;hora:number;total:number;pedidos:number};
export type PedidoHora={fecha:string;hora:string;total:number|string};

/** Meses de calendario separados por año; ausencia de datos no se convierte en venta cero. */
export function ventasMensuales(venta:Record<string,number>,desde:string,hasta:string):MesVenta[]{
 const meses=new Map<string,{centavos:number;dias:number}>();
 for(const [fecha,total] of Object.entries(venta)){
  if(fecha<desde||fecha>hasta)continue;
  const mes=fecha.slice(0,7),f=meses.get(mes)??{centavos:0,dias:0};
  f.centavos+=Math.round(total*100);f.dias++;meses.set(mes,f);
 }
 return [...meses].sort(([a],[b])=>a.localeCompare(b)).map(([mes,f])=>({mes,total:f.centavos/100,dias:f.dias}));
}
export function ventasHorarias(pedidos:readonly PedidoHora[]):{horas:HoraVenta[];sinHora:number}{
 const mapa=new Map<string,HoraVenta>();let sinHora=0;
 for(const p of pedidos){
  if(!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(p.hora??'')){sinHora++;continue;}
  const hora=Number(p.hora.slice(0,2)),clave=`${p.fecha}|${hora}`;
  const f=mapa.get(clave)??{fecha:p.fecha,hora,total:0,pedidos:0};
  f.total=(Math.round(f.total*100)+Math.round(Number(p.total)*100))/100;f.pedidos++;mapa.set(clave,f);
 }
 return{horas:[...mapa.values()].sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.hora-b.hora),sinHora};
}
