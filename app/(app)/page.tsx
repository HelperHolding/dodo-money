import {DashboardVentasInicio} from "@/components/DashboardVentasInicio";
import Link from "next/link";
import { IconoInicio } from "@/components/IconoInicio";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto, puedeAbrirTurno } from "@/lib/contexto";
import { fechaTexto, hoyCalendarioMX, hora, pesos } from "@/lib/formato";
import { avanceRenglon } from "@/lib/compras/ordenes";
import { puedeRecibirCompras, puedeVerVentas, puedeVerCompras, puedeVerFinanzas } from "@/lib/roles";
import { NOMBRE_MOVIMIENTO, type Movimiento } from "@/lib/tipos";
import { abrirTurno } from "./actions";
import { confirmarMovimiento, rechazarMovimiento } from "./movimientos/actions";

export default async function Inicio({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string;ventas_mes?:string;ventas_sucursal?:string }> }) {
  const { ok, error,ventas_mes,ventas_sucursal } = await searchParams;
  const { supabase, perfil, sucursal, turno, cajas, soloLectura } = await obtenerContexto();

  const [{ data: saldos }, { data: pendientes }, { data: nombres }] = await Promise.all([
    supabase.from("saldos_cajas").select("tipo, nombre, saldo").eq("sucursal_id", sucursal.id)
      .returns<{ tipo: string; nombre: string; saldo: number }[]>(),
    supabase.from("movimientos").select("*").eq("sucursal_id", sucursal.id).eq("estado", "pendiente")
      .order("creado_en").returns<Movimiento[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  const { data: porRecibir } = puedeRecibirCompras(perfil.rol) ? await supabase.rpc("ordenes_por_recibir") : { data: [] };
  const ordenesPorRecibir = new Set(((porRecibir ?? []) as { orden_id: string; cantidad: number; recibido: number }[])
    .filter((r) => avanceRenglon(Number(r.cantidad), Number(r.recibido)) !== "completa").map((r) => r.orden_id)).size;

  const accesos = [
    ...(puedeVerVentas(perfil.rol) ? [
      { titulo: "Ventas", nota: "Venta diaria, pedidos y productos", href: `/ventas?sucursal=${sucursal.id}` },
      { titulo: "Rappi", nota: "Órdenes, descuentos y productos", href: `/ventas/rappi?sucursal=${sucursal.id}` },
    ] : []),
    ...(puedeVerCompras(perfil.rol) ? [{ titulo: "Compras y pagos", nota: "Facturas, gastos sin CFDI y proveedores", href: "/compras/facturas" }] : []),
    ...(puedeVerFinanzas(perfil.rol) ? [
      { titulo: "P&L", nota: "Resultados, gastos y metas", href: `/finanzas?sucursal=${sucursal.id}` },
      { titulo: "Retenciones", nota: "Impuestos retenidos en pagos y enteros", href: "/finanzas/retenciones" },
      { titulo: "Mermas", nota: "Productos terminados e insumos al P&L", href: `/finanzas/mermas?sucursal=${sucursal.id}` },
      { titulo: "Costeo y materiales", nota: "Insumos, recetas y costos por producto", href: "/ventas/costos/materiales" },
    ] : []),
    { titulo: "Checklists", nota: "Recorridos y controles de la operación", href: "/checklists" },
  ];
  const fuentes = [
    ...(puedeVerVentas(perfil.rol) ? [
      { tabla: "ventas_dia", nombre: "Ventas Dodo IS", href: `/ventas?sucursal=${sucursal.id}` },
      { tabla: "rappi_ordenes", nombre: "Órdenes Rappi", href: `/ventas/rappi?sucursal=${sucursal.id}` },
    ] : []),
    ...(puedeVerFinanzas(perfil.rol) ? [{ tabla: "mermas_dodo_dias", nombre: "Mermas Dodo IS", href: `/finanzas/mermas?sucursal=${sucursal.id}` }] : []),
  ];
  const actualizacion = await Promise.all(fuentes.map(async (f) => {
    const { data, error } = await supabase.from(f.tabla).select("fecha").eq("sucursal_id", sucursal.id)
      .order("fecha", { ascending: false }).limit(1).maybeSingle<{ fecha: string }>();
    return { ...f, fecha: data?.fecha, error: Boolean(error) };
  }));
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const caja = new Map(cajas.map((c) => [c.id, c.nombre]));
  const saldo = (tipo: string) => saldos?.find((s) => s.tipo === tipo)?.saldo ?? 0;
  const cambios = saldo("cambios");

  return (
    <>
      <div className="encabezado">
        <p className="saldo-nota">Inicio · {fechaTexto(hoyCalendarioMX())}</p>
        <h1>{sucursal.nombre}</h1>
        <p>Ventas, finanzas y operación en un solo lugar.</p>
      </div>
      <Aviso ok={ok} error={error} />
      {["admin","corporativo"].includes(perfil.rol)&&<DashboardVentasInicio supabase={supabase} rol={perfil.rol} mes={ventas_mes} sucursal={ventas_sucursal} porDefecto={sucursal.id} ruta="/"/>}

      <section className="seccion" aria-labelledby="t-resumen">
        <h2 id="t-resumen">Tu operación</h2>
        <div className="inicio-accesos">{accesos.map((a) => <Link key={a.href} className="inicio-acceso" href={a.href}>
          <IconoInicio nombre={a.titulo} />
          <strong>{a.titulo}<span aria-hidden="true">↗</span></strong><span>{a.nota}</span>
        </Link>)}</div>
      </section>
      {actualizacion.length > 0 && <section className="seccion" aria-labelledby="t-datos">
        <h2 id="t-datos">Hasta dónde tenemos datos</h2>
        <p className="saldo-nota">Última fecha registrada en {sucursal.nombre}. No implica que todos los días anteriores estén completos.</p>
        <div className="inicio-fuentes">{actualizacion.map((f) => <Link className="inicio-fuente" href={f.href} key={f.tabla}>
          <span>{f.nombre}</span><strong>{f.error ? "No se pudo consultar" : f.fecha ? fechaTexto(f.fecha) : "Sin datos importados"}</strong>
        </Link>)}</div>
      </section>}
      <section className="seccion" aria-labelledby="t-turno">
        <h2 id="t-turno">Turno</h2>
        {turno ? (
          <div className="acciones">
            <p>Turno {turno.tipo} abierto desde las {hora(turno.abierto_en)}</p>
            {!soloLectura && <Link className="boton" href="/arqueo">Registrar arqueo</Link>}
          </div>
        ) : puedeAbrirTurno(perfil.rol) ? (
          <form action={abrirTurno} className="acciones">
            <select name="tipo" aria-label="Turno" defaultValue="matutino">
              <option value="matutino">Matutino</option>
              <option value="vespertino">Vespertino</option>
            </select>
            <BotonEnviar pendiente="Abriendo…">Abrir turno</BotonEnviar>
          </form>
        ) : (
          <p className="vacio">{soloLectura ? "No hay turno abierto." : "No hay turno abierto. Pide al encargado que lo abra."}</p>
        )}
      </section>

      <section className="seccion" aria-labelledby="t-saldos">
        <h2 id="t-saldos">Efectivo disponible</h2>
        <p className="saldo-nota">Saldos de movimientos confirmados. La caja de venta se revisa en el arqueo de turno.</p>
        <div className="rejilla">
          <div className="saldo">
            <span>Bóveda</span>
            <span className="saldo-monto">{pesos(saldo("boveda"))}</span>
            <span className="saldo-nota">Efectivo de ventas por entregar a corporativo</span>
          </div>
          <div className="saldo">
            <span>Caja chica</span>
            <span className="saldo-monto">{pesos(saldo("caja_chica"))}</span>
            <span className="saldo-nota">Fondo autorizado {pesos(sucursal.fondo_caja_chica)}</span>
          </div>
          <div className="saldo">
            <span>Fondo de cambios</span>
            <span className="saldo-monto">{pesos(cambios)}</span>
            <span className="saldo-nota">
              {Number(cambios) === Number(sucursal.fondo_cambios)
                ? "Completo"
                : `Debe sumar ${pesos(sucursal.fondo_cambios)}`}
            </span>
          </div>
        </div>
      </section>

      {ordenesPorRecibir > 0 && (
        <section className="seccion" aria-labelledby="t-por-recibir">
          <h2 id="t-por-recibir">Por recibir</h2>
          <p>{ordenesPorRecibir === 1 ? "Hay 1 orden de compra" : `Hay ${ordenesPorRecibir} órdenes de compra`} con equipo, servicios u otros por recibir.</p>
          <Link className="boton" href="/recepciones">Registrar lo recibido</Link>
        </section>
      )}

      <section className="seccion" aria-labelledby="t-pendientes">
        <h2 id="t-pendientes">Por confirmar</h2>
        {!pendientes?.length ? (
          <p className="vacio">No hay movimientos esperando confirmación.</p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla tabla-tarjetas">
              <thead><tr><th>Hora</th><th>Movimiento</th><th>De → a</th><th>Registró</th><th>Monto</th><th></th></tr></thead>
              <tbody>
                {pendientes.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Hora">{hora(m.creado_en)}</td>
                    <td data-label="Movimiento">{NOMBRE_MOVIMIENTO[m.tipo]}</td>
                    <td data-label="De → a">{caja.get(m.caja_origen_id)} → {caja.get(m.caja_destino_id)}</td>
                    <td data-label="Registró">{persona.get(m.registrado_por)}</td>
                    <td data-label="Monto" className="monto">{pesos(m.monto)}</td>
                    <td data-label="">
                      {soloLectura ? null : m.registrado_por === perfil.id ? (
                        <span className="saldo-nota">Lo confirma otra persona</span>
                      ) : (
                        <div className="acciones">
                          <form action={confirmarMovimiento}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="volver" value="/" />
                            <BotonEnviar pendiente="…">Recibí el efectivo</BotonEnviar>
                          </form>
                          <form action={rechazarMovimiento}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="volver" value="/" />
                            <BotonEnviar className="boton boton-alerta" pendiente="…" confirmar="¿Rechazar este movimiento? No se puede deshacer; habría que registrarlo de nuevo.">Rechazar</BotonEnviar>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
