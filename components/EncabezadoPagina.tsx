/**
 * Título de cada página: h1, línea de contexto (sucursal · periodo) y acciones a la derecha
 * (en celular, debajo y a todo lo ancho). Las migas de pan ya las pone el Marco arriba.
 */
export function EncabezadoPagina({ titulo, descripcion, acciones }: {
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  acciones?: React.ReactNode;
}) {
  return (
    <header className="encabezado-pagina">
      <div className="encabezado">
        <h1>{titulo}</h1>
        {descripcion && <p>{descripcion}</p>}
      </div>
      {acciones && <div className="encabezado-acciones">{acciones}</div>}
    </header>
  );
}
