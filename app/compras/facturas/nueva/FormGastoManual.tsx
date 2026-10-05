"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { CampoArchivo } from "@/components/CampoArchivo";
import { calcularGasto, IMPUESTOS_ARRENDAMIENTO, type Impuestos } from "@/lib/compras/gastoManual";
import { pesos } from "@/lib/formato";
import { registrarGastoManual } from "../acciones";

type Proveedor = { id: string; nombre: string; sucursal_id: string | null; cuenta_pl: string | null };
type Renglon = { descripcion: string; importe: string; cuenta: string };

/** Alta de un gasto sin CFDI: renglones con su cuenta, IVA y retenciones con el total a la vista. */
export function FormGastoManual({ proveedores, sucursales, cuentas, hoy }: {
  proveedores: Proveedor[]; sucursales: { id: string; nombre: string }[]; cuentas: { clave: string; nombre: string }[]; hoy: string;
}) {
  const [proveedor, setProveedor] = useState("");
  const [sucursal, setSucursal] = useState("oficina");
  const [renglones, setRenglones] = useState<Renglon[]>([{ descripcion: "", importe: "", cuenta: "" }]);
  const [imp, setImp] = useState<Impuestos>({ iva: 0.16, retIva: "ninguna", retIsr: "ninguna" });
  const t = calcularGasto(renglones.map((r) => ({ importe: Number(r.importe.replace(/[$,\s]/g, "")) || 0 })), imp);
  const cambiarRenglon = (i: number, campo: keyof Renglon, valor: string) =>
    setRenglones((rs) => rs.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)));
  const elegirProveedor = (id: string) => {
    setProveedor(id);
    const p = proveedores.find((x) => x.id === id);
    if (!p) return;
    setSucursal(p.sucursal_id ?? "oficina");
    setRenglones((rs) => rs.map((r) => (r.cuenta ? r : { ...r, cuenta: p.cuenta_pl ?? "" })));
  };

  return (
    <form action={registrarGastoManual} className="formulario seccion">
      <div className="rejilla">
        <div className="campo">
          <label htmlFor="proveedor_id">Proveedor</label>
          <select id="proveedor_id" name="proveedor_id" value={proveedor} onChange={(e) => elegirProveedor(e.target.value)} required>
            <option value="">Elige…</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="sucursal_id">Sucursal</label>
          <select id="sucursal_id" name="sucursal_id" value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            <option value="oficina">Oficina</option>
          </select>
        </div>
        <div className="campo"><label htmlFor="folio">Referencia</label><input id="folio" name="folio" required placeholder="Ej. Prefactura renta octubre" /></div>
        <div className="campo"><label htmlFor="fecha">Fecha</label><input id="fecha" name="fecha" type="date" defaultValue={hoy} max={hoy} required /></div>
        <div className="campo"><label htmlFor="vence_el">Vence (opcional)</label><input id="vence_el" name="vence_el" type="date" /><small>Si no, la fecha + días de crédito del proveedor.</small></div>
      </div>

      <h2>Renglones</h2>
      {renglones.map((r, i) => (
        <div key={i} className="rejilla">
          <div className="campo"><label htmlFor={`d${i}`}>Descripción</label><input id={`d${i}`} name="renglon_descripcion" value={r.descripcion} onChange={(e) => cambiarRenglon(i, "descripcion", e.target.value)} placeholder="Ej. Renta" /></div>
          <div className="campo"><label htmlFor={`i${i}`}>Importe sin IVA</label><input id={`i${i}`} name="renglon_importe" inputMode="decimal" value={r.importe} onChange={(e) => cambiarRenglon(i, "importe", e.target.value)} /></div>
          <div className="campo">
            <label htmlFor={`c${i}`}>Cuenta del P&L</label>
            <select id={`c${i}`} name="renglon_cuenta" value={r.cuenta} onChange={(e) => cambiarRenglon(i, "cuenta", e.target.value)}>
              <option value="">La del proveedor</option>
              {cuentas.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
      ))}
      <div className="acciones">
        <button type="button" className="boton boton-secundario" onClick={() => setRenglones((rs) => [...rs, { descripcion: "", importe: "", cuenta: proveedores.find((p) => p.id === proveedor)?.cuenta_pl ?? "" }])}>Agregar renglón</button>
        {renglones.length > 1 && <button type="button" className="boton boton-secundario" onClick={() => setRenglones((rs) => rs.slice(0, -1))}>Quitar el último</button>}
      </div>

      <h2>Impuestos</h2>
      <div className="rejilla">
        <div className="campo">
          <label htmlFor="iva">IVA</label>
          <select id="iva" name="iva" value={imp.iva === 0 ? "0" : "16"} onChange={(e) => setImp({ ...imp, iva: e.target.value === "0" ? 0 : 0.16, retIva: e.target.value === "0" ? "ninguna" : imp.retIva })}>
            <option value="16">16 %</option><option value="0">0 % / exento</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="ret_iva">Retención de IVA</label>
          <select id="ret_iva" name="ret_iva" value={imp.retIva} onChange={(e) => setImp({ ...imp, retIva: e.target.value as Impuestos["retIva"] })}>
            <option value="ninguna">Ninguna</option><option value="dos_tercios">2/3 del IVA</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="ret_isr">Retención de ISR</label>
          <select id="ret_isr" name="ret_isr" value={imp.retIsr} onChange={(e) => setImp({ ...imp, retIsr: e.target.value as Impuestos["retIsr"] })}>
            <option value="ninguna">Ninguna</option><option value="diez">10 %</option>
          </select>
        </div>
      </div>
      <div className="acciones"><button type="button" className="boton boton-secundario" onClick={() => setImp(IMPUESTOS_ARRENDAMIENTO)}>Persona física, arrendamiento</button></div>

      <dl className="tarjeta-datos">
        <dt>Subtotal</dt><dd>{pesos(t.subtotal)}</dd>
        <dt>IVA</dt><dd>{pesos(t.iva)}</dd>
        {t.retencion_iva > 0 && <><dt>Retención de IVA</dt><dd>− {pesos(t.retencion_iva)}</dd></>}
        {t.retencion_isr > 0 && <><dt>Retención de ISR</dt><dd>− {pesos(t.retencion_isr)}</dd></>}
        <dt>Total a pagar al proveedor</dt><dd><strong>{pesos(t.total)}</strong></dd>
        {t.retenciones > 0 && <><dt>A enterar al SAT</dt><dd>{pesos(t.retenciones)}</dd></>}
      </dl>
      <CampoArchivo id="adjunto" name="adjunto" etiqueta="Prefactura o recibo (PDF o foto, opcional)" accept="application/pdf,image/*" />
      <BotonEnviar>Guardar gasto sin CFDI</BotonEnviar>
    </form>
  );
}
