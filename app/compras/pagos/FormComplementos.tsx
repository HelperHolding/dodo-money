"use client";

import { useActionState } from "react";
import { subirComplementos, type ResultadoComplementos } from "./acciones";

export function FormComplementos() {
  const [estado, enviar, pendiente] = useActionState<ResultadoComplementos | null, FormData>(subirComplementos, null);
  return (
    <form action={enviar} className="formulario">
      <div className="campo">
        <label htmlFor="complementos">XML de complementos de pago</label>
        <input id="complementos" name="archivos" type="file" accept=".xml" multiple required />
        <small>Los manda el proveedor después de cada pago a una factura PPD.</small>
      </div>
      {estado && (
        <ul style={{ listStyle: "none", paddingLeft: 0, display: "grid", gap: 8 }}>
          {estado.resultados.map((r, i) => (
            <li key={i} className={r.ok ? "aviso aviso-ok" : "aviso aviso-error"} style={{ overflowWrap: "anywhere" }}>
              {r.archivo && <strong>{r.archivo}: </strong>}{r.texto}
            </li>
          ))}
        </ul>
      )}
      <button className="boton boton-secundario" type="submit" disabled={pendiente}>{pendiente ? "Subiendo…" : "Subir complementos"}</button>
    </form>
  );
}
