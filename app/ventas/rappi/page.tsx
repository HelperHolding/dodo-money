import {CalendarioVentas} from "@/components/CalendarioVentas";
import {MAX_DIAS,periodoElegido} from "@/lib/ventas/calculos";
import {mesDe,moverMes} from "@/lib/ventas/calendario";
import {PanelRappi} from './PanelRappi';
import {ProductosRappi} from './ProductosRappi';
import {unidadesRappi} from '@/lib/ventas/rappiProductos';
import {obtenerPerfil} from "@/lib/contexto";
import {puedeImportarVentas,veVentasDeTodas} from "@/lib/roles";
import {hoyCalendarioMX,pesos} from "@/lib/formato";
import {leerTodo} from "@/lib/ventas/paginar";
import {Aviso} from "@/components/Aviso";
import {EncabezadoPagina} from "@/components/EncabezadoPagina";
import {BotonEnviar} from "@/components/BotonEnviar";
import {FormularioRappi} from "./Formulario";
import {cargarRappi,ventaDiariaRappi} from "./datos";
import {vincularProducto,cambiarFuente,fuenteOrden} from "./acciones";
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
  const [{ordenes,catalogo},ventaDiaria]=await Promise.all([
    cargarRappi(supabase,sucursal,desde,hasta),
    ventaDiariaRappi(supabase,sucursal,desde<inicioCalendario?desde:inicioCalendario,hoy),
  ]);
  const nombres=new Map((sucursales??[]).map(s=>[s.id,s.nombre]));
  const ids=new Set(ordenes.flatMap(o=>o.rappi_lineas.map(p=>Number(p.producto_id)))),productos=catalogo.filter(c=>ids.has(Number(c.id)));
  const dodo=await leerTodo<{dodo_id:number;nombre:string;categoria:string|null}>((a,b)=>supabase.from("productos_venta").select("dodo_id,nombre,categoria").order("dodo_id").range(a,b));
  const ventas=ordenes.filter(o=>o.estado==="Finalizado"&&o.sumar),total=ventas.reduce((s,o)=>s+Number(o.subtotal_restaurante),0);
  return <><EncabezadoPagina titulo="Ventas Rappi" descripcion={<>{sucursal?nombres.get(sucursal):"Todas las sucursales"} · {ventas.length} órdenes finalizadas · <strong>{pesos(total)}</strong> de subtotal restaurante</>}/><Aviso ok={q.ok} error={q.error}/>
    <CalendarioVentas key={`${desde}|${hasta}|${sucursal??""}`} venta={ventaDiaria} periodo={periodo} hoy={hoy}
      maxDias={MAX_DIAS} sucursal={sucursal} sucursales={veVentasDeTodas(perfil.rol)?sucursales??[]:null} ruta="/ventas/rappi"/>
    <details className="nota-plegable"><summary>Qué suma de Rappi</summary><p>Órdenes y productos extraídos del historial. El calendario muestra el subtotal restaurante de órdenes finalizadas con fuente Rappi; los descuentos de Rappi quedan separados. Un día sin importe no confirma que se haya importado todo.</p></details>
    <PanelRappi ordenes={ordenes}/><ProductosRappi resumen={unidadesRappi(ordenes,catalogo,dodo)}/>{edita&&<FormularioRappi sucursales={sucursales??[]}/>}
    <details className="seccion rappi-acordeon"><summary><strong>Ver órdenes importadas ({ordenes.length})</strong><span>{ventas.length} sumadas · {pesos(total)}</span></summary>{!ordenes.length&&<p>No hay órdenes importadas en este periodo.</p>}<p>El costo se calcula únicamente para productos vinculados al catálogo, con costo vigente. Los combos requieren su equivalencia completa.</p>
      <ul className="lista-filas" style={{"--columnas":2} as React.CSSProperties}>{[...ordenes].sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.hora.localeCompare(a.hora)).map(o=><li className="fila" key={o.rappi_id}><div className="fila-nombre"><strong>#{o.rappi_id} · {nombres.get(o.sucursal_id)}</strong><small>{o.fecha} {o.hora} · {o.estado} · {o.sumar?"Fuente Rappi":"Incluida en Dodo IS"}</small><details><summary>Productos y descuentos</summary><ul>{o.rappi_lineas.map(p=><li key={p.linea}>{p.cantidad} × {p.nombre}{p.opciones?` · ${p.opciones}`:""} · {pesos(Number(p.importe))}</li>)}</ul><p>Descuento restaurante {pesos(Number(o.descuento_restaurante))} · Rappi {pesos(Number(o.descuento_rappi))}</p><small>{o.archivo}</small>{edita&&<form action={fuenteOrden}><input type="hidden" name="id" value={o.rappi_id}/><input type="hidden" name="sumar" value={o.sumar?"no":"si"}/><BotonEnviar confirmar="¿Cambiar la fuente de esta orden?">{o.sumar?"Ya incluida en Dodo IS":"Sumar desde Rappi"}</BotonEnviar></form>}</details></div><div className="fila-datos"><span>Subtotal restaurante {pesos(Number(o.subtotal_restaurante))}</span><span>A facturar {pesos(Number(o.facturar))}</span></div></li>)}</ul>
    </details>
    {edita&&productos.length>0&&<details className="seccion rappi-acordeon"><summary><strong>Vincular productos para calcular costos</strong><span>{productos.length} productos</span></summary>{productos.map(p=><form key={p.id} action={vincularProducto} className="formulario"><input type="hidden" name="id" value={p.id}/><div className="campo"><label htmlFor={`producto-${p.id}`}>{p.nombre}</label><select id={`producto-${p.id}`} name="dodo" defaultValue={p.dodo_id??""}><option value="">Sin vínculo / sin costo</option>{dodo.map(d=><option key={d.dodo_id} value={d.dodo_id}>{d.nombre}</option>)}</select></div><BotonEnviar>Guardar vínculo</BotonEnviar></form>)}</details>}
    {edita&&ordenes.length>0&&<section className="seccion"><h2>Cuando Rappi llegue a Dodo IS</h2><p>Para evitar duplicados, marca el periodo cuyas órdenes ya vienen en Dodo IS. El historial se conserva y esas órdenes dejan de sumarse por separado. Una reimportación conserva esta elección.</p><form action={cambiarFuente} className="formulario"><div className="rejilla"><div className="campo"><label htmlFor="fuente-sucursal">Sucursal</label><select id="fuente-sucursal" name="sucursal" required defaultValue={sucursal??""}><option value="">Selecciona</option>{sucursales?.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div><div className="campo"><label htmlFor="fuente-desde">Desde</label><input id="fuente-desde" name="desde" type="date" defaultValue={desde} required/></div><div className="campo"><label htmlFor="fuente-hasta">Hasta</label><input id="fuente-hasta" name="hasta" type="date" defaultValue={hasta} required/></div><div className="campo"><label htmlFor="fuente">Fuente de ventas</label><select id="fuente" name="sumar"><option value="no">Ya incluidas en Dodo IS</option><option value="si">Sumar desde el historial Rappi</option></select></div></div><BotonEnviar confirmar="¿Cambiar la fuente de ventas del periodo seleccionado?">Actualizar fuente</BotonEnviar></form></section>}
  </>;
}
