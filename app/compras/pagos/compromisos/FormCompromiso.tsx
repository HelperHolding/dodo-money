"use client";
import { useState } from "react";
import { CONCEPTOS, REQUIERE_SERVICIO, impuestosDe, type Compromiso, type Concepto } from "@/lib/compras/compromisos";
import { calcularGasto, IMPUESTOS_ARRENDAMIENTO, type Impuestos } from "@/lib/compras/gastoManual";
import { pesos } from "@/lib/formato";
import { NOMBRE_FORMA_PAGO } from "@/lib/compras/proveedores";
import { guardarCompromiso } from "./acciones";

type Opcion = { id: string; nombre: string };
/** La renta suele ser de persona física: IVA y retenciones de arrendamiento. Lo demás, solo IVA. */
const impuestosPorConcepto = (c: Concepto): Impuestos => (c === "renta" ? IMPUESTOS_ARRENDAMIENTO : { iva: 0.16, retIva: "ninguna", retIsr: "ninguna" });

/** Alta o edición. En edición, sucursal, concepto, frecuencia, día e inicio se muestran pero no cambian. */
export function FormCompromiso({ c, sucursales, proveedores, hoy, sucursalInicial }: { c?: Compromiso; sucursales: Opcion[]; proveedores: Opcion[]; hoy: string; sucursalInicial?: string }) {
  const [concepto, setConcepto] = useState<Concepto>(c?.concepto ?? "renta");
  const [unidad, setUnidad] = useState(c?.unidad ?? "mes");
  const [requiere, setRequiere] = useState(c?.requiere_servicio ?? REQUIERE_SERVICIO.renta);
  const [imp, setImp] = useState<Impuestos>(c ? impuestosDe(c) : impuestosPorConcepto("renta"));
  const [monto, setMonto] = useState(c ? String(c.monto_estimado) : "");
  const t = calcularGasto([{ importe: Number(monto.replace(/[$,s]/g, "")) || 0 }], imp);
  const fijo = !!c;
  return (
    <form action={guardarCompromiso} className="formulario seccion">
      {c && <><input type="hidden" name="id" value={c.id} /><input type="hidden" name="revision" value={c.revision} /></>}
      {fijo && <p className="saldo-nota">Sucursal, concepto, frecuencia, día e inicio no cambian. Para cambiarlos, ponle fin a este compromiso y crea otro.</p>}
      <div className="rejilla">
        <label className="campo">Sucursal
          <select name="sucursal_id" defaultValue={c?.sucursal_id ?? sucursalInicial ?? ""} required disabled={fijo}>
            <option value="">Elige…</option>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {fijo && <input type="hidden" name="sucursal_id" value={c.sucursal_id} />}
        </label>
        <label className="campo">Concepto
          <select name="concepto" value={concepto} disabled={fijo} onChange={(e) => { const v = e.target.value as Concepto; setConcepto(v); setRequiere(REQUIERE_SERVICIO[v]); setImp(impuestosPorConcepto(v)); }}>
            {Object.entries(CONCEPTOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          {fijo && <input type="hidden" name="concepto" value={concepto} />}
        </label>
        <label className="campo">Descripción{concepto === "otro" ? "" : " (opcional)"}<input name="descripcion" defaultValue={c?.descripcion ?? ""} maxLength={300} required={concepto === "otro"} placeholder="Ej. contrato con folio, área, notas" /></label>
        <label className="campo">Proveedor
          <select name="proveedor_id" defaultValue={c?.proveedor_id ?? ""} required>
            <option value="">Elige…</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label className="campo">Importe antes de impuestos (MXN)<input name="monto_estimado" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} required /><small>El subtotal de la factura; el IVA y las retenciones se calculan abajo.</small></label>
        <label className="campo">Forma de pago prevista
          <select name="forma_pago" defaultValue={c?.forma_pago ?? "transferencia"}>
            {Object.entries(NOMBRE_FORMA_PAGO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <label className="campo">Se repite
          <select name="unidad" value={unidad} disabled={fijo} onChange={(e) => setUnidad(e.target.value as "mes" | "semana")}>
            <option value="mes">Por meses</option><option value="semana">Por semanas</option>
          </select>
          {fijo && <input type="hidden" name="unidad" value={unidad} />}
        </label>
        <label className="campo">Cada cuántos {unidad === "mes" ? "meses" : "semanas"}<input name="cada" type="number" min={1} max={12} defaultValue={c?.cada ?? 1} required readOnly={fijo} /></label>
        {unidad === "mes" && <label className="campo">Día del mes<input name="dia_mes" type="number" min={1} max={31} defaultValue={c?.dia_mes ?? 1} required readOnly={fijo} /><small>Si el mes es más corto, el último día.</small></label>}
        <label className="campo">Desde<input name="inicio" type="date" defaultValue={c?.inicio ?? hoy} required readOnly={fijo} /><small>La primera fecha que falta por pagar, no el inicio del contrato.</small></label>
        <label className="campo">Hasta (opcional)<input name="fin" type="date" defaultValue={c?.fin ?? ""} /><small>Cuando termina el contrato.</small></label>
      </div>
      <fieldset className="seccion"><legend>Impuestos</legend>
        <div className="rejilla">
          <label className="campo">IVA<select name="iva" value={imp.iva === 0 ? "0" : "16"} onChange={(e) => setImp({ ...imp, iva: e.target.value === "0" ? 0 : 0.16, retIva: e.target.value === "0" ? "ninguna" : imp.retIva })}><option value="16">16 %</option><option value="0">0 % o exento</option></select></label>
          <label className="campo">Retención de IVA<select name="ret_iva" value={imp.retIva} disabled={imp.iva === 0} onChange={(e) => setImp({ ...imp, retIva: e.target.value as Impuestos["retIva"] })}><option value="ninguna">Ninguna</option><option value="dos_tercios">2/3 del IVA</option></select>{imp.iva === 0 && <input type="hidden" name="ret_iva" value="ninguna" />}</label>
          <label className="campo">Retención de ISR<select name="ret_isr" value={imp.retIsr} onChange={(e) => setImp({ ...imp, retIsr: e.target.value as Impuestos["retIsr"] })}><option value="ninguna">Ninguna</option><option value="diez">10 %</option><option value="resico">RESICO 1.25 %</option></select></label>
        </div>
        <div className="acciones"><button type="button" className="boton boton-secundario" onClick={() => setImp(IMPUESTOS_ARRENDAMIENTO)}>Persona física, arrendamiento</button></div>
        <dl className="tarjeta-datos" aria-live="polite">
          <dt>Subtotal</dt><dd>{pesos(t.subtotal)}</dd>
          <dt>IVA</dt><dd>{pesos(t.iva)}</dd>
          {t.retencion_iva > 0 && <><dt>Retención IVA</dt><dd>−{pesos(t.retencion_iva)}</dd></>}
          {t.retencion_isr > 0 && <><dt>Retención ISR</dt><dd>−{pesos(t.retencion_isr)}</dd></>}
          <dt>Total a pagar</dt><dd><strong>{pesos(t.total)}</strong></dd>
        </dl>
      </fieldset>
      <label className="casilla"><input type="checkbox" name="requiere_servicio" value="si" checked={requiere} onChange={(e) => setRequiere(e.target.checked)} /> Comprobar que el servicio se hizo (fecha, nota y foto)</label>
      <button className="boton" type="submit">Guardar compromiso</button>
    </form>
  );
}
