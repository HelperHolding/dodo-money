import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaMX, hora, pesos } from "@/lib/formato";
import { puedeEditarFinanzas } from "@/lib/roles";
import { cancelarFactura, reenviarFactura } from "./acciones";
import { limitesMes } from "./mes";

const ESTADO: Record<string, string> = { timbrada: "Timbrada", cancelada: "Cancelada", en_proceso: "Por confirmar", error: "Rechazada" };

export default async function FacturacionTickets({ searchParams }: { searchParams: Promise<{ mes?: string; ok?: string; error?: string }> }) {
  const { supabase, perfil } = await obtenerPerfil(), q = await searchParams;
  const { mes, desde, hasta } = limitesMes(q.mes), edita = puedeEditarFinanzas(perfil.rol);
  const { data, error } = await supabase.from("facturas_clientes")
    .select("id, creada, pedido_id, rfc, nombre, correo, total, uuid, serie, folio, estado, error, motivo_cancelacion")
    .gte("creada", desde).lt("creada", hasta).order("creada", { ascending: false });
  if (error) throw Error(error.message);
  const filas = data ?? [], timbradas = filas.filter((f) => f.estado === "timbrada");
  const suma = timbradas.reduce((s, f) => s + Number(f.total), 0);
  return <>
    <EncabezadoPagina titulo="Facturación de tickets" info="Facturas que los clientes piden desde /facturar con su ticket. Al cancelar una, el cliente puede volver a facturar ese ticket."
      acciones={<a className="boton boton-secundario boton-compacto" href={`/finanzas/facturacion/excel?mes=${mes}`} download>Excel del mes</a>} />
    <Aviso ok={q.ok} error={q.error} />
    <form className="barra-filtros" method="get" aria-label="Periodo">
      <label htmlFor="mes" className="solo-lector">Mes</label><input id="mes" name="mes" type="month" defaultValue={mes} required />
      <button className="boton boton-secundario boton-compacto">Consultar</button>
    </form>
    <section className="seccion"><h2>Resumen del mes</h2>
      <p><strong>{timbradas.length}</strong> {timbradas.length === 1 ? "factura timbrada" : "facturas timbradas"} · <strong>{pesos(suma)}</strong></p>
    </section>
    {filas.length === 0 && <p className="saldo-nota">No hay facturas de tickets en este mes.</p>}
    {filas.map((f) => (
      <section key={f.id} className="seccion">
        <h3>{f.nombre}</h3>
        <p>{f.rfc} · <strong>{pesos(f.total)}</strong></p>
        <p className="saldo-nota">{fechaMX(f.creada)} {hora(f.creada)} · Ticket {f.pedido_id}{f.serie ? ` · ${f.serie}-${f.folio}` : ""}</p>
        <p><strong>{ESTADO[f.estado] ?? f.estado}</strong>{f.estado === "cancelada" && f.motivo_cancelacion ? ` · motivo ${f.motivo_cancelacion}` : ""}{f.error ? ` · ${f.error}` : ""}</p>
        {f.uuid && <p className="saldo-nota" style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>{f.uuid}</p>}
        {edita && f.estado === "timbrada" && <>
          <form action={cancelarFactura} className="acciones">
            <input type="hidden" name="id" value={f.id} />
            <label htmlFor={`motivo-${f.id}`} className="solo-lector">Motivo de cancelación</label>
            <select id={`motivo-${f.id}`} name="motivo" defaultValue="02">
              <option value="02">02 · Errores sin relación</option>
              <option value="03">03 · No se llevó a cabo la operación</option>
            </select>
            <BotonEnviar className="boton boton-secundario boton-compacto" pendiente="Cancelando…" confirmar="¿Cancelar esta factura ante el SAT? No se puede deshacer.">Cancelar factura</BotonEnviar>
          </form>
          <form action={reenviarFactura} className="acciones">
            <input type="hidden" name="id" value={f.id} />
            <BotonEnviar className="boton boton-secundario boton-compacto" pendiente="Enviando…">Reenviar a {f.correo}</BotonEnviar>
          </form>
        </>}
      </section>
    ))}
  </>;
}
