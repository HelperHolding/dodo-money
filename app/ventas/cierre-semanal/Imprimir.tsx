"use client";

/** Imprime la página; el CSS deja solo el cierre en carta horizontal (`@page cierre-semanal`). */
export function Imprimir() {
  return <button type="button" className="boton boton-secundario boton-compacto no-imprimir" onClick={() => window.print()}>Imprimir / PDF</button>;
}
