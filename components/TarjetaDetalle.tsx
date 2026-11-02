/**
 * Detalle del tablero de Ventas siempre abierto: título, su dato clave en una pastilla (en rojo si hay alerta) y el
 * contenido debajo. `ancho` lo acomoda en la rejilla del tablero: "doble" ocupa dos columnas y "completo" todo el renglón.
 * `insignia` va junto al título (p. ej. el aviso de productos sin costo, que abre su propio recuadro).
 */
export function TarjetaDetalle({ id, titulo, resumen, alerta = false, insignia, ancho, children }: {
  id: string; titulo: string; resumen: string; alerta?: boolean; insignia?: React.ReactNode;
  ancho?: "doble" | "completo"; children: React.ReactNode;
}) {
  return (
    <section className={`seccion detalle-tarjeta${ancho ? ` detalle-${ancho}` : ""}`} aria-labelledby={id}>
      <div className="seccion-cabecera detalle-cabecera">
        <span className="plegable-titulo">
          <h2 id={id}>{titulo}</h2>
          {insignia && <span className="plegable-insignia">{insignia}</span>}
        </span>
        <span className="plegable-resumen" data-alerta={alerta ? "si" : undefined}>{resumen}</span>
      </div>
      <div className="plegable-cuerpo">{children}</div>
    </section>
  );
}
