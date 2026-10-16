"use client";

import { Icono } from "@/components/Icono";

/**
 * Pantalla de error de un área (app/<área>/error.tsx): dice qué no cargó, da el código para buscarlo en Vercel
 * y un botón para intentar de nuevo. No muestra datos a medias.
 */
export function ErrorPagina({ titulo, descripcion, error, reset }: {
  titulo: string;
  descripcion?: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="error-pagina" role="alert">
      <Icono nombre="alerta" tamano={36} />
      <h1>{titulo}</h1>
      <p>{descripcion ?? "Algo no cargó bien. No mostramos datos a medias."}</p>
      <p className="saldo-nota">Si sigue pasando, comparte este código con quien administra la app: <code>{error.digest ?? "sin código"}</code> (Vercel → Logs).</p>
      <div className="acciones">
        <button className="boton" type="button" onClick={reset}>Intentar de nuevo</button>
      </div>
    </section>
  );
}
