"use client";

import { useEffect, useState } from "react";

/**
 * Interruptor sol / luna del modo noche. El modo vive en <html data-luz> y en localStorage (solo este navegador);
 * app/layout.tsx lo aplica antes de pintar para que no parpadee. Al apagar la luz del local, las tiras LED
 * y el letrero se encienden con su parpadeo (salvo con movimiento reducido).
 */
export function InterruptorLuz() {
  const [noche, setNoche] = useState(false);
  useEffect(() => { setNoche(document.documentElement.dataset.luz === "noche"); }, []);

  const alternar = () => {
    const html = document.documentElement;
    const nueva = !noche;
    html.dataset.luz = nueva ? "noche" : "dia";
    try { localStorage.setItem("luz", html.dataset.luz); } catch { /* sin almacenamiento: solo esta visita */ }
    if (nueva && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      delete html.dataset.encender;
      void html.offsetWidth;
      html.dataset.encender = "";
      window.setTimeout(() => { delete html.dataset.encender; }, 2200);
    }
    setNoche(nueva);
  };

  return (
    <button type="button" className="interruptor-luz" aria-pressed={noche} aria-label="Modo noche" onClick={alternar}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <span className="interruptor-luz-riel" />
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      </svg>
    </button>
  );
}
