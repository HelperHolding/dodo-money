"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Información secundaria a un gesto, en lugar de un párrafo en pantalla: un botón (i) que abre un pop-up.
 * Con mouse abre al dejar el cursor 450 ms y cierra al salir con 180 ms de gracia; con toque o teclado, con el botón.
 * Esc, o tocar fuera, lo cierra. El texto es el mismo que antes estaba en pantalla.
 */
export function ConInfo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const zona = useRef<HTMLSpanElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const reloj = useRef<number | undefined>(undefined);

  const programar = (abrir: boolean, ms: number) => {
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setAbierto(abrir), ms);
  };

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { if (!zona.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { setAbierto(false); boton.current?.focus(); } };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);

  useEffect(() => () => window.clearTimeout(reloj.current), []);

  return (
    <span className="con-info" ref={zona}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") programar(true, 450); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") programar(false, 180); }}>
      <button ref={boton} type="button" className="con-info-boton" aria-label={`Qué significa: ${titulo}`}
        aria-expanded={abierto} aria-controls={id} onClick={() => { window.clearTimeout(reloj.current); setAbierto((a) => !a); }}>
        i
      </button>
      <span id={id} className="con-info-pop" role="dialog" aria-label={titulo} hidden={!abierto}>
        <strong>{titulo}</strong>
        {children}
      </span>
    </span>
  );
}
