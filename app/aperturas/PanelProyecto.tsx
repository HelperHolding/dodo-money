import Link from 'next/link';
import {grupoApertura,indicadoresApertura,resumenApertura,type ItemApertura,type ProyectoApertura} from '@/lib/aperturas';
import {pesos} from '@/lib/formato';
import {cortePresupuesto} from '@/lib/cortePresupuesto';

const grupos=[['pendiente','Pendientes / por cotizar','var(--tinta-3)'],['en_curso','En curso / pedidos','var(--dato-2)'],['recibido','Recibidos / instalados','var(--turquesa)'],['bloqueado','Bloqueados','var(--alerta)'],['terminado','Terminados / verificados','var(--cuadra)']] as const;
function Dona({items,titulo,href}:{items:ItemApertura[];titulo:string;href:string}) {
 let recorrido=0;
 const partes=grupos.map(([clave,nombre,color])=>({clave,nombre,color,n:items.filter(i=>grupoApertura(i)===clave).length})).filter(g=>g.n);
 return <section className="ap-panel"><h2>{titulo}</h2><div className="ap-distribucion"><div className="ap-dona"><svg viewBox="0 0 120 120" role="img" aria-label={`${titulo}: ${items.length} registros; detalle en la leyenda`}><circle cx="60" cy="60" r="46" fill="none" style={{stroke:"var(--dato-pista)"}} strokeWidth="14"/>{partes.map(g=>{const largo=g.n/items.length*100,offset=recorrido;recorrido+=largo;return <a key={g.clave} href={`${href}&grupo=${g.clave}`} aria-label={`${g.nombre}: ${g.n}`}><circle cx="60" cy="60" r="46" fill="none" style={{stroke:g.color}} strokeWidth="14" pathLength="100" strokeDasharray={`${largo} ${100-largo}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)"><title>{`${g.nombre}: ${g.n}`}</title></circle></a>;})}</svg><div><strong>{items.length}</strong><small>registros</small></div></div><ul className="ap-leyenda">{partes.map(g=><li key={g.clave}><Link href={`${href}&grupo=${g.clave}`}><span className="ap-punto" style={{background:g.color}}/><span>{g.nombre}</span><strong>{g.n}</strong><small>{Math.round(g.n/items.length*100)} %</small></Link></li>)}</ul></div>{!items.length&&<p className="ap-nota">Sin registros aplicables.</p>}</section>;
}
export function PanelProyecto({proyecto:p,items,hoy}:{proyecto:ProyectoApertura;items:ItemApertura[];hoy:string}) {
 const r=indicadoresApertura(items,hoy),compras=resumenApertura(items),base=`/aperturas/${p.id}`;
 const corte=cortePresupuesto(items),firme=corte?Math.round((corte.adquirido+corte.cotizado)*100)/100:null;
 const porcentajeFirme=corte&&firme!==null?Math.round(firme/corte.total_sin_iva*100):null;
 const porcentaje=p.presupuesto!==null&&Number(p.presupuesto)>0?Math.round(compras.cotizado/Number(p.presupuesto)*100):null;
 return <>
 <div className="ap-indicadores">
 <Link className="ap-indicador" href={`${base}?vista=actividades`}><span>Avance de actividades</span><strong>{r.avance===null?'—':`${r.avance} %`}</strong><progress value={r.avance??0} max={100} aria-label="Avance de actividades"/><small>{r.terminadas} de {r.actividades.length} terminadas · excluye no aplica</small></Link>
 <Link className="ap-indicador" href={`${base}?vista=compras&tipo=equipo&ambito=equipo`}><span>Equipo recibido</span><strong>{r.recepcion===null?'—':`${r.recepcion} %`}</strong><progress value={r.recepcion??0} max={100} aria-label="Unidades de equipo recibidas"/><small>{r.recibidas} de {r.unidades} unidades · {r.sinCantidad} conceptos sin cantidad</small></Link>
 {corte&&firme!==null?<Link className="ap-indicador" href={`${base}#corte-presupuesto`}><span>Presupuesto con precio firme</span><strong>{pesos(firme)}</strong><small>Sin IVA · {porcentajeFirme} % de {pesos(corte.total_sin_iva)}</small><small>Adquirido + cotizado / confirmado · corte {corte.fecha.split('-').reverse().join('/')}. No representa pagos ni recepción.</small></Link>:<Link className="ap-indicador" data-alerta={porcentaje!==null&&porcentaje>100} href={`${base}?vista=compras`}><span>Estimado de compras</span><strong>{pesos(compras.cotizado)}</strong><small>Presupuesto: {p.presupuesto===null?'sin definir':pesos(p.presupuesto)}{porcentaje!==null?` · ${porcentaje} %`:''}</small><small>{compras.sinPrecio} conceptos sin cotización completa. No representa pagos.</small></Link>}
 <Link className="ap-indicador" data-alerta={r.alertas.length>0} href={`${base}?vista=alertas`}><span>Necesitan atención</span><strong>{r.alertas.length}</strong><small>{r.bloqueados.length} bloqueados · {r.atrasados.length} vencidos</small><small>Un registro bloqueado y vencido cuenta una sola vez.</small></Link>
 </div>
 <div className="ap-graficas"><Dona items={r.actividades} titulo="Estado de actividades" href={`${base}?vista=actividades`}/><Dona items={r.equipo} titulo="Estado del equipo" href={`${base}?vista=compras&tipo=equipo&ambito=equipo`}/></div>
 <p className="ap-nota">{r.porValidar} conceptos de equipo o referencia por validar, fuera del indicador de recepción. La recepción mide unidades; la dona cuenta conceptos. Recibir equipo no equivale a verificar su instalación. Las categorías de obra (puertas, pisos, acabados, instalaciones eléctricas, iluminación, plafones y sanitarios) se siguen por categoría en Equipo y compras.</p>
 </>;
}
