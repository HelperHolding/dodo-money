"use client";

import { useEffect, useRef } from "react";
import { Icono } from "@/components/Icono";

/**
 * Panel que sale por la derecha para ver el detalle o editar algo sin salir de la página.
 * Usa <dialog> nativo: atrapa el foco, cierra con Esc y regresa el foco al botón que lo abrió.
 */
export function Cajon({ abierto, alCerrar, titulo, antetitulo, pie, children }: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: React.ReactNode;
  antetitulo?: React.ReactNode;
  pie?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog ref={ref} className="cajon" aria-labelledby="cajon-titulo" onClose={alCerrar}
      onClick={(e) => { if (e.target === e.currentTarget) alCerrar(); }}>
      <div className="cajon-marco">
        <header className="cajon-cabecera">
          <div>
            {antetitulo && <p className="cajon-antetitulo">{antetitulo}</p>}
            <h2 id="cajon-titulo">{titulo}</h2>
          </div>
          <button type="button" className="boton-icono" onClick={alCerrar} aria-label="Cerrar">
            <Icono nombre="cerrar" tamano={20} />
          </button>
        </header>
        <div className="cajon-cuerpo">{abierto && children}</div>
        {pie && abierto && <footer className="cajon-pie">{pie}</footer>}
      </div>
    </dialog>
  );
}
