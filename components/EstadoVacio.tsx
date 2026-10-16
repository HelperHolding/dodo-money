import { Icono, type NombreIcono } from "@/components/Icono";

/** Cuando una sección no tiene datos: qué falta y, si se puede, la acción que lo resuelve. */
export function EstadoVacio({ titulo, descripcion, accion, icono = "bandeja" }: {
  titulo: string;
  descripcion?: React.ReactNode;
  accion?: React.ReactNode;
  icono?: NombreIcono;
}) {
  return (
    <section className="estado-vacio">
      <Icono nombre={icono} tamano={36} />
      <h2>{titulo}</h2>
      {descripcion && <p>{descripcion}</p>}
      {accion && <div className="acciones">{accion}</div>}
    </section>
  );
}
