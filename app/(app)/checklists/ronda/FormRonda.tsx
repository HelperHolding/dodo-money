"use client";

import { useState, type FormEvent } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { etiquetaHora, type Franja } from "@/lib/franjas";
import { zonaCompleta } from "@/lib/zonas";
import { FormPuntos } from "../FormPuntos";
import { registrarRonda } from "./actions";

export type ZonaRonda = { id: string; nombre: string; horas: number[]; puntos: { id: string; orden: number; texto: string }[] };

export function FormRonda({ franjas, zonas, registradas }: { franjas: Franja[]; zonas: ZonaRonda[]; registradas: string[] }) {
  const [indice, setIndice] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const franja = franjas[indice];
  const pendientes = zonas.filter((z) => z.horas.includes(franja.hora) && !registradas.includes(`${z.id}|${franja.fecha}|${franja.hora}`));

  // Antes de enviar: una zona empezada debe estar completa, para no perder lo que se escribió.
  function revisarAntes(e: FormEvent<HTMLFormElement>) {
    const datos = new FormData(e.currentTarget);
    const incompletas = pendientes.filter((z) => {
      const empleado = String(datos.get(`empleado_${z.id}`) ?? "");
      const respuestas = z.puntos.map((p) => {
        const v = datos.get(`${z.id}:cumple_${p.id}`);
        return { cumple: v === "si" ? true : v === "no" ? false : null, comentario: String(datos.get(`${z.id}:comentario_${p.id}`) ?? "") || null };
      });
      const tocada = empleado.trim() !== "" || respuestas.some((r) => r.cumple !== null);
      return tocada && !zonaCompleta(empleado, respuestas);
    });
    if (incompletas.length) {
      e.preventDefault();
      setAviso(`Completa el nombre y todos los puntos de: ${incompletas.map((z) => z.nombre).join(", ")}.`);
    } else setAviso(null);
  }

  return (
    <form action={registrarRonda} onSubmit={revisarAntes} className="formulario">
      <input type="hidden" name="franja" value={`${franja.fecha}|${franja.hora}`} />
      {franjas.length > 1 ? (
        <div className="campo">
          <label htmlFor="franja-ronda">Hora de la ronda</label>
          <select id="franja-ronda" value={indice} onChange={(e) => setIndice(Number(e.target.value))}>
            {franjas.map((f, i) => <option key={`${f.fecha}|${f.hora}`} value={i}>{etiquetaHora(f.hora)}</option>)}
          </select>
        </div>
      ) : (
        <p><strong>Ronda de las {etiquetaHora(franja.hora)}</strong></p>
      )}
      <p className="saldo-nota">Toca tu zona para abrirla. Cada zona se guarda por separado.</p>
      {!pendientes.length ? <p className="vacio">Todas las zonas de esta hora ya están registradas.</p> : pendientes.map((z) => (
        <details key={`${z.id}|${franja.hora}`} className="zona-plegable" open={pendientes.length === 1}>
          <summary><span className="zona-nombre">{z.nombre}</span><span className="saldo-nota">{z.puntos.length} puntos</span></summary>
          <div className="zona-cuerpo">
            <div className="campo">
              <label htmlFor={`empleado_${z.id}`}>¿Quién revisó?</label>
              <input id={`empleado_${z.id}`} name={`empleado_${z.id}`} autoComplete="off" placeholder="Nombre y apellido" />
            </div>
            <FormPuntos puntos={z.puntos} prefijo={`${z.id}:`} requerido={false} />
            <div className="acciones"><BotonEnviar>Guardar {z.nombre}</BotonEnviar></div>
          </div>
        </details>
      ))}
      {aviso && <p className="aviso aviso-error" role="alert">{aviso}</p>}
    </form>
  );
}
