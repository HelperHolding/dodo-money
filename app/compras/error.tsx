"use client";

/** Si algo no cargó, se dice claramente en lugar de mostrar datos incompletos. */
export default function ErrorCompras({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <div className="encabezado">
        <h1>No pudimos cargar Compras</h1>
        <p>
          Algunos datos no llegaron, así que no mostramos datos incompletos.
          Intenta de nuevo; si sigue pasando, busca el código {error.digest ?? "sin código"} en Vercel → Logs.
        </p>
      </div>
      <div className="acciones">
        <button className="boton" type="button" onClick={reset}>Intentar de nuevo</button>
      </div>
    </>
  );
}
