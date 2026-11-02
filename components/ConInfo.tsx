"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * Información secundaria a un gesto, en lugar de un párrafo en pantalla: un botón (i) que abre un pop-up.
 * Con mouse abre al dejar el cursor 450 ms y cierra al salir con 180 ms de gracia; con toque o teclado, con el botón.
 * Esc, o tocar fuera, lo cierra. El texto es el mismo que antes estaba en pantalla.
 * Con `etiqueta`, el botón muestra el (i) y un texto corto («Cómo leer esto») para notas al pie de una tabla o gráfica.
 *
 * El pop-up se abre en la capa superior del navegador (atributo popover), así ninguna tarjeta de cristal lo tapa;
 * se coloca junto al botón (abajo, o arriba si no cabe) y se recoloca al desplazar o cambiar el tamaño.
 */
export function ConInfo({ titulo, etiqueta, children }: { titulo: string; etiqueta?: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const zona = useRef<HTMLSpanElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const reloj = useRef<number | undefined>(undefined);

  const programar = (abrir: boolean, ms: number) => {
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setAbierto(abrir), ms);
  };

  // Mostrar u ocultar en la capa superior y colocar junto al botón
  useLayoutEffect(() => {
    const p = pop.current, b = boton.current;
    if (!p || !b) return;
    if (!abierto) { if (p.matches(":popover-open")) p.hidePopover(); return; }
    if (!p.matches(":popover-open")) p.showPopover();
    const colocar = () => {
      const r = b.getBoundingClientRect(), ancho = p.offsetWidth, alto = p.offsetHeight, margen = 8;
      const izquierda = Math.min(Math.max(margen, r.left), window.innerWidth - ancho - margen);
      const abajo = r.bottom + 10;
      const arriba = abajo + alto > window.innerHeight - margen && r.top - alto - 10 > margen;
      p.style.left = `${izquierda}px`;
      p.style.top = `${arriba ? r.top - alto - 10 : abajo}px`;
    };
    colocar();
    window.addEventListener("scroll", colocar, true);
    window.addEventListener("resize", colocar);
    return () => { window.removeEventListener("scroll", colocar, true); window.removeEventListener("resize", colocar); };
  }, [abierto]);

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
      <button ref={boton} type="button" className={etiqueta ? "con-info-boton con-info-etiqueta" : "con-info-boton"}
        aria-label={etiqueta ? undefined : `Qué significa: ${titulo}`}
        aria-expanded={abierto} aria-controls={id} onClick={() => { window.clearTimeout(reloj.current); setAbierto((a) => !a); }}>
        {etiqueta ? <><span className="con-info-i" aria-hidden="true">i</span>{etiqueta}</> : "i"}
      </button>
      <span ref={pop} id={id} className="con-info-pop" role="dialog" aria-label={titulo} popover="manual">
        <strong>{titulo}</strong>
        {children}
      </span>
    </span>
  );
}
