import { ConInfo } from "@/components/ConInfo";
import {CalendarioVentas} from "@/components/CalendarioVentas";
import {MAX_DIAS,periodoElegido} from "@/lib/ventas/calculos";
import {mesDe,moverMes} from "@/lib/ventas/calendario";
import {MasVendidosRappi,PanelRappi} from './PanelRappi';
import {ProductosRappi} from './ProductosRappi';
import {unidadesRappi} from '@/lib/ventas/rappiProductos';
import {cotejoRappiDodo,ordenesDesdeDodo,resumenPanelRappi} from '@/lib/ventas/rappi';
import {obtenerPerfil} from "@/lib/contexto";
import {puedeImportarVentas,veVentasDeTodas} from "@/lib/roles";
import {hoyCalendarioMX,pesos} from "@/lib/formato";
import {leerTodo} from "@/lib/ventas/paginar";
import {Aviso} from "@/components/Aviso";
import {EncabezadoPagina} from "@/components/EncabezadoPagina";
import {BotonEnviar} from "@/components/BotonEnviar";
import {FormularioRappi} from "./Formulario";
import {cargarPedidosAgregadorDodo,cargarRappi,ventaDiariaRappi} from "./datos";
import {vincularProducto,cambiarFuente} from "./acciones";
import {PiezasRappi} from "./PiezasRappi";
import {OrdenesRappi} from "./OrdenesRappi";
export default async function Rappi({searchParams}:{searchParams:Promise<{mes?:string;desde?:string;hasta?:string;sucursal?:string;ok?:string;error?:string}>}){
  const {supabase,perfil}=await obtenerPerfil(),q=await searchParams,edita=puedeImportarVentas(perfil.rol);
  const hoy=hoyCalendarioMX();
  const mes=/^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes??"")&&q.mes!<=hoy.slice(0,7)?q.mes!:hoy.slice(0,7);
  const finMes=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10);
  const periodo=periodoElegido(q.desde,q.hasta,{desde:`${mes}-01`,hasta:finMes<hoy?finMes:hoy});
  const {desde,hasta}=periodo;
  const inicio=moverMes(mesDe(hoy),-12);
  const inicioCalendario=`${inicio.anio}-${String(inicio.mes).padStart(2,"0")}-01`;

  const {data:sucursales,error}=await supabase.from("sucursales").select("id,nombre").order("nombre");if(error)throw Error(error.message);
  const sucursal=veVentasDeTodas(perfil.rol)?(sucursales??[]).find(s=>s.id===q.sucursal)?.id??null:perfil.sucursal_id;
  const [{ordenes,catalogo,agregador},diario,pedidosDodo]=await Promise.all([
    cargarRappi(supabase,sucursal,desde,hasta),
    ventaDiariaRappi(supabase,sucursal,desde<inicioCalendario?desde:inicioCalendario,hoy),
    cargarPedidosAgregadorDodo(supabase,sucursal,desde,hasta),
  ]);
  const pedidosAgregador=ordenesDesdeDodo(pedidosDodo);
  const nombres=new Map((sucursales??[]).map(s=>[s.id,s.nombre]));
  const ids=new Set(ordenes.flatMap(o=>o.rappi_lineas.map(p=>Number(p.producto_id)))),productos=catalogo.filter(c=>ids.has(Number(c.id)));
  const [dodo,piezas]=await Promise.all([
    leerTodo<{dodo_id:number;nombre:string;categoria:string|null}>((a,b)=>supabase.from("productos_venta").select("dodo_id,nombre,categoria").order("dodo_id").range(a,b)),
    leerTodo<{rappi_producto_id:number;dodo_id:number;cantidad:number}>((a,b)=>supabase.from("rappi_producto_piezas").select("rappi_producto_id,dodo_id,cantidad").order("rappi_producto_id").order("dodo_id").range(a,b)),
  ]);
  const piezasDe=(id:number)=>piezas.filter(x=>Number(x.rappi_producto_id)===id).map(x=>({dodo_id:x.dodo_id,cantidad:Number(x.cantidad)})),nombreDodo=new Map(dodo.map(d=>[d.dodo_id,d.nombre]));
  const ventas=ordenes.filter(o=>o.estado==="Finalizado"&&o.sumar),total=ventas.reduce((s,o)=>s+Number(o.subtotal_restaurante),0);
  const totalDodo=pedidosAgregador.reduce((s,o)=>s+Number(o.subtotal_restaurante),0);
  // Cotejo: solo días con venta de agregador en Dodo IS (ahí Dodo IS es la fuente y Rappi sirve para revisar).
  const cotejo=cotejoRappiDodo(ordenes,agregador).filter(d=>d.dodoTotal>0),difCotejo=cotejo.filter(d=>Math.abs(d.diferencia)>=1);
  return <><EncabezadoPagina titulo="Ventas Rappi" descripcion={pedidosAgregador.length?<>{sucursal?nombres.get(sucursal):"Todas las sucursales"} · {ventas.length+pedidosAgregador.length} órdenes · <strong>{pesos(total+totalDodo)}</strong> ({pesos(total)} del portal y {pesos(totalDodo)} de agregador en Dodo IS)</>:<>{sucursal?nombres.get(sucursal):"Todas las sucursales"} · {ventas.length} órdenes finalizadas · <strong>{pesos(total)}</strong> de subtotal restaurante</>}/><Aviso ok={q.ok} error={q.error}/>
    <CalendarioVentas key={`${desde}|${hasta}|${sucursal??""}`} venta={diario.venta} periodo={periodo} hoy={hoy}
      maxDias={MAX_DIAS} sucursal={sucursal} sucursales={veVentasDeTodas(perfil.rol)?sucursales??[]:null} ruta="/ventas/rappi"/>
    <div className="rappi-titulo"><h2>Órdenes en vivo</h2><ConInfo titulo="Órdenes en vivo" etiqueta="Qué suma de Rappi">Solo órdenes que llegan en vivo del portal de Rappi (cada 15 minutos, con un repaso del día anterior a las 6:30). Las órdenes subidas por Excel y los reportes financieros importados no se muestran aquí. El calendario muestra el subtotal restaurante de órdenes finalizadas con fuente Rappi; los descuentos de Rappi quedan separados.</ConInfo>
      <ConInfo titulo="Órdenes en vivo" etiqueta="Cómo leer esto">Indicadores de las órdenes finalizadas recibidas del portal de Rappi en el periodo.</ConInfo></div>
    <PanelRappi ordenes={ordenes} dodo={pedidosAgregador} catalogo={catalogo} periodo={periodo} hoy={hoy} diario={diario}/><ProductosRappi resumen={unidadesRappi(ordenes,catalogo,dodo)}><MasVendidosRappi productos={resumenPanelRappi(ordenes).productos}/></ProductosRappi>{edita&&<FormularioRappi sucursales={sucursales??[]}/>}
    {cotejo.length>0&&<details className="seccion rappi-acordeon" open={difCotejo.length>0}><summary><strong>Cotejo con Dodo IS</strong><span>{cotejo.length} {cotejo.length===1?"día":"días"} con Rappi capturado en Dodo IS · {difCotejo.length?`${difCotejo.length} con diferencia`:"sin diferencias"}</span></summary>
      <p className="saldo-nota">En estos días la venta de Rappi sale de Dodo IS (agregador) y las órdenes del portal no se suman. Operación captura en Dodo IS lo que paga el cliente (con el descuento del restaurante y el de Rappi), así que se compara contra «A facturar» de las órdenes finalizadas del portal, ambos con IVA. Una diferencia suele ser una orden sin capturar, un cupón que Rappi cubrió completo, un combo capturado por piezas o un descuento de Rappi distinto al de la promoción.</p>
      <table className="tabla tabla-tarjetas"><thead><tr><th scope="col">Día</th>{!sucursal&&<th scope="col">Sucursal</th>}<th scope="col">Dodo IS</th><th scope="col">Rappi · a facturar</th><th scope="col">Diferencia</th></tr></thead>
      <tbody>{cotejo.map(d=><tr key={`${d.sucursal_id}|${d.fecha}`}><td data-label="Día">{d.fecha}</td>{!sucursal&&<td data-label="Sucursal">{nombres.get(d.sucursal_id)??d.sucursal_id}</td>}<td data-label="Dodo IS" className="monto">{pesos(d.dodoTotal)} · {d.dodoPedidos}</td><td data-label="Rappi · a facturar" className="monto">{pesos(d.rappiTotal)} · {d.rappiOrdenes}</td><td data-label="Diferencia" className="monto">{Math.abs(d.diferencia)<1?"—":pesos(d.diferencia)}</td></tr>)}</tbody></table></details>}
    {pedidosAgregador.length>0&&<details className="seccion rappi-acordeon"><summary><strong>Pedidos de agregador en Dodo IS ({pedidosAgregador.length})</strong><span>{pesos(totalDodo)} · lo capturado por operación</span></summary>
      <p className="saldo-nota">Estos pedidos suman a la venta de Rappi en los días en que operación los captura en Dodo IS. El importe es lo que paga el cliente (menú de agregador con los descuentos aplicados) y la hora es la de captura.</p>
      <table className="tabla tabla-tarjetas"><thead><tr><th scope="col">Día y hora</th>{!sucursal&&<th scope="col">Sucursal</th>}<th scope="col">Productos</th><th scope="col">Importe</th></tr></thead>
      <tbody>{[...pedidosAgregador].sort((a,b)=>(b.fecha+b.hora).localeCompare(a.fecha+a.hora)).map(o=><tr key={o.rappi_id}><td data-label="Día y hora">{o.fecha} · {o.hora}</td>{!sucursal&&<td data-label="Sucursal">{nombres.get(o.sucursal_id)??o.sucursal_id}</td>}<td data-label="Productos">{o.rappi_lineas.map(l=>`${l.nombre} ${pesos(Number(l.importe))}`).join(" + ")}</td><td data-label="Importe" className="monto">{pesos(Number(o.subtotal_restaurante))}</td></tr>)}</tbody></table></details>}
    <OrdenesRappi ordenes={ordenes} nombres={nombres} edita={edita} sumadas={ventas.length} total={total}/>
    {edita&&productos.length>0&&<details className="seccion rappi-acordeon"><summary><strong>Vincular productos para calcular costos</strong><span>{productos.length} productos · {productos.filter(p=>p.dodo_id==null&&!piezasDe(Number(p.id)).length).length} sin vínculo</span></summary><p className="saldo-nota">Liga cada producto de Rappi a un producto del catálogo. Si el renglón trae extras (pizza + dip, refresco o rolls) o es un combo de Rappi, usa "Varias piezas": su costo será la suma de sus piezas.</p>{productos.map(p=>{const varias=piezasDe(Number(p.id));return <div key={p.id} className="rappi-vinculo"><form action={vincularProducto} className="formulario"><input type="hidden" name="id" value={p.id}/><div className="campo"><label htmlFor={`producto-${p.id}`}>{p.nombre}</label><select id={`producto-${p.id}`} name="dodo" defaultValue={p.dodo_id??""}><option value="">{varias.length?"Ligado a varias piezas":"Sin vínculo / sin costo"}</option>{dodo.map(d=><option key={d.dodo_id} value={d.dodo_id}>{d.nombre}</option>)}</select></div><BotonEnviar>Guardar vínculo</BotonEnviar></form>{varias.length>0&&<p className="saldo-nota">Piezas: {varias.map(v=>`${v.cantidad!==1?`${v.cantidad} × `:""}${nombreDodo.get(v.dodo_id)??v.dodo_id}`).join(" + ")}</p>}<details><summary>Varias piezas</summary><PiezasRappi id={Number(p.id)} inicial={varias} catalogo={dodo}/></details></div>;})}</details>}
    {edita&&ordenes.length>0&&<section className="seccion"><h2>Fuente de ventas Rappi</h2><p>Es automático: en los días en que Dodo IS ya trae venta de agregador, las órdenes del portal no se suman y quedan solo para cotejo. Usa esto solo para excepciones, por ejemplo un periodo capturado en Dodo IS sin agregador. El historial se conserva y una reimportación conserva esta elección.</p><form action={cambiarFuente} className="formulario"><div className="rejilla"><div className="campo"><label htmlFor="fuente-sucursal">Sucursal</label><select id="fuente-sucursal" name="sucursal" required defaultValue={sucursal??""}><option value="">Selecciona</option>{sucursales?.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div><div className="campo"><label htmlFor="fuente-desde">Desde</label><input id="fuente-desde" name="desde" type="date" defaultValue={desde} required/></div><div className="campo"><label htmlFor="fuente-hasta">Hasta</label><input id="fuente-hasta" name="hasta" type="date" defaultValue={hasta} required/></div><div className="campo"><label htmlFor="fuente">Fuente de ventas</label><select id="fuente" name="sumar"><option value="no">Ya incluidas en Dodo IS</option><option value="si">Sumar desde el historial Rappi</option></select></div></div><BotonEnviar confirmar="¿Cambiar la fuente de ventas del periodo seleccionado?">Actualizar fuente</BotonEnviar></form></section>}
  </>;
}
