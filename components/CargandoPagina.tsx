/**
 * Lo que se ve mientras una página del servidor carga (app/<área>/loading.tsx): la forma de la página final
 * en gris, en lugar de una pantalla en blanco. Reserva el espacio para que nada brinque al llegar los datos.
 * "tablero" = título, fila de indicadores y gráficas; "lista" = título, filtros y una tabla.
 */
export function CargandoPagina({ variante = "lista" }: { variante?: "tablero" | "lista" }) {
  return (
    <div className="cargando-pagina" role="status" aria-live="polite" aria-busy="true">
      <span className="solo-lector">Cargando…</span>
      <div className="esqueleto esqueleto-titulo" />
      <div className="esqueleto esqueleto-linea" />
      {variante === "tablero" ? (
        <>
          <div className="esqueleto-fila">
            {[0, 1, 2, 3].map((i) => <div key={i} className="esqueleto esqueleto-tarjeta" />)}
          </div>
          <div className="esqueleto-fila esqueleto-fila-ancha">
            <div className="esqueleto esqueleto-bloque" />
            <div className="esqueleto esqueleto-bloque" />
          </div>
        </>
      ) : (
        <>
          <div className="esqueleto-fila esqueleto-filtros">
            {[0, 1, 2].map((i) => <div key={i} className="esqueleto esqueleto-campo" />)}
          </div>
          <div className="esqueleto esqueleto-tabla">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="esqueleto-renglon" />)}
          </div>
        </>
      )}
    </div>
  );
}
