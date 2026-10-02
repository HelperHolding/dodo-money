"use client";

import { useState } from "react";
import { NOMBRE_ORIGEN, ORIGENES, type OrigenGasto } from "@/lib/gastos";

const AYUDA: Record<OrigenGasto, string> = {
  caja_chica: "Baja la caja chica y entra en la siguiente reposición.",
  boveda: "Baja la bóveda; el cierre del día lo descuenta. No se repone.",
  empleado: "Ninguna caja cambia: queda por reponer a esa persona.",
};

/** De dónde salió el dinero; si lo pagó un empleado, quién. */
export function CampoOrigen({ personas, yo }: { personas: { id: string; nombre: string }[]; yo: string }) {
  const [origen, setOrigen] = useState<OrigenGasto>("caja_chica");
  return (
    <>
      <div className="campo">
        <label htmlFor="origen">¿De dónde salió el dinero?</label>
        <select id="origen" name="origen" value={origen} onChange={(e) => setOrigen(e.target.value as OrigenGasto)}>
          {ORIGENES.map((o) => <option key={o} value={o}>{NOMBRE_ORIGEN[o]}</option>)}
        </select>
        <small>{AYUDA[origen]}</small>
      </div>
      {origen === "empleado" && (
        <div className="campo">
          <label htmlFor="pagado_por">¿Quién lo pagó?</label>
          <select id="pagado_por" name="pagado_por" defaultValue={yo} required>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
      )}
    </>
  );
}
