import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ESTADO_PAGO, ESTADO_SERVICIO, estadoPago, servicioSinComprobar, type FechaCompromiso } from "@/lib/compras/compromisos";
import { fechaTexto, pesos } from "@/lib/formato";
import { comprobarServicio, ligarFactura, omitirFecha, subirEvidencia } from "../acciones";

type Factura = { id: string; nombre: string; saldo: number };
type Evidencia = { id: string; nombre: string };

/** Una fecha del compromiso: estado del pago y del servicio, y sus acciones para administración. */
export function TarjetaFecha({ f, compromiso, fechaPago, hoy, edita, requiere, facturas, evidencias, nuevaFactura }: {
  f: FechaCompromiso; compromiso: string; fechaPago: string; hoy: string; edita: boolean; requiere: boolean;
  facturas: Factura[]; evidencias: Evidencia[]; nuevaFactura: string;
}) {
  const estado = estadoPago(f, hoy), conFactura = estado === "por_pagar" || estado === "pagada";
  const sinComprobar = servicioSinComprobar(f, requiere, hoy);
  const ocultos = <><input type="hidden" name="compromiso_id" value={compromiso} /><input type="hidden" name="vence" value={f.vence} /><input type="hidden" name="revision" value={f.revision} /></>;
  return (
    <article id={`fecha-${f.vence}`} className="tarjeta" data-alerta={estado === "vencido" || sinComprobar ? "si" : undefined}>
      <div className="tarjeta-encabezado"><div><h3>Vence {fechaTexto(f.vence)}</h3><p>Día de pago: {fechaTexto(fechaPago)}</p></div>
        <span className="insignia" data-tono={ESTADO_PAGO[estado].tono}>{ESTADO_PAGO[estado].texto}</span></div>
      <dl className="tarjeta-datos">
        {f.factura_id && conFactura && <><dt>Factura</dt><dd><Link href={`/compras/facturas/${f.factura_id}`}>Ver factura</Link>{f.factura_saldo ? ` · saldo ${pesos(f.factura_saldo)}` : ""}</dd></>}
        {f.omitida_motivo && <><dt>Motivo</dt><dd className="texto-libre">{f.omitida_motivo}</dd></>}
        {requiere && <><dt>Servicio</dt><dd>{sinComprobar ? <span className="insignia" data-tono="peligro">Sin comprobar</span> : ESTADO_SERVICIO[f.servicio]}{f.servicio_fecha ? ` · ${fechaTexto(f.servicio_fecha)}` : ""}{f.servicio_nota ? <span className="texto-libre"> — {f.servicio_nota}</span> : null}</dd></>}
        {evidencias.length > 0 && <><dt>Evidencia</dt><dd>{evidencias.map((e) => <Link key={e.id} href={`/compras/pagos/compromisos/evidencia/${e.id}`} target="_blank">{e.nombre} </Link>)}</dd></>}
      </dl>
      {edita && <>
        {estado !== "omitida" && <details><summary>{conFactura ? "Cambiar o quitar factura" : "Ligar factura"}</summary>
          <form action={ligarFactura} className="formulario">{ocultos}
            <label className="campo">Factura del proveedor en esta sucursal<select name="factura_id" defaultValue=""><option value="">Ninguna (quitar)</option>{facturas.map((x) => <option key={x.id} value={x.id}>{x.nombre} · {pesos(x.saldo)}</option>)}</select></label>
            <button className="boton" type="submit">Guardar</button>
          </form>
          {!conFactura && <p className="saldo-nota">¿No hay factura? <Link href={nuevaFactura}>Capturar gasto sin CFDI</Link> y se liga solo.</p>}
        </details>}
        {requiere && estado !== "omitida" && <details><summary>Comprobar servicio</summary>
          <form action={comprobarServicio} className="formulario">{ocultos}
            <label className="campo">¿Se hizo?<select name="servicio" defaultValue={f.servicio === "pendiente" ? "realizado" : f.servicio}><option value="realizado">Sí, se hizo</option><option value="no_realizado">No se hizo</option><option value="pendiente">Pendiente</option></select></label>
            <label className="campo">Fecha en que se hizo<input type="date" name="servicio_fecha" max={hoy} defaultValue={f.servicio_fecha ?? hoy} /></label>
            <label className="campo">Qué se hizo o por qué no<textarea name="servicio_nota" maxLength={2000} defaultValue={f.servicio_nota ?? ""} /></label>
            <button className="boton" type="submit">Guardar</button>
          </form>
          {f.servicio !== "pendiente" && <form action={subirEvidencia} className="formulario">{ocultos}<input type="hidden" name="solicitud" value={randomUUID()} />
            <label className="campo">Foto o PDF de evidencia<input type="file" name="archivo" accept="image/jpeg,image/png,image/webp,application/pdf" required /></label>
            <button className="boton boton-secundario" type="submit">Subir evidencia</button>
          </form>}
        </details>}
        {!conFactura && <details><summary>{estado === "omitida" ? "Quitar omisión" : "Omitir esta fecha"}</summary>
          <form action={omitirFecha} className="formulario">{ocultos}
            {estado === "omitida" ? <input type="hidden" name="motivo" value="" /> : <label className="campo">Motivo<textarea name="motivo" minLength={5} maxLength={1000} required placeholder="Ej. mes de gracia, no hubo servicio por remodelación" /></label>}
            <button className="boton boton-secundario" type="submit">{estado === "omitida" ? "Quitar omisión" : "Omitir"}</button>
          </form>
        </details>}
      </>}
    </article>
  );
}
