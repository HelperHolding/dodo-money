import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { Icono } from "@/components/Icono";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyCalendarioMX, pesos } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { ventanaCompromisos, CONCEPTOS, ESTADO_PAGO, avisosCompromisos, estadoPago, servicioSinComprobar, textoFrecuencia, tituloCompromiso, type FechaCompromiso } from "@/lib/compras/compromisos";
import { importesDe, leerCompromisos, leerFechas, proveedorDe, sucursalDe, type CompromisoConNombres } from "./datos";

export default async function Compromisos({ searchParams }: { searchParams: Promise<{ sucursal?: string; concepto?: string; ok?: string; error?: string }> }) {
  const { sucursal = "", concepto = "", ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const hoy = hoyCalendarioMX();
  let todos: CompromisoConNombres[], fechas: FechaCompromiso[];
  try { [todos, fechas] = await Promise.all([leerCompromisos(supabase), leerFechas(supabase, ventanaCompromisos(hoy).desde, ventanaCompromisos(hoy).hasta)]); }
  catch { return <p className="aviso aviso-error">No se pudieron consultar los compromisos. Revisa que la migración 20261028180000 esté aplicada.</p>; }
  const lista = todos.filter((c) => (!sucursal || c.sucursal_id === sucursal) && (!concepto || c.concepto === concepto));
  const ids = new Set(lista.map((c) => c.id));
  const requiere = new Map(lista.map((c) => [c.id, c.requiere_servicio]));
  const avisos = avisosCompromisos(fechas.filter((f) => ids.has(f.compromiso_id)), (id) => requiere.get(id) ?? false, hoy);
  const sucursales = [...new Map(todos.map((c) => [c.sucursal_id, sucursalDe(c)])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const grupos = sucursales.map(([id, nombre]) => ({ id, nombre, cs: lista.filter((c) => c.sucursal_id === id) })).filter((g) => g.cs.length);
  const edita = puedeEditarCompras(perfil.rol);
  return <>
    <EncabezadoPagina titulo="Compromisos fijos" descripcion="Lo que se paga sí o sí cada cierto tiempo, por sucursal. Sale como previsto en el calendario de pagos hasta que llega su factura."
      acciones={edita && <Link className="boton" href={`/compras/pagos/compromisos/nuevo${sucursal ? `?sucursal=${sucursal}` : ""}`}><Icono nombre="mas" />Nuevo compromiso</Link>} />
    <Aviso ok={ok} error={error} />
    {avisos.vencidosSinFactura > 0 && <p className="aviso aviso-error">{avisos.vencidosSinFactura} pagos fijos vencidos sin factura.</p>}
    {avisos.serviciosSinComprobar > 0 && <p className="aviso aviso-error">{avisos.serviciosSinComprobar} servicios sin comprobar.</p>}
    {todos.length > 0 && <form method="get" className="rejilla">
      <label className="campo">Sucursal<select name="sucursal" defaultValue={sucursal}><option value="">Todas</option>{sucursales.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
      <label className="campo">Concepto<select name="concepto" defaultValue={concepto}><option value="">Todos</option>{Object.entries(CONCEPTOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
      <button className="boton boton-secundario" type="submit">Filtrar</button>
    </form>}
    {!grupos.length ? <EstadoVacio titulo="Sin compromisos" descripcion="Da de alta la renta, la fumigación, la basura o las trampas de grasa de cada sucursal." /> : grupos.map((g) => (
      <section key={g.id} className="seccion"><h2>{g.nombre}</h2><div className="tarjetas">
        {g.cs.map((c) => {
          const propias = fechas.filter((f) => f.compromiso_id === c.id);
          const proxima = propias.find((f) => f.vence >= hoy && estadoPago(f, hoy) !== "omitida");
          const alerta = propias.some((f) => estadoPago(f, hoy) === "vencido" || servicioSinComprobar(f, c.requiere_servicio, hoy));
          return <article key={c.id} className="tarjeta" data-alerta={alerta ? "si" : undefined}>
            <div className="tarjeta-encabezado"><div><h3><Link href={`/compras/pagos/compromisos/${c.id}`}>{tituloCompromiso(c, g.nombre)}</Link></h3><p>{proveedorDe(c)}</p></div><strong>{pesos(importesDe(c).total)}</strong></div>
            <dl className="tarjeta-datos">
              {importesDe(c).retenciones > 0 && <><dt>Retenciones</dt><dd>{pesos(importesDe(c).retenciones)} por enterar · subtotal {pesos(c.monto_estimado)}</dd></>}
              <dt>Frecuencia</dt><dd>{textoFrecuencia(c)}{c.fin ? ` · hasta ${fechaTexto(c.fin)}` : ""}</dd>
              <dt>Próxima</dt><dd>{proxima ? <>{fechaTexto(proxima.vence)} · <span className="insignia" data-tono={ESTADO_PAGO[estadoPago(proxima, hoy)].tono}>{ESTADO_PAGO[estadoPago(proxima, hoy)].texto}</span></> : "Sin fechas próximas"}</dd>
            </dl>
            {alerta && <p className="factura-tarjeta-estados"><span className="insignia" data-tono="peligro">Tiene pendientes vencidos</span></p>}
          </article>;
        })}
      </div></section>
    ))}
  </>;
}
