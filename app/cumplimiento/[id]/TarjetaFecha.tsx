import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ESTADOS, type FilaCumplimiento } from "@/lib/cumplimiento";
import { fechaConAnio, pesos } from "@/lib/formato";
import { cerrarFecha, ligarFactura, omitirFecha, subirEvidencia } from "../acciones";

type Factura = { id: string; nombre: string; saldo: number };
type Evidencia = { id: string; nombre: string; clase: "foto" | "documento" };

/** Una fecha de la obligación: estado, evidencia y factura, con sus acciones para administración. */
export function TarjetaFecha({ f, obligacion, hoy, edita, conPago, facturas, evidencias }: {
  f: FilaCumplimiento; obligacion: string; hoy: string; edita: boolean; conPago: boolean; facturas: Factura[]; evidencias: Evidencia[];
}) {
  const fotos = evidencias.filter((e) => e.clase === "foto").length, documentos = evidencias.length - fotos;
  const cumplida = f.estado === "cumplida" || f.estado === "cumplida_sin_factura", omitida = f.estado === "omitida";
  const ocultos = <><input type="hidden" name="obligacion_id" value={obligacion} /><input type="hidden" name="vence" value={f.vence} /><input type="hidden" name="revision" value={f.revision} /></>;
  const opciones = facturas.map((x) => <option key={x.id} value={x.id}>{x.nombre} · {pesos(x.saldo)}</option>);
  // Al cerrar, vacío es "después". Al cambiar en una cumplida, no hay opción por defecto: quitar la factura es explícito.
  const selectorFactura = cumplida
    ? <label className="campo">Factura del proveedor<select name="factura_id" defaultValue="" required><option value="" disabled>Elige…</option>{f.factura_id && <option value="quitar">Quitar la factura</option>}{opciones}</select></label>
    : <label className="campo">Factura del proveedor<select name="factura_id" defaultValue=""><option value="">Después</option>{opciones}</select></label>;
  return (
    <article id={`fecha-${f.vence}`} className="tarjeta" data-alerta={f.estado === "vencida" || f.estado === "cumplida_sin_factura" ? "si" : undefined}>
      <div className="tarjeta-encabezado"><div><h3>Vence {fechaConAnio(f.vence)}</h3>{cumplida && <p>Cumplida el {fechaConAnio(f.fecha)}</p>}</div>
        <span className="insignia" data-tono={ESTADOS[f.estado].tono}>{ESTADOS[f.estado].texto}</span></div>
      <dl className="tarjeta-datos">
        <dt>Evidencia</dt><dd>{evidencias.length ? evidencias.map((e) => <Link key={e.id} href={`/cumplimiento/evidencia/${e.id}`} target="_blank">{e.clase === "foto" ? "Foto" : "PDF"}: {e.nombre} </Link>) : "Sin archivos"}{!cumplida && !omitida && <small className="saldo-nota"> · {fotos} foto(s) y {documentos} PDF; se necesita al menos uno de cada uno.</small>}</dd>
        {conPago && <><dt>Factura</dt><dd>{f.factura_id ? <Link href={`/compras/facturas/${f.factura_id}`}>Ver factura</Link> : "Sin factura"}</dd></>}
      </dl>
      {edita && !omitida && <>
        {!cumplida && <details><summary>Subir foto o PDF</summary>
          <form action={subirEvidencia} className="formulario">{ocultos}<input type="hidden" name="solicitud" value={randomUUID()} />
            <label className="campo">Foto o PDF<input type="file" name="archivo" accept="image/jpeg,image/png,image/webp,application/pdf" required /></label>
            <button className="boton boton-secundario" type="submit">Subir</button>
          </form>
        </details>}
        {!cumplida && <details open={fotos > 0 && documentos > 0}><summary>Marcar como cumplida</summary>
          <form action={cerrarFecha} className="formulario">{ocultos}
            <label className="campo">Fecha en que se cumplió<input type="date" name="cumplida_fecha" max={hoy} defaultValue={hoy} required /></label>
            <label className="campo">Qué se hizo<textarea name="nota" minLength={5} maxLength={2000} required placeholder="Ej. Renovación de póliza 2027, folio 12345" /></label>
            {conPago && selectorFactura}
            <button className="boton" type="submit" disabled={!fotos || !documentos}>Marcar cumplida</button>
          </form>
        </details>}
        {cumplida && conPago && <details open={!f.factura_id}><summary>{f.factura_id ? "Cambiar o quitar factura" : "Ligar factura"}</summary>
          <form action={ligarFactura} className="formulario">{ocultos}{selectorFactura}<button className="boton" type="submit">Guardar</button></form>
        </details>}
      </>}
      {edita && !cumplida && !f.factura_id && <details><summary>{omitida ? "Quitar omisión" : "Omitir esta fecha"}</summary>
        <form action={omitirFecha} className="formulario">{ocultos}
          {omitida ? <input type="hidden" name="motivo" value="" /> : <label className="campo">Motivo<textarea name="motivo" minLength={5} maxLength={1000} required placeholder="Ej. sucursal cerrada, trámite ya no aplica" /></label>}
          <button className="boton boton-secundario" type="submit">{omitida ? "Quitar omisión" : "Omitir"}</button>
        </form>
      </details>}
    </article>
  );
}
