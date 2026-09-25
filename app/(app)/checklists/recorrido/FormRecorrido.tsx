"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { etiquetaHora } from "@/lib/franjas";
import type { PuntoChecklist } from "@/lib/tipos";
import { registrarRecorrido } from "./actions";

export type OpcionRecorrido = { checklistId: string; nombre: string; fecha: string; hora: number };

export function FormRecorrido({
  opciones, puntosPorChecklist,
}: { opciones: OpcionRecorrido[]; puntosPorChecklist: Record<string, PuntoChecklist[]> }) {
  const [indice, setIndice] = useState(0);
  const [respuestas, setRespuestas] = useState<Record<string, "si" | "no">>({});
  const opcion = opciones[indice];
  const puntos = puntosPorChecklist[opcion.checklistId] ?? [];
  const marcar = (id: string, valor: "si" | "no") => setRespuestas({ ...respuestas, [id]: valor });

  return (
    <form action={registrarRecorrido} className="formulario">
      <input type="hidden" name="checklist_id" value={opcion.checklistId} />
      <input type="hidden" name="franja" value={`${opcion.fecha}|${opcion.hora}`} />

      {opciones.length > 1 ? (
        <div className="campo">
          <label htmlFor="opcion">Hora del recorrido</label>
          <select id="opcion" value={indice} onChange={(e) => { setIndice(Number(e.target.value)); setRespuestas({}); }}>
            {opciones.map((o, i) => (
              <option key={`${o.checklistId}|${o.fecha}|${o.hora}`} value={i}>{o.nombre} · {etiquetaHora(o.hora)}</option>
            ))}
          </select>
        </div>
      ) : (
        <p><strong>{opcion.nombre} · {etiquetaHora(opcion.hora)}</strong></p>
      )}

      <ol className="puntos">
        {puntos.map((p) => {
          const detalle = p.detalle_por_hora?.[String(opcion.hora)];
          const valor = respuestas[p.id];
          return (
            <li key={p.id} className="punto">
              <fieldset className="campo">
                <legend className="etiqueta">{p.orden}. {p.texto}</legend>
                {detalle && <small>En esta hora revisa: {detalle}.</small>}
                <div className="si-no">
                  <label>
                    <input type="radio" name={`cumple_${p.id}`} value="si" required checked={valor === "si"} onChange={() => marcar(p.id, "si")} />
                    <span>Cumple</span>
                  </label>
                  <label>
                    <input type="radio" name={`cumple_${p.id}`} value="no" checked={valor === "no"} onChange={() => marcar(p.id, "no")} />
                    <span>No cumple</span>
                  </label>
                </div>
              </fieldset>
              {valor === "no" && (
                <div className="campo">
                  <label htmlFor={`comentario_${p.id}`}>¿Qué pasó?</label>
                  <textarea id={`comentario_${p.id}`} name={`comentario_${p.id}`} rows={2} required />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="acciones"><BotonEnviar>Guardar recorrido</BotonEnviar></div>
    </form>
  );
}
