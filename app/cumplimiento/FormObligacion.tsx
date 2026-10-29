"use client";
import { useState } from "react";
import { FRECUENCIAS, TIPOS, ambitoDe, textoFrecuencia, type Frecuencia, type Obligacion, type TipoObligacion } from "@/lib/cumplimiento";
import { guardarObligacion } from "./acciones";

/** Alta o edición. En edición, tipo, sucursal o razón social, frecuencia e inicio se muestran pero no cambian. */
export function FormObligacion({ o, ambitos, proveedores, hoy }: {
  o?: Obligacion; ambitos: { valor: string; nombre: string }[]; proveedores: { id: string; nombre: string }[]; hoy: string;
}) {
  const [tipo, setTipo] = useState<TipoObligacion>(o?.tipo ?? "permiso");
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(o?.frecuencia ?? "anual");
  const [inicio, setInicio] = useState(o?.inicio ?? hoy);
  const [pago, setPago] = useState(o?.con_pago ?? false);
  const fijo = !!o;
  return (
    <form action={guardarObligacion} className="formulario seccion">
      {o && <><input type="hidden" name="id" value={o.id} /><input type="hidden" name="revision" value={o.revision} /></>}
      {fijo && <p className="saldo-nota">Tipo, sucursal o razón social, frecuencia e inicio no cambian. Para cambiarlos, ponle fin a esta obligación y crea otra.</p>}
      <div className="rejilla">
        <label className="campo">Tipo
          <select name="tipo" value={tipo} disabled={fijo} onChange={(e) => setTipo(e.target.value as TipoObligacion)}>
            {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          {fijo && <input type="hidden" name="tipo" value={tipo} />}
        </label>
        <label className="campo">Nombre<input name="nombre" defaultValue={o?.nombre ?? ""} minLength={3} maxLength={150} required placeholder="Ej. Póliza de daños, Licencia de funcionamiento" /></label>
        <label className="campo">Descripción{tipo === "otro" ? "" : " (opcional)"}<input name="descripcion" defaultValue={o?.descripcion ?? ""} maxLength={300} required={tipo === "otro"} /></label>
        <label className="campo">Sucursal o razón social
          <select name="ambito" defaultValue={o ? ambitoDe(o) : ""} required disabled={fijo}>
            <option value="">Elige…</option>{ambitos.map((a) => <option key={a.valor} value={a.valor}>{a.nombre}</option>)}
          </select>
          {fijo && <input type="hidden" name="ambito" value={ambitoDe(o)} />}
        </label>
        <label className="campo">Autoridad o aseguradora (opcional)<input name="autoridad" defaultValue={o?.autoridad ?? ""} maxLength={150} /></label>
        <label className="campo">Folio o número de póliza (opcional)<input name="folio" defaultValue={o?.folio ?? ""} maxLength={100} /></label>
        <label className="campo">Frecuencia
          <select name="frecuencia" value={frecuencia} disabled={fijo} onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}>
            {Object.entries(FRECUENCIAS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          {fijo && <input type="hidden" name="frecuencia" value={frecuencia} />}
        </label>
        <label className="campo">Primera fecha (inicio)<input type="date" name="inicio" value={inicio} onChange={(e) => setInicio(e.target.value)} required readOnly={fijo} /><small>{inicio ? textoFrecuencia(frecuencia, inicio) : ""}</small>{!fijo && <small>Usa la próxima fecha que vence; las fechas pasadas aparecerán como vencidas.</small>}</label>
        <label className="campo">Fin (opcional)<input type="date" name="fin" defaultValue={o?.fin ?? ""} min={inicio} /></label>
        <label className="campo">¿Lleva pago?
          <select name="con_pago" value={pago ? "si" : "no"} onChange={(e) => setPago(e.target.value === "si")}>
            <option value="no">No</option><option value="si">Sí, se liga a su factura</option>
          </select>
        </label>
        {pago && <>
          <label className="campo">Proveedor que factura
            <select name="proveedor_id" defaultValue={o?.proveedor_id ?? ""} required>
              <option value="">Elige…</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <label className="campo">Monto estimado (opcional)<input name="monto_estimado" inputMode="decimal" defaultValue={o?.monto_estimado ?? ""} /></label>
        </>}
        <label className="campo">Notas (opcional)<textarea name="notas" defaultValue={o?.notas ?? ""} maxLength={1000} /></label>
      </div>
      <p className="saldo-nota">Al guardar verás las próximas fechas. Cada fecha se cierra con al menos una foto y un PDF.</p>
      <button className="boton" type="submit">Guardar</button>
    </form>
  );
}
