import { ConInfo } from "@/components/ConInfo";

/**
 * Título de cada página: la «D» oficial de Dodo y el h1 en mayúsculas (app/marca.css). Debajo, la línea de
 * contexto (sucursal · periodo) y las acciones a la derecha (en celular, debajo y a todo lo ancho).
 * Las migas de pan ya las pone el Marco arriba.
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
        <img className="encabezado-marca" src="/marca/dodo-d-naranja.svg" alt="" width={48} height={50} />
        <h1>{titulo}</h1>
        {info && <ConInfo titulo={typeof titulo === "string" ? titulo : "Esta pantalla"}>{info}</ConInfo>}
      </div>
      {(descripcion || acciones) && (
        <div className="encabezado-vitrina">
          {descripcion && <p>{descripcion}</p>}
          {acciones && <div className="encabezado-acciones">{acciones}</div>}
        </div>
      )}
    </header>
  );
}
