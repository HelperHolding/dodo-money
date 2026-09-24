"use client";

export default function ErrorApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="pagina">
      <div className="encabezado">
        <h1>No pudimos cargar esta pantalla</h1>
        <p>
          Intenta de nuevo. Si vuelve a pasar, busca el código {error.digest ?? "sin código"} en Vercel →
          Deployments → Logs para ver el detalle.
        </p>
      </div>
      <div className="acciones">
        <button className="boton" type="button" onClick={reset}>Intentar de nuevo</button>
        <a className="boton" href="/login">Ir al inicio de sesión</a>
      </div>
    </main>
  );
}
