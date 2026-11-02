import { ConInfo } from "@/components/ConInfo";

/**
 * Título de cada página como letrero de la sucursal: la «D» amarilla y el h1 en letras de canal sobre el muro
 * (app/sucursal.css). Debajo, en cristal, la línea de contexto (sucursal · periodo) y las acciones a la derecha
 * (en celular, debajo y a todo lo ancho). Las migas de pan ya las pone el Marco arriba.
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
      <div className="letrero">
        <span className="figura-dodo" aria-hidden="true">
          <span className="figura-cara"><img src="/dodo-figura.png" alt="" width={160} height={160} /></span>
        </span>
        {/* data-texto alimenta la capa de textura de luz; solo existe cuando el título es texto */}
        <h1 data-texto={typeof titulo === "string" ? titulo : undefined}>{titulo}</h1>
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
