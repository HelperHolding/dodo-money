import Link from "next/link";
import { AnilloAvance } from "@/components/AnilloAvance";
import { Icono, type NombreIcono } from "@/components/Icono";

/**
 * Una tarea del día en el resumen de checklists: avance, lo que falta en una línea, el botón para registrar
 * (grande, para el dedo) y el detalle por hora plegado.
 */
export function TareaDia({ id, titulo, icono, avance, resumen, alerta = false, accion, children }: {
  id: string;
  titulo: string;
  icono: NombreIcono;
  avance?: { hechas: number; total: number };
  resumen: React.ReactNode;
  alerta?: boolean;
  accion?: { href: string; texto: string } | null;
  children?: React.ReactNode;
}) {
  return (
    <article className="tarea" id={id} data-alerta={alerta ? "si" : undefined} aria-labelledby={`${id}-titulo`}>
      <header className="tarea-cabecera">
        {avance && avance.total > 0
          ? <AnilloAvance hechas={avance.hechas} total={avance.total} alerta={alerta} etiqueta={`${titulo}: avance`} />
          : <span className="tarea-icono"><Icono nombre={icono} tamano={24} /></span>}
        <div>
          <h2 id={`${id}-titulo`}>{titulo}</h2>
          <p>{alerta && <Icono nombre="alerta" etiqueta="Por revisar" />}{resumen}</p>
        </div>
      </header>
      {accion && <Link className="boton tarea-accion" href={accion.href}>{accion.texto}<Icono nombre="derecha" /></Link>}
      {children && (
        <details className="tarea-detalle">
          <summary>Ver detalle</summary>
          <div>{children}</div>
        </details>
      )}
    </article>
  );
}
