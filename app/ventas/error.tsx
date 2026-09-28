"use client";

/** Si algo no cargó, se dice claramente en lugar de mostrar reportes incompletos. */
export default function ErrorVentas({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <div className="encabezado">
        <h1>No pudimos cargar las ventas</h1>
        <p>
          Algunos datos no llegaron, así que no mostramos reportes incompletos.
          Intenta de nuevo; si sigue pasando, busca el código {error.digest ?? "sin código"} en Vercel → Logs.
        </p>
      </div>
      <div className="acciones">
        <button className="boton" type="button" onClick={reset}>Intentar de nuevo</button>
      </div>
    </>
  );
}
