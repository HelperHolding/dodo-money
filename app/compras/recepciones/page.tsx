import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import {precioUnitario} from '@/lib/formato';
import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Plegable } from "@/components/Plegable";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyCalendarioMX, pesos } from "@/lib/formato";
import { avanceOrden, NOMBRE_AVANCE } from "@/lib/compras/ordenes";
import { esperadasPorDia, estadoEntrega,recibidasPorDia } from "@/lib/compras/entregas";
import { puedeEditarCompras, puedeRecibirCompras } from "@/lib/roles";
import { PestanasRecepciones } from "@/components/PestanasRecepciones";
import { leerTodo } from "@/lib/ventas/paginar";
import { clasificarRecepcion, conciliarRecepcion, ligarProveedorDodo } from "./acciones";
import { FormImportarRecepciones } from "./FormImportarRecepciones";
import { CalendarioEntregas, type OrdenEsperada } from "./CalendarioEntregas";

type Recepcion = {
  id: string; sucursal_id: string; dodo_insumo_id: string; material: string; unidad: string; fecha: string; cantidad: number; precio: number;
  clasificacion: "pendiente" | "orden" | "sin_orden" | "traspaso"; orden_renglon_id: string | null; sucursales: { nombre: string } | null;
  fuente: "excel" | "api"; recibido_en: string | null; factura_texto: string | null; factura_id: string | null; importe_sin_iva: number | null;
  proveedores: { razon_social: string; nombre_comercial: string | null } | null; facturas: { serie: string | null; folio: string | null } | null;
};
type Abierto = {
  id: string; descripcion: string; cantidad: number; recibido: number; precio: number; orden_id: string;
  articulos: { dodo_insumo_id: string | null; unidad: string } | null;
  ordenes_compra: { folio: string; estado: string; sucursal_id: string | null; proveedores: { razon_social: string; nombre_comercial: string | null } | null } | null;
};

type OrdenConfirmada = {
  id: string; folio: string; estado:string; entrega_esperada: string | null;
  proveedores: { razon_social: string; nombre_comercial: string | null } | null; sucursales: { nombre: string } | null;
};

type FacturaPrevista = {id:string;folio:string|null;serie:string|null;uuid:string|null;recepcion_programada_el:string;proveedores:{razon_social:string;nombre_comercial:string|null}|null;sucursales:{nombre:string}|null};

const NOMBRE_CLASE = { pendiente: "Por revisar", orden: "Ligada a orden", sin_orden: "Compra sin orden", traspaso: "Traspaso" } as const;

export default async function Recepciones({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const edita = puedeEditarCompras(perfil.rol);
  // Solo lo que se ve: todas las pendientes y las 40 clasificadas más recientes (el historial completo crece cada día).
  const [pendientes, { data: recientesData }, abiertos,confirmadas] = await Promise.all([
    leerTodo<Recepcion>((d, h) => supabase.from("recepciones_dodo").select("id, sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio, clasificacion, orden_renglon_id, sucursales(nombre), fuente, recibido_en, factura_texto, factura_id, importe_sin_iva, proveedores(razon_social, nombre_comercial), facturas(serie, folio)")
      .eq("clasificacion", "pendiente").order("fecha", { ascending: false }).order("id").range(d, h).returns<Recepcion[]>()),
    supabase.from("recepciones_dodo").select("id, sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio, clasificacion, orden_renglon_id, sucursales(nombre), fuente, recibido_en, factura_texto, factura_id, importe_sin_iva, proveedores(razon_social, nombre_comercial), facturas(serie, folio)")
      .neq("clasificacion", "pendiente").order("fecha", { ascending: false }).order("id").limit(40).returns<Recepcion[]>(),
    leerTodo<Abierto>((d,h)=>supabase.from("renglones_recibido")
      .select("id, descripcion, cantidad, recibido, precio, orden_id, articulos(dodo_insumo_id, unidad), ordenes_compra!inner(folio, estado, sucursal_id, proveedores(razon_social, nombre_comercial))")
      .in("ordenes_compra.estado", ["confirmada","cerrada"]).order("id").range(d,h).returns<Abierto[]>()),
    leerTodo<OrdenConfirmada>((d,h)=>supabase.from("ordenes_compra").select("id, folio, estado, entrega_esperada, proveedores(razon_social, nombre_comercial), sucursales(nombre)")
      .in("estado", ["confirmada","cerrada"]).order("entrega_esperada", { nullsFirst: false }).order("id").range(d,h).returns<OrdenConfirmada[]>()),
  ]);
  const agendaFacturas = await leerTodo<FacturaPrevista>((d,h)=>supabase.from("facturas")
    .select("id,folio,serie,uuid,recepcion_programada_el,proveedores(razon_social,nombre_comercial),sucursales(nombre)")
    .eq("tipo","ingreso").neq("estado","cancelada").not("recepcion_programada_el","is",null).order("recepcion_programada_el").order("id").range(d,h).returns<FacturaPrevista[]>());
  // Recepciones esperadas: órdenes confirmadas que no se han recibido completas.
  const hoy = hoyCalendarioMX();
  const esperadas = (confirmadas ?? []).map((o) => {
    const rs = (abiertos ?? []).filter((a) => a.orden_id === o.id).map((a) => ({ cantidad: Number(a.cantidad), recibido: Number(a.recibido) }));
    const avance = avanceOrden(rs);
    const estado = estadoEntrega(o.entrega_esperada, avance === "completa", hoy);
    const vista: OrdenEsperada & { entrega_esperada: string | null; completa: boolean;cerrada:boolean } = {
      id: o.id, folio: o.folio, proveedor: o.proveedores?.nombre_comercial ?? o.proveedores?.razon_social ?? "", destino: o.sucursales?.nombre ?? "Oficina",
      avance: NOMBRE_AVANCE[avance].toLowerCase(), atrasada: estado === "atrasada", entrega_esperada: o.entrega_esperada, completa: avance === "completa",cerrada:o.estado==="cerrada",
    };
    return vista;
  });
  const porDia = esperadasPorDia(esperadas.filter(o=>!o.cerrada));

  const [hechasDodo,hechasApp]=await Promise.all([
    leerTodo<{id:string;fecha:string;orden_renglon_id:string|null}>((d,h)=>supabase.from("recepciones_dodo").select("id,fecha,orden_renglon_id").gt("cantidad",0).order("id").range(d,h)),
    leerTodo<{id:string;fecha:string;orden_renglon_id:string}>((d,h)=>supabase.from("recepciones_app").select("id,fecha,orden_renglon_id").is("anulada_en",null).is("conciliada_en",null).gt("cantidad",0).order("id").range(d,h)),
  ]);
  const realizadas:Record<string,OrdenEsperada[]>=recibidasPorDia([...hechasDodo,...hechasApp],abiertos,esperadas);

  type DirectaCalendario={id:string;factura_id:string;fecha:string;facturas:{folio:string|null;serie:string|null;proveedores:{nombre_comercial:string|null;razon_social:string}|null;sucursales:{nombre:string}|null}|null};
  const directasCalendario=await leerTodo<DirectaCalendario>((d,h)=>supabase.from("factura_recepciones").select("id,factura_id,fecha,facturas(folio,serie,proveedores(nombre_comercial,razon_social),sucursales(nombre))").is("anulada_en",null).order("id").range(d,h).returns<DirectaCalendario[]>());
  for(const r of directasCalendario){const lista=realizadas[r.fecha]??=[];const clave=`factura:${r.factura_id}`;if(!lista.some(o=>o.id===clave))lista.push({id:clave,folio:`Factura ${r.facturas?.serie??""}${r.facturas?.folio??"Sin folio"}`,proveedor:r.facturas?.proveedores?.nombre_comercial??r.facturas?.proveedores?.razon_social??"",destino:r.facturas?.sucursales?.nombre??"Oficina",avance:"recepción registrada",atrasada:false,href:`/compras/facturas/${r.factura_id}`});}
  const atrasadas = esperadas.filter((o) => !o.cerrada&&o.atrasada);
  const sinFecha = esperadas.filter((o) => !o.cerrada&&!o.completa && !o.entrega_esperada);
  const manuales=edita?await leerTodo<{id:string;orden_renglon_id:string;fecha:string;cantidad:number}>((d,h)=>supabase.from("recepciones_app").select("id,orden_renglon_id,fecha,cantidad").is("anulada_en",null).is("conciliada_en",null).order("id").range(d,h).returns<{id:string;orden_renglon_id:string;fecha:string;cantidad:number}[]>()):[];
  const candidatas=(rec:Recepcion)=>manuales.filter(m=>m.fecha===rec.fecha&&abiertos?.some(r=>r.id===m.orden_renglon_id&&r.ordenes_compra?.sucursal_id===rec.sucursal_id&&(!r.articulos?.dodo_insumo_id||r.articulos.dodo_insumo_id===rec.dodo_insumo_id)));
  const recientes = recientesData ?? [];
  const opciones = (r: Recepcion) => (abiertos ?? []).filter((a) =>
    a.ordenes_compra?.estado==="confirmada"&&a.ordenes_compra?.sucursal_id === r.sucursal_id && (!a.articulos?.dodo_insumo_id || a.articulos.dodo_insumo_id === r.dodo_insumo_id));

  // Proveedores de Dodo IS sin ligar: se agrupan por su ID con insumos y folios de ejemplo para reconocerlos.
  const sinLigar = edita ? await leerTodo<{ dodo_proveedor_id: string; material: string; factura_texto: string | null; fecha: string }>((d, h) =>
    supabase.from("recepciones_dodo").select("dodo_proveedor_id, material, factura_texto, fecha").eq("fuente", "api").is("proveedor_id", null)
      .not("dodo_proveedor_id", "is", null).order("fecha", { ascending: false }).order("id").range(d, h)) : [];
  const proveedoresDodo = [...sinLigar.reduce((m, x) => {
    const p = m.get(x.dodo_proveedor_id) ?? { id: x.dodo_proveedor_id, renglones: 0, materiales: new Set<string>(), folios: new Set<string>(), ultima: x.fecha };
    p.renglones++; p.materiales.add(x.material); if (x.factura_texto) p.folios.add(x.factura_texto);
    return m.set(x.dodo_proveedor_id, p);
  }, new Map<string, { id: string; renglones: number; materiales: Set<string>; folios: Set<string>; ultima: string }>()).values()];
  const { data: cartera } = proveedoresDodo.length
    ? await supabase.from("proveedores").select("id, razon_social, nombre_comercial").eq("activo", true).order("razon_social").returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>()
    : { data: [] };
  const precioOrden = (r: Recepcion) => (r.orden_renglon_id ? (abiertos ?? []).find((a) => a.id === r.orden_renglon_id)?.precio ?? null : null);
  const precioDistinto = (r: Recepcion) => { const p = precioOrden(r); return p !== null && Number(p) > 0 && Math.abs(Number(r.precio) - Number(p)) / Number(p) > 0.01; };
  const datosDodo = (r: Recepcion) => (
    <>
      {r.fuente === "api" && <><dt>Proveedor</dt><dd>{r.proveedores?.nombre_comercial ?? r.proveedores?.razon_social ?? "Sin ligar (ver Proveedores de Dodo IS)"}</dd></>}
      {r.fuente === "api" && <><dt>Factura</dt><dd>{r.factura_id ? <Link href={`/compras/facturas/${r.factura_id}`}>{`${r.facturas?.serie ?? ""}${r.facturas?.folio ?? ""}` || "Factura"}</Link> : r.factura_texto ? `${r.factura_texto} (sin ligar)` : "—"}</dd></>}
      <dt>Precio Dodo IS</dt><dd>{precioUnitario(r.precio)} por {r.unidad}{r.importe_sin_iva !== null ? ` · ${pesos(Number(r.importe_sin_iva))} sin IVA` : ""}</dd>
      {precioDistinto(r) && <><dt>Precio de la orden</dt><dd><span className="insignia" data-tono="aviso">{precioUnitario(Number(precioOrden(r)))} · distinto</span></dd></>}
    </>
  );

  return (
    <>
      <EncabezadoPagina titulo="Recepciones" descripcion="Lo que se recibió en Dodo IS, entrega por entrega, ligado a las órdenes de compra del mismo proveedor y a su factura cuando el folio coincide. Llega solo cada 15 minutos." />
      {puedeRecibirCompras(perfil.rol) && <PestanasRecepciones actual="compras" />}
      <Aviso ok={ok} error={error} />
      <CalendarioEntregas hoy={hoy} porDia={porDia} realizadas={realizadas} />
      {(atrasadas.length > 0 || sinFecha.length > 0) && (
        <section className="seccion" aria-labelledby="t-atrasadas">
          <div className="seccion-cabecera">
            <h2 id="t-atrasadas">Por seguir</h2>
            <span className="recepciones-conteo">
              {atrasadas.length > 0 && <span className="insignia" data-tono="peligro">{atrasadas.length} {atrasadas.length === 1 ? "orden atrasada" : "órdenes atrasadas"}</span>}
              {sinFecha.length > 0 && <span className="insignia" data-tono="aviso">{sinFecha.length} sin fecha</span>}
            </span>
          </div>
          <ul className="lista-filas" style={{ "--columnas": 3 } as React.CSSProperties}>
            <li className="fila fila-encabezado" aria-hidden="true"><span>Orden</span><span>Proveedor</span><span>Para</span><span>Esperada</span></li>
            {[...atrasadas, ...sinFecha].map((o) => (
              <li key={o.id} className="fila" data-alerta={o.atrasada ? "si" : undefined}>
                <div className="fila-nombre"><Link href={`/compras/ordenes/${o.id}`}>{o.folio}</Link><small>{o.avance}</small></div>
                <div className="fila-datos">
                  <span>{o.proveedor}</span>
                  <span>{o.destino}</span>
                  <span>{o.entrega_esperada ? `atrasada desde ${fechaTexto(o.entrega_esperada)}` : "Sin fecha: ponla en la orden"}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {agendaFacturas.length>0 && <section className="seccion">
        <h2>Recepciones programadas desde facturas</h2>
        <p className="saldo-nota">Fechas previstas; no confirman la recepción. Las órdenes vinculadas siguen mostrando su avance real en el calendario de entregas.</p>
        <ul>{agendaFacturas.map(f=><li key={f.id}><Link href={`/compras/facturas/${f.id}`}>{f.serie??""}{f.folio??f.uuid??"Factura"}</Link> · {f.proveedores?.nombre_comercial??f.proveedores?.razon_social} · {f.sucursales?.nombre??"Oficina"} · {fechaTexto(f.recepcion_programada_el)}</li>)}</ul>
      </section>}
      <Plegable id="ordenes-recibidas" titulo="Órdenes ya recibidas" resumen={`${esperadas.filter(o=>o.completa).length} completas`}>
      <div className="tabla-contenedor"><table className="tabla"><thead><tr><th>Orden</th><th>Proveedor</th><th>Sucursal</th><th>Recepción</th></tr></thead><tbody>{esperadas.filter(o=>o.completa).map(o=><tr key={o.id}><td><Link href={`/compras/ordenes/${o.id}`}>{o.folio}</Link></td><td>{o.proveedor}</td><td>{o.destino}</td><td><span className="compra-estado" data-tono="verde">Ya recibido</span></td></tr>)}</tbody></table></div>{!esperadas.some(o=>o.completa)&&<p className="vacio">No hay órdenes recibidas completas.</p>}
      </Plegable>
      {edita && proveedoresDodo.length > 0 && (
        <section className="seccion" aria-labelledby="t-proveedores-dodo">
          <h2 id="t-proveedores-dodo">Proveedores de Dodo IS sin ligar · {proveedoresDodo.length}</h2>
          <p className="saldo-nota">Dodo IS solo manda un ID por proveedor. Elige a quién corresponde una vez y sus recepciones se ligan a sus órdenes y facturas.</p>
          <div className="tarjetas">
            {proveedoresDodo.map((p) => (
              <article key={p.id} className="tarjeta" data-alerta="si">
                <div className="tarjeta-encabezado"><div><h3>{[...p.materiales].slice(0, 3).join(", ")}</h3><p className="tarjeta-estado">{p.renglones} renglones · última {fechaTexto(p.ultima)}</p></div></div>
                <dl className="tarjeta-datos"><dt>Folios</dt><dd>{[...p.folios].slice(0, 4).join(", ") || "—"}</dd><dt>ID Dodo IS</dt><dd><small>{p.id}</small></dd></dl>
                <form action={ligarProveedorDodo} className="formulario">
                  <input type="hidden" name="supplier" value={p.id} />
                  <label className="campo">Proveedor de la cartera
                    <select name="proveedor_id" required defaultValue="">
                      <option value="" disabled>Elige…</option>
                      {(cartera ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre_comercial ?? c.razon_social}</option>)}
                    </select>
                  </label>
                  <BotonEnviar>Ligar proveedor</BotonEnviar>
                </form>
              </article>
            ))}
          </div>
        </section>
      )}
      {edita && <Plegable id="respaldo-excel" titulo="Respaldo: importar Excel de Dodo IS" resumen="Solo para días sin recepciones de la API"><FormImportarRecepciones /></Plegable>}

      <section className="seccion" aria-labelledby="t-pendientes">
        <h2 id="t-pendientes">Por revisar · {pendientes.length}</h2>
        {!pendientes.length && <p className="vacio">Todo lo recibido está ligado o clasificado.</p>}
        <div className="tarjetas">
          {pendientes.map((r) => (
            <article key={r.id} className="tarjeta" data-alerta="si">
              <div className="tarjeta-encabezado">
                <div>
                  <h3>{r.material}</h3>
                  <p className="tarjeta-estado">{r.cantidad} {r.unidad} · {fechaTexto(r.fecha)} · {r.sucursales?.nombre}</p>
                </div>
              </div>
              <dl className="tarjeta-datos">{datosDodo(r)}</dl>
              {edita&&candidatas(r).length>0&&<details className="seccion"><summary>Conciliar con recepción manual ({candidatas(r).length})</summary><p>Elige la captura de esta misma entrega. Se conservarán ambas fuentes sin duplicar cantidades.</p><form action={conciliarRecepcion} className="formulario"><input type="hidden" name="dodo_id" value={r.id}/><label className="campo">Recepción manual<select name="manual_id" required defaultValue=""><option value="" disabled>Elige…</option>{candidatas(r).map(m=><option key={m.id} value={m.id}>{abiertos?.find(a=>a.id===m.orden_renglon_id)?.ordenes_compra?.folio} · {m.fecha} · {m.cantidad}</option>)}</select></label><BotonEnviar pendiente="Conciliando…">Conciliar recepción</BotonEnviar></form></details>}

              {edita && (
                <form action={clasificarRecepcion} className="formulario">
                  <input type="hidden" name="id" value={r.id} />
                  <div className="campo">
                    <label htmlFor={`dest-${r.id}`}>¿A qué corresponde?</label>
                    <select id={`dest-${r.id}`} name="destino" required defaultValue="">
                      <option value="" disabled>Elige…</option>
                      {opciones(r).map((a) => (
                        <option key={a.id} value={`renglon:${a.id}`}>
                          {a.ordenes_compra?.folio} · {a.ordenes_compra?.proveedores?.nombre_comercial ?? a.ordenes_compra?.proveedores?.razon_social} · {a.descripcion} ({a.recibido}/{a.cantidad} {a.articulos?.unidad})
                        </option>
                      ))}
                      <option value="sin_orden">Compra sin orden</option>
                      <option value="traspaso">Traspaso entre sucursales</option>
                    </select>
                  </div>
                  <BotonEnviar>Guardar</BotonEnviar>
                </form>
              )}
            </article>
          ))}
        </div>
      </section>

      <Plegable id="t-recientes" titulo="Recientes" resumen={`${recientes.length} clasificadas`}>
        <div className="tarjetas">
          {recientes.map((r) => (
            <article key={r.id} className="tarjeta" data-alerta={precioDistinto(r) ? "si" : undefined}>
              <div className="tarjeta-encabezado">
                <div>
                  <h3>{r.material}</h3>
                  <p className="tarjeta-estado">{NOMBRE_CLASE[r.clasificacion]}</p>
                </div>
              </div>
              <dl className="tarjeta-datos">
                <dt>Recibido</dt><dd>{r.cantidad} {r.unidad} · {fechaTexto(r.fecha)} · {r.sucursales?.nombre}</dd>
                {r.orden_renglon_id && <><dt>Orden</dt><dd><OrdenDe abiertos={abiertos ?? []} renglon={r.orden_renglon_id} /></dd></>}
                {datosDodo(r)}
              </dl>
              {edita && (
                <form action={clasificarRecepcion} className="acciones">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="destino" value="pendiente" />
                  <BotonEnviar className="boton boton-secundario">Regresar a revisar</BotonEnviar>
                </form>
              )}
            </article>
          ))}
        </div>
      </Plegable>
    </>
  );
}

function OrdenDe({ abiertos, renglon }: { abiertos: Abierto[]; renglon: string }) {
  const a = abiertos.find((x) => x.id === renglon);
  return a ? <Link href={`/compras/ordenes/${a.orden_id}`}>{a.ordenes_compra?.folio}</Link> : <span>Orden cerrada</span>;
}
