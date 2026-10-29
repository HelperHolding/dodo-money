import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaConAnio, hoyCalendarioMX, pesos } from "@/lib/formato";
import { puedeEditarCompras, puedeVerCompras } from "@/lib/roles";
import { nombreFactura } from "@/lib/compras/facturas";
import { TIPOS, textoFrecuencia, ventanaCalendario } from "@/lib/cumplimiento";
import { ambitoTexto, leerFilas, leerObligaciones, proveedorTexto } from "../datos";
import { TarjetaFecha } from "./TarjetaFecha";

type Candidata = { id: string; serie: string | null; folio: string | null; uuid: string | null; uuid_manual: string | null; saldo: number };

export default async function DetalleObligacion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerCompras(perfil.rol)) redirect("/");
  const hoy = hoyCalendarioMX(), { desde, hasta } = ventanaCalendario(hoy);
  const [[o], todas] = await Promise.all([leerObligaciones(supabase, id), leerFilas(supabase, desde, hasta, hoy)]);
  if (!o) notFound();
  const fechas = todas.filter((f) => f.origen === "obligacion" && f.referencia_id === id);
  const conFila = fechas.map((f) => f.fecha_id).filter((x): x is string => !!x);
  let candidatas: Candidata[] = [];
  if (o.con_pago && o.proveedor_id) {
    let q = supabase.from("facturas_saldo").select("id, serie, folio, uuid, uuid_manual, saldo").eq("tipo", "ingreso").neq("estado", "cancelada").eq("proveedor_id", o.proveedor_id);
    q = o.sucursal_id ? q.eq("sucursal_id", o.sucursal_id) : q.eq("rfc_receptor", o.razon_social_rfc!);
    candidatas = (await q.order("vence_el", { ascending: false }).limit(50).returns<Candidata[]>()).data ?? [];
  }
  const [{ data: ligadasC }, { data: ligadasK }, { data: evidencias }, { data: historial }] = await Promise.all([
    supabase.from("cumplimiento_fechas").select("factura_id").not("factura_id", "is", null).returns<{ factura_id: string }[]>(),
    supabase.from("compromiso_fechas").select("factura_id").not("factura_id", "is", null).returns<{ factura_id: string }[]>(),
    conFila.length
      ? supabase.from("cumplimiento_evidencias").select("id, nombre, clase, fecha_id").in("fecha_id", conFila).not("confirmado_en", "is", null).returns<{ id: string; nombre: string; clase: "foto" | "documento"; fecha_id: string }[]>()
      : Promise.resolve({ data: [] as { id: string; nombre: string; clase: "foto" | "documento"; fecha_id: string }[] }),
    supabase.from("cumplimiento_historial").select("id, evento, fecha").eq("obligacion_id", id).order("fecha", { ascending: false }).limit(20).returns<{ id: number; evento: string; fecha: string }[]>(),
  ]);
  const usadas = new Set([...(ligadasC ?? []), ...(ligadasK ?? [])].map((l) => l.factura_id));
  const facturas = candidatas.filter((x) => !usadas.has(x.id)).map((x) => ({ id: x.id, nombre: nombreFactura({ ...x, uuid: x.uuid ?? x.uuid_manual }), saldo: Number(x.saldo) }));
  const edita = puedeEditarCompras(perfil.rol);
  return <>
    <EncabezadoPagina titulo={o.nombre} descripcion={`${TIPOS[o.tipo]} · ${ambitoTexto(o)} · ${textoFrecuencia(o.frecuencia, o.inicio)}`}
      acciones={edita && <Link className="boton boton-secundario" href={`/cumplimiento/${id}/editar`}>Editar o ponerle fin</Link>} />
    <Aviso ok={ok} error={error} />
    <section className="seccion"><dl className="tarjeta-datos">
      {o.autoridad && <><dt>Autoridad o aseguradora</dt><dd>{o.autoridad}</dd></>}
      {o.folio && <><dt>Folio</dt><dd>{o.folio}</dd></>}
      <dt>Vigencia</dt><dd>Desde {fechaConAnio(o.inicio)}{o.fin ? ` hasta ${fechaConAnio(o.fin)}` : ", sin fecha de fin"}</dd>
      <dt>Pago</dt><dd>{o.con_pago ? `${proveedorTexto(o)}${o.monto_estimado ? ` · ${pesos(o.monto_estimado)} estimado` : ""}` : "No lleva pago"}</dd>
      {o.descripcion && <><dt>Descripción</dt><dd className="texto-libre">{o.descripcion}</dd></>}
      {o.notas && <><dt>Notas</dt><dd className="texto-libre">{o.notas}</dd></>}
    </dl></section>
    <section className="seccion"><h2>Fechas</h2><p className="saldo-nota">Un año atrás y 13 meses adelante.</p>
      {!fechas.length ? <p>No hay fechas en este periodo.</p> : <div className="tarjetas">{fechas.map((f) =>
        <TarjetaFecha key={f.vence} f={f} obligacion={id} hoy={hoy} edita={edita} conPago={o.con_pago} facturas={facturas}
          evidencias={(evidencias ?? []).filter((e) => e.fecha_id === f.fecha_id)} />)}</div>}
    </section>
    {!!historial?.length && <section className="seccion"><h2>Historial</h2><ul>{historial.map((h) => <li key={h.id}>{h.evento} · {fechaConAnio(h.fecha.slice(0, 10))}</li>)}</ul></section>}
  </>;
}
