"use client";

import { useState } from "react";
import { pesos } from "@/lib/formato";

/**
 * Campo de efectivo contado con la diferencia contra lo esperado a la vista mientras se escribe.
 * Solo muestra la resta; el cierre la vuelve a calcular y la guarda al enviar.
 */
export function CampoContado({ id, texto, esperado, ayuda }: { id: string; texto: string; esperado: number; ayuda?: string }) {
  const [valor, setValor] = useState("");
  const diferencia = valor === "" ? null : Math.round((Number(valor) - esperado) * 100) / 100;
  const estado = diferencia === null ? undefined : diferencia === 0 ? "cuadra" : "difiere";
  return (
    <div className="campo campo-contado" data-estado={estado}>
      <label htmlFor={id}>{texto}</label>
      <input id={id} name={id} type="number" inputMode="decimal" min="0" step="0.01" required value={valor} onChange={(e) => setValor(e.target.value)} />
      {ayuda && <small>{ayuda}</small>}
      <p className="campo-contado-diferencia" aria-live="polite">
        {diferencia === null ? <>Debe haber {pesos(esperado)}</> : diferencia === 0 ? <>Cuadra con {pesos(esperado)}</> : <>{diferencia > 0 ? "Sobran" : "Faltan"} {pesos(Math.abs(diferencia))}</>}
      </p>
    </div>
  );
}
