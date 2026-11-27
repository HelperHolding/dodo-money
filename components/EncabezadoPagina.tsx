import { ConInfo } from "@/components/ConInfo";

/**
 * Título de cada página, compacto en una fila: la «D» oficial de Dodo, el h1 en mayúsculas (app/marca.css),
 * la línea de contexto (sucursal · periodo) y las acciones a la derecha (si no caben, bajan; en celular a todo lo ancho).
 * Las migas de pan y las pestañas del área ya las pone el Marco arriba, en una sola fila.
 * `info` es la explicación de la pantalla: va en el (i) junto al título en lugar de un párrafo fijo.
 */
export function EncabezadoPagina({ titulo, descripcion, info, acciones }: {
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  info?: React.ReactNode;
  acciones?: React.ReactNode;
}) {
  return (
    <header className="encabezado-pagina">
      <div className="encabezado-titulo">
        <img className="encabezado-marca" src="/marca/dodo-d-naranja.svg" alt="" width={30} height={31} />
        <h1>{titulo}</h1>
        {info && <ConInfo titulo={typeof titulo === "string" ? titulo : "Esta pantalla"}>{info}</ConInfo>}
      </div>
      {descripcion && <p className="encabezado-contexto">{descripcion}</p>}
      {acciones && <div className="encabezado-acciones">{acciones}</div>}
    </header>
  );
}
