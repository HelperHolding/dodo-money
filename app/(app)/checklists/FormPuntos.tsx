"use client";

import { useState } from "react";

/** Lista de puntos con Cumple / No cumple; "No cumple" abre un comentario obligatorio. */
export function FormPuntos({
  puntos, prefijo = "", requerido,
}: { puntos: { id: string; orden: number; texto: string }[]; prefijo?: string; requerido: boolean }) {
  const [valores, setValores] = useState<Record<string, "si" | "no">>({});
  return (
    <>
    <div className="acciones">
      <button type="button" className="boton boton-secundario"
        onClick={() => setValores(Object.fromEntries(puntos.map((p) => [p.id, "si" as const])))}>
        Todo cumple
      </button>
      <span className="saldo-nota">Luego cambia solo lo que no cumple.</span>
    </div>
    <ol className="puntos">
      {puntos.map((p) => (
        <li key={p.id} className="punto">
          <fieldset className="campo">
            <legend className="etiqueta">{p.texto}</legend>
            <div className="si-no">
              <label>
                <input type="radio" name={`${prefijo}cumple_${p.id}`} value="si" required={requerido}
                  checked={valores[p.id] === "si"} onChange={() => setValores({ ...valores, [p.id]: "si" })} />
                <span>Cumple</span>
              </label>
              <label>
                <input type="radio" name={`${prefijo}cumple_${p.id}`} value="no"
                  checked={valores[p.id] === "no"} onChange={() => setValores({ ...valores, [p.id]: "no" })} />
                <span>No cumple</span>
              </label>
            </div>
          </fieldset>
          {valores[p.id] === "no" && (
            <div className="campo">
              <label htmlFor={`${prefijo}comentario_${p.id}`}>¿Qué pasó?</label>
              <textarea id={`${prefijo}comentario_${p.id}`} name={`${prefijo}comentario_${p.id}`} rows={2} required />
            </div>
          )}
        </li>
      ))}
    </ol>
    </>
  );
}
