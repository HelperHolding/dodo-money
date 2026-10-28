"use client";
import { useState } from "react";
import { CONCEPTOS, REQUIERE_SERVICIO, type Compromiso, type Concepto } from "@/lib/compras/compromisos";
import { NOMBRE_FORMA_PAGO } from "@/lib/compras/proveedores";
import { guardarCompromiso } from "./acciones";

type Opcion = { id: string; nombre: string };

/** Alta o edición. En edición, sucursal, concepto, frecuencia, día e inicio se muestran pero no cambian. */
export function FormCompromiso({ c, sucursales, proveedores, hoy, sucursalInicial }: { c?: Compromiso; sucursales: Opcion[]; proveedores: Opcion[]; hoy: string; sucursalInicial?: string }) {
  const [concepto, setConcepto] = useState<Concepto>(c?.concepto ?? "renta");
  const [unidad, setUnidad] = useState(c?.unidad ?? "mes");
  const [requiere, setRequiere] = useState(c?.requiere_servicio ?? REQUIERE_SERVICIO.renta);
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
          <select name="concepto" value={concepto} disabled={fijo} onChange={(e) => { const v = e.target.value as Concepto; setConcepto(v); setRequiere(REQUIERE_SERVICIO[v]); }}>
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
        <label className="campo">Monto estimado (MXN, con IVA)<input name="monto_estimado" inputMode="decimal" defaultValue={c ? String(c.monto_estimado) : ""} required /></label>
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
        <label className="campo">Desde<input name="inicio" type="date" defaultValue={c?.inicio ?? hoy} required readOnly={fijo} /></label>
        <label className="campo">Hasta (opcional)<input name="fin" type="date" defaultValue={c?.fin ?? ""} /><small>Cuando termina el contrato.</small></label>
      </div>
      <label className="casilla"><input type="checkbox" name="requiere_servicio" value="si" checked={requiere} onChange={(e) => setRequiere(e.target.checked)} /> Comprobar que el servicio se hizo (fecha, nota y foto)</label>
      <button className="boton" type="submit">Guardar compromiso</button>
    </form>
  );
}
