"use client";

import { useEffect, useState } from "react";
import { Avance } from "@/components/Avance";

/**
 * Sección que en celular empieza plegada, con su resumen visible; en pantallas grandes empieza abierta.
 * `insignia` va junto al título (p. ej. un aviso que abre su propio recuadro).
 */
export function Plegable({
  id, titulo, resumen, alerta = false, insignia, children, forzarAbierto=false, avance,
}: {
  id: string; titulo: string; resumen: string; alerta?: boolean; insignia?: React.ReactNode; children: React.ReactNode; forzarAbierto?:boolean;
  /** Barra delgada de avance bajo el título (p. ej. horas registradas de la ronda). */
  avance?: { hechas: number; total: number };
}) {
  const [abierto, setAbierto] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) setAbierto(false);
  }, []);
  return (
    <section className="seccion plegable" aria-labelledby={id}>
      <details open={forzarAbierto||abierto} onToggle={(e) => setAbierto(e.currentTarget.open)}>
        <summary>
          <span className="plegable-titulo">
            <h2 id={id}>{titulo}</h2>
            {insignia && <span className="plegable-insignia">{insignia}</span>}
          </span>
          <span className="plegable-resumen" data-alerta={alerta ? "si" : undefined}>{resumen}</span>
          {avance && avance.total > 0 && <span className="plegable-avance"><Avance etiqueta={titulo} hechas={avance.hechas} total={avance.total} alerta={alerta} compacta /></span>}
        </summary>
        <div className="plegable-cuerpo">{children}</div>
      </details>
    </section>
  );
}
