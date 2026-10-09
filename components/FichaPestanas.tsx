"use client";

import { useId, useRef, useState, type ReactNode } from "react";

type Pestaña = { id: string; titulo: string; contenido: ReactNode };

export function FichaPestanas({ pestanas }: { pestanas: Pestaña[] }) {
  const [activa, setActiva] = useState(pestanas[0]?.id);
  const base = useId();
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  return <div className="ficha-cuaderno">
    <div className="ficha-pestanas" role="tablist" aria-label="Contenido del documento">
      {pestanas.map((p, i) => <button key={p.id} ref={el => { botones.current[i] = el; }} type="button" role="tab"
        id={`${base}-${p.id}-tab`} aria-controls={`${base}-${p.id}-panel`} aria-selected={activa === p.id}
        tabIndex={activa === p.id ? 0 : -1} onClick={() => setActiva(p.id)} onKeyDown={e => {
          let siguiente = i;
          if (e.key === "ArrowRight") siguiente = (i + 1) % pestanas.length;
          else if (e.key === "ArrowLeft") siguiente = (i - 1 + pestanas.length) % pestanas.length;
          else if (e.key === "Home") siguiente = 0;
          else if (e.key === "End") siguiente = pestanas.length - 1;
          else return;
          e.preventDefault(); setActiva(pestanas[siguiente].id); botones.current[siguiente]?.focus();
        }}>{p.titulo}</button>)}
    </div>
    {pestanas.map(p => <div key={p.id} role="tabpanel" id={`${base}-${p.id}-panel`} aria-labelledby={`${base}-${p.id}-tab`}
      hidden={activa !== p.id} tabIndex={0} className="ficha-panel">{p.contenido}</div>)}
  </div>;
}
