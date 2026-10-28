import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyCalendarioMX, pesos } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { nombreFactura } from "@/lib/compras/facturas";
import { NOMBRE_FORMA_PAGO } from "@/lib/compras/proveedores";
import { diaDePagoSugerido } from "@/lib/compras/diasPago";
import { textoFrecuencia, tituloCompromiso, ventanaCompromisos } from "@/lib/compras/compromisos";
import { diasDePago } from "../../../servidor";
import { leerCompromisos, leerFechas, proveedorDe, sucursalDe } from "../datos";
import { TarjetaFecha } from "./FechaCompromiso";

export default async function DetalleCompromiso({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  const hoy = hoyCalendarioMX();
  const [[c], todas, dias] = await Promise.all([leerCompromisos(supabase, id), leerFechas(supabase, ventanaCompromisos(hoy).desde, ventanaCompromisos(hoy).hasta), diasDePago(supabase)]);
  if (!c) notFound();
  const fechas = todas.filter((f) => f.compromiso_id === id);
  const conFila = fechas.map((f) => f.fecha_id).filter((x): x is string => !!x);
  const [{ data: candidatas }, { data: ligadas }, { data: evidencias }, { data: historial }] = await Promise.all([
    supabase.from("facturas_saldo").select("id, serie, folio, uuid, uuid_manual, saldo").eq("tipo", "ingreso").neq("estado", "cancelada")
      .eq("proveedor_id", c.proveedor_id).eq("sucursal_id", c.sucursal_id).order("vence_el", { ascending: false }).limit(50)
      .returns<{ id: string; serie: string | null; folio: string | null; uuid: string | null; uuid_manual: string | null; saldo: number }[]>(),
    supabase.from("compromiso_fechas").select("factura_id").not("factura_id", "is", null).returns<{ factura_id: string }[]>(),
    conFila.length
      ? supabase.from("compromiso_evidencias").select("id, nombre, fecha_id").in("fecha_id", conFila).not("confirmado_en", "is", null).returns<{ id: string; nombre: string; fecha_id: string }[]>()
      : Promise.resolve({ data: [] as { id: string; nombre: string; fecha_id: string }[] }),
    supabase.from("compromiso_historial").select("id, evento, fecha").eq("compromiso_id", id).order("fecha", { ascending: false }).limit(20).returns<{ id: number; evento: string; fecha: string }[]>(),
  ]);
  const usadas = new Set((ligadas ?? []).map((l) => l.factura_id));
  const facturas = (candidatas ?? []).filter((x) => !usadas.has(x.id)).map((x) => ({ id: x.id, nombre: nombreFactura({ ...x, uuid: x.uuid ?? x.uuid_manual }), saldo: Number(x.saldo) }));
  const edita = puedeEditarCompras(perfil.rol), sucursal = sucursalDe(c);
  const nuevaFactura = (vence: string) => `/compras/facturas/nueva?${new URLSearchParams({ proveedor: c.proveedor_id, sucursal: c.sucursal_id, compromiso: c.id, vence })}`;
  return <>
    <EncabezadoPagina titulo={tituloCompromiso(c, sucursal)} descripcion={`${proveedorDe(c)} · ${pesos(c.monto_estimado)} · ${textoFrecuencia(c)}`}
      acciones={edita && <Link className="boton boton-secundario" href={`/compras/pagos/compromisos/${id}/editar`}>Editar o ponerle fin</Link>} />
    <Aviso ok={ok} error={error} />
    <section className="seccion"><dl className="tarjeta-datos">
      <dt>Forma de pago prevista</dt><dd>{NOMBRE_FORMA_PAGO[c.forma_pago]}</dd>
      <dt>Vigencia</dt><dd>Desde {fechaTexto(c.inicio)}{c.fin ? ` hasta ${fechaTexto(c.fin)}` : ", sin fecha de fin"}</dd>
      <dt>Servicio</dt><dd>{c.requiere_servicio ? "Se comprueba cada fecha" : "No lleva comprobación"}</dd>
      {c.descripcion && <><dt>Notas</dt><dd className="texto-libre">{c.descripcion}</dd></>}
    </dl></section>
    <section className="seccion"><h2>Fechas</h2><p className="saldo-nota">Últimos 3 meses y próximos 12.</p>
      {!fechas.length ? <p>No hay fechas en este periodo.</p> : <div className="tarjetas">{fechas.map((f) =>
        <TarjetaFecha key={f.vence} f={f} compromiso={id} fechaPago={diaDePagoSugerido(f.vence, hoy, dias)} hoy={hoy} edita={edita} requiere={c.requiere_servicio}
          facturas={facturas} evidencias={(evidencias ?? []).filter((e) => e.fecha_id === f.fecha_id)} nuevaFactura={nuevaFactura(f.vence)} />)}</div>}
    </section>
    {!!historial?.length && <section className="seccion"><h2>Historial</h2><ul>{historial.map((h) => <li key={h.id}>{h.evento} · {fechaTexto(h.fecha.slice(0, 10))}</li>)}</ul></section>}
  </>;
}
