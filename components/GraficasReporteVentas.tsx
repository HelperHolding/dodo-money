import {fechaTexto,pesos} from '@/lib/formato';
import type {MesVenta,HoraVenta} from '@/lib/ventas/graficasReporte';
import estilos from './graficasReporteVentas.module.css';

type Barra={clave:string;etiqueta:string;total:number;detalle:string;pedidos?:number};
function Histograma({titulo,barras}:{titulo:string;barras:Barra[]}){
 const max=Math.max(0,...barras.map(b=>b.total));const ancho=880/barras.length;
 return <svg className={estilos.histograma} viewBox="0 0 960 280" role="img" aria-label={titulo}>
  <title>{titulo}</title>
  {[0,.5,1].map(n=><g key={n}><line x1="70" x2="950" y1={220-190*n} y2={220-190*n} stroke="#ddd"/><text x="64" y={224-190*n} textAnchor="end" fontSize="11" fill="#555">{pesos(max*n)}</text></g>)}
  {barras.map((b,i)=><g key={b.clave}><rect x={74+i*ancho} y={220-(max?b.total/max*190:0)} width={Math.max(1,ancho-8)} height={max?b.total/max*190:0} fill="#ff5500"><title>{b.detalle}</title></rect><text x={70+(i+.5)*ancho} y="244" textAnchor="middle" fontSize="11" fill="#333">{b.etiqueta}</text>{b.pedidos!==undefined&&b.pedidos>0&&<text x={70+(i+.5)*ancho} y="262" textAnchor="middle" fontSize="10" fill="#555">{b.pedidos} ped.</text>}</g>)}
 </svg>;
}
export function GraficasReporteVentas({mensuales,horas,desde,hasta,sinHora,totalPeriodo}:{mensuales:MesVenta[];horas:HoraVenta[];desde:string;hasta:string;sinHora:number;totalPeriodo:number}){
 const dias=[...new Set(horas.map(h=>h.fecha))];
 const detalleTotal=horas.reduce((n,h)=>n+Math.round(h.total*100),0)/100;
 const nombreMes=(mes:string)=>new Intl.DateTimeFormat('es-MX',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${mes}-01T12:00:00Z`));
 return <>
  <section className="seccion"><h2>Ventas por mes y año</h2><p className="saldo-nota">Histórico del {fechaTexto(desde)} al {fechaTexto(hasta)}. Último mes hasta la fecha final del reporte; otros meses pueden tener cobertura parcial. Se muestran únicamente meses con datos importados.</p>
   {mensuales.length?<Histograma titulo="Venta por mes y año, con IVA" barras={mensuales.map(m=>({clave:m.mes,etiqueta:nombreMes(m.mes),total:m.total,detalle:`${nombreMes(m.mes)}: ${pesos(m.total)} · ${m.dias} días con datos`}))}/>:<p>Sin datos mensuales disponibles.</p>}
  </section>
  <section className="seccion"><h2>Horas pico de ventas por día</h2><p className="saldo-nota">Importe vendido por hora local de México, con IVA. Cada barra incluye el número de pedidos al consultarla. Solo pedidos entregados; excluye consumo de personal. Rappi se agrega únicamente cuando está marcado para sumar por separado.</p>
   <p className="saldo-nota">Detalle con hora: {pesos(detalleTotal)} de {pesos(totalPeriodo)} de venta del periodo. Los totales diarios sin pedidos detallados no se distribuyen artificialmente entre horas.{sinHora>0?` ${sinHora} pedidos sin hora válida quedaron fuera de la gráfica.`:''}</p>
   {!dias.length&&<p>No hay pedidos con hora para este periodo.</p>}
   {dias.map(dia=>{
    const filas=horas.filter(h=>h.fecha===dia),pico=filas.reduce((a,b)=>b.total>a.total?b:a),total=filas.reduce((n,h)=>n+Math.round(h.total*100),0)/100;
    return <details key={dia} open className={estilos.dia}><summary><strong>{fechaTexto(dia)}</strong> · {pesos(total)} · Pico {String(pico.hora).padStart(2,'0')}:00 ({pesos(pico.total)}, {pico.pedidos} pedidos)</summary><div className={estilos.contenido}>
     <Histograma titulo={`Venta por hora · ${fechaTexto(dia)}`} barras={Array.from({length:24},(_,hora)=>{const h=filas.find(f=>f.hora===hora);return{clave:String(hora),etiqueta:String(hora).padStart(2,'0'),total:h?.total??0,pedidos:h?.pedidos??0,detalle:`${String(hora).padStart(2,'0')}:00–${String(hora).padStart(2,'0')}:59 · ${pesos(h?.total??0)} · ${h?.pedidos??0} pedidos registrados`};})}/>
     <p className="saldo-nota">Total: {filas.reduce((n,h)=>n+h.pedidos,0)} pedidos con detalle. Sin barra significa sin pedidos registrados en esa hora; no acredita cobertura completa.</p>
    </div></details>;
   })}
  </section>
 </>;
}
