"use client";

import { useState } from "react";
import { hora, pesos } from "@/lib/formato";
import { compararVentas, hayDiferencia, ivaDeVenta, type VentasDodo } from "@/lib/cierre/ventasDodo";

const aNumero = (v: string) => (v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));
const redondear = (x: number) => Math.round(x * 100) / 100;
const conSigno = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${pesos(Math.abs(x))}`;

/** Paso 1 del cierre: ventas capturadas, lo que Dodo MX ya sincronizó y el IVA calculado. */
export function VentasCierre({ dodo, error }: { dodo: VentasDodo | null; error: boolean }) {
  const [efectivo, setEfectivo] = useState("");
  const [tarjeta, setTarjeta] = useState("");
  const [app, setApp] = useState("");
  const [rappi, setRappi] = useState("");

  const comparacion = compararVentas(
    { efectivo: efectivo === "" ? null : aNumero(efectivo), tarjeta: tarjeta === "" ? null : aNumero(tarjeta) },
    dodo,
  );
  const total = redondear(aNumero(efectivo) + aNumero(tarjeta) + aNumero(app) + aNumero(rappi));
  const iva = ivaDeVenta(total);

  const nota = (dif: number | null, monto: number) => (
    <small className="dodo-nota" data-alerta={hayDiferencia(dif) ? "difiere" : undefined}>
      Dodo MX: {pesos(monto)}
      {hayDiferencia(dif) && dif !== null && <> · Diferencia {conSigno(dif)}</>}
    </small>
  );

  return (
    <section className="seccion" aria-labelledby="t-ventas">
      <h2 id="t-ventas"><span className="paso">1</span>Ventas según Dodo IS</h2>
      {dodo && dodo.actualizado_en && <p className="saldo-nota">Ventas en Dodo MX a las {hora(dodo.actualizado_en)}</p>}
      {!dodo && !error && <p className="saldo-nota">Aún no hay ventas sincronizadas de hoy; se actualizan cada 20 min.</p>}
      {comparacion.tarjetaComoEfectivo && (
        <p className="aviso aviso-info">En Dodo IS se registró tarjeta como efectivo: la suma cuadra pero el reparto no. Captura lo de la terminal y avisa a caja.</p>
      )}
      <div className="rejilla rejilla-corta">
        <div className="campo">
          <label htmlFor="efectivo">Efectivo</label>
          <input id="efectivo" name="efectivo" type="number" inputMode="decimal" min="0" step="0.01" required value={efectivo} onChange={(e) => setEfectivo(e.target.value)} />
          {dodo && nota(comparacion.efectivo, dodo.efectivo)}
        </div>
        <div className="campo">
          <label htmlFor="tarjeta">Tarjeta</label>
          <input id="tarjeta" name="tarjeta" type="number" inputMode="decimal" min="0" step="0.01" required value={tarjeta} onChange={(e) => setTarjeta(e.target.value)} />
          {dodo && nota(comparacion.tarjeta, dodo.tarjeta)}
        </div>
        <div className="campo">
          <label htmlFor="app">App o pago en línea</label>
          <input id="app" name="app" type="number" inputMode="decimal" min="0" step="0.01" required value={app} onChange={(e) => setApp(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="rappi">Rappi</label>
          <input id="rappi" name="rappi" type="number" inputMode="decimal" min="0" step="0.01" required value={rappi} onChange={(e) => setRappi(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="descuentos">Descuentos otorgados</label>
          <input id="descuentos" name="descuentos" type="number" inputMode="decimal" min="0" step="0.01" required />
        </div>
        <div className="campo">
          <label htmlFor="transacciones">Transacciones</label>
          <input id="transacciones" name="transacciones" type="number" inputMode="numeric" min="0" step="1" required />
          {dodo && <small className="dodo-nota">Dodo MX: {dodo.pedidos} pedidos sin Rappi</small>}
        </div>
      </div>
      <p className="saldo-nota" aria-live="polite">Venta total {pesos(total)} · IVA {pesos(iva)} · Venta neta {pesos(redondear(total - iva))}</p>
    </section>
  );
}
