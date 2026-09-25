"use client";

/** Si algún dato no cargó, se dice claramente en lugar de mostrar una tabla con ceros que parezca "todo en orden". */
export default function ErrorCorporativo({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <div className="encabezado">
        <h1>No pudimos cargar la vista general</h1>
        <p>
          Algunos datos no llegaron, así que no mostramos la tabla para no dar una imagen equivocada.
          Intenta de nuevo; si sigue pasando, busca el código {error.digest ?? "sin código"} en Vercel → Logs.
        </p>
      </div>
      <div className="acciones">
        <button className="boton" type="button" onClick={reset}>Intentar de nuevo</button>
      </div>
    </>
  );
}
